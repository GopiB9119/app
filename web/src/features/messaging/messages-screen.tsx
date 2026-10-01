"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, LoaderCircle, LockKeyhole, MessageSquare, RefreshCw, Send, Trash2, UserRound, UsersRound } from "lucide-react";

import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { subscribeLive, useLiveConnected } from "@/features/realtime/live";
import { readMembers, spacesSchema } from "@/features/spaces/client";
import {
  MAX_MESSAGE_CHARACTERS, bodyProblem, conversationPage, deleteMessage, markRead, mergeMessages, messagePage,
  normalizeBody, openConversation, readConversation, sendMessage,
} from "./client";
import type { Conversation, Message, SendIntent } from "./client";
import styles from "./messages.module.css";

type Pending = SendIntent & { state: "sending" | "unknown" | "failed"; error?: string };
const POLL_MILLISECONDS = 5000;
// While the live connection is up it announces changes, so the timers only catch a lost hint.
const LIVE_POLL_MILLISECONDS = 30000;
const LIVE_LIST_MILLISECONDS = 60000;
const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// Browser-only: written from event handlers, never during server rendering, and cleared by the full reload on sign-out.
const pendingSends = new Map<string, Pending[]>();
const pendingListeners = new Set<() => void>();
const noPending: Pending[] = [];
let pendingVersion = 0;
let guardingUnload = false;

function pendingKey(accountId: string, conversationId: string) {
  return `${accountId}:${conversationId}`;
}

function readPending(accountId: string, conversationId: string) {
  return pendingSends.get(pendingKey(accountId, conversationId)) ?? noPending;
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
}

function updatePending(accountId: string, conversationId: string, change: (current: Pending[]) => Pending[]) {
  const key = pendingKey(accountId, conversationId);
  const next = change(pendingSends.get(key) ?? noPending);
  if (next.length) pendingSends.set(key, next); else pendingSends.delete(key);
  const guard = [...pendingSends.values()].some(items => items.some(item => item.state !== "failed"));
  if (guard !== guardingUnload) {
    guardingUnload = guard;
    if (guard) window.addEventListener("beforeunload", warnBeforeUnload);
    else window.removeEventListener("beforeunload", warnBeforeUnload);
  }
  pendingVersion += 1;
  pendingListeners.forEach(listener => listener());
}

function subscribePending(listener: () => void) {
  pendingListeners.add(listener);
  return () => { pendingListeners.delete(listener); };
}

function usePendingVersion() {
  return useSyncExternalStore(subscribePending, () => pendingVersion, () => 0);
}

function pendingLabel(accountId: string, conversationId: string) {
  const waiting = readPending(accountId, conversationId);
  if (waiting.some(item => item.state === "unknown")) return "Not confirmed";
  if (waiting.some(item => item.state === "failed")) return "Not sent";
  return null;
}

function sessionLost(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED");
}

export function MessagesScreen({ initialSpaceId }: { initialSpaceId: string }) {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) window.location.replace("/login");
  }, [profile.error]);
  if (profile.isPending) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading messages</main></Shell>;
  }
  if (!profile.data || profile.isError) {
    return <Shell account><main className={styles.main}><h1>Messages unavailable</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />Retry</button></main></Shell>;
  }
  return <Messaging key={profile.data.data.id} user={profile.data.data} initialSpaceId={initialSpaceId} />;
}

function Messaging({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const autoOpened = useRef(false);
  const live = useLiveConnected();
  usePendingVersion();
  const conversations = useInfiniteQuery({
    queryKey: ["conversations", user.id],
    queryFn: ({ pageParam, signal }) => conversationPage(user.id, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.pagination.next_cursor,
    refetchInterval: live ? LIVE_LIST_MILLISECONDS : POLL_MILLISECONDS * 3,
    networkMode: "always",
  });
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  const members = useQuery({
    queryKey: ["members", user.id, spaceId],
    queryFn: ({ signal }) => readMembers(user.id, spaceId, signal),
    enabled: Boolean(spaceId) && spaces.data?.data.some(space => space.id === spaceId && space.space_type === "family") === true,
  });
  const open = useMutation({
    mutationFn: ({ space, participant }: { space: string; participant?: string }) => openConversation(user.id, space, participant),
    onSuccess: async conversation => {
      setSelected(conversation);
      await queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
    },
  });
  const problem = conversations.error ?? spaces.error ?? open.error ?? members.error;
  const refreshList = useCallback(() => { void queryClient.invalidateQueries({ queryKey: ["conversations", user.id] }); }, [queryClient, user.id]);
  useEffect(() => {
    if (sessionLost(problem)) {
      queryClient.clear();
      window.location.replace((problem as ApiError).status === 401 ? "/login" : "/app/messages");
    }
  }, [problem, queryClient]);
  useEffect(() => {
    if (!initialSpaceId || autoOpened.current || !spaces.data) return;
    autoOpened.current = true;
    if (spaces.data.data.some(space => space.id === initialSpaceId)) open.mutate({ space: initialSpaceId });
  }, [initialSpaceId, spaces.data, open]);

  const items = conversations.data?.pages.flatMap(page => page.data) ?? [];
  const unread = conversations.data?.pages[0]?.unreadCount ?? 0;
  const lost = sessionLost(problem);
  return <Shell account>
    <main className={styles.main}>
      <nav className={styles.navigation} aria-label="Workspace">
        <Link href="/app/settings/account"><UserRound size={18} aria-hidden />Account</Link>
        <Link href="/app/spaces"><UsersRound size={18} aria-hidden />Spaces</Link>
        <Link href="/app/tasks"><ClipboardList size={18} aria-hidden />Tasks</Link>
        <span aria-current="page"><MessageSquare size={18} aria-hidden />Messages</span>
      </nav>
      <div className={styles.layout} data-open={selected ? "conversation" : "list"}>
        <section className={styles.sidebar} aria-labelledby="conversations-title">
          <div className={styles.sectionHeading}>
            <h1 id="conversations-title">Messages</h1>
            {unread > 0 && <span className={styles.badge} aria-label={`${unread} unread messages`}>{unread}</span>}
            <button className="icon-button" title="Refresh conversations" aria-label="Refresh conversations" disabled={conversations.isFetching} onClick={() => conversations.refetch()}>
              <RefreshCw size={18} className={conversations.isFetching ? "spin" : ""} aria-hidden />
            </button>
          </div>
          <form className={styles.start} onSubmit={event => { event.preventDefault(); if (spaceId) open.mutate({ space: spaceId }); }}>
            <label>
              <span id="chat-space-label">Space</span>
              <select aria-labelledby="chat-space-label" value={spaceId} disabled={open.isPending || lost} onChange={event => { setSpaceId(event.target.value); open.reset(); }}>
                <option value="">Choose a Space</option>
                {spaces.data?.data.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
              </select>
            </label>
            <button className="secondary-button" type="submit" disabled={!spaceId || open.isPending || lost}>
              {open.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UsersRound size={17} aria-hidden />}Open Space chat
            </button>
            {members.data && members.data.length > 1 && <div className={styles.memberChoices} aria-label="Direct message a member">
              {members.data.filter(member => member.account_id !== user.id).map(member => (
                <button key={member.account_id} type="button" className="text-button" disabled={open.isPending || lost} onClick={() => open.mutate({ space: spaceId, participant: member.account_id })}>
                  <MessageSquare size={16} aria-hidden />Message {member.display_name}
                </button>
              ))}
            </div>}
            {open.isError && !lost && <div className="message error" role="alert">{open.error.message}</div>}
          </form>
          {conversations.isPending && <p role="status" aria-busy="true">Loading conversations...</p>}
          {conversations.isError && !lost && <div className="message error" role="alert">{conversations.error.message}<button className="text-button" onClick={() => conversations.refetch()}><RefreshCw size={16} aria-hidden />Retry</button></div>}
          {!conversations.isPending && !conversations.isError && items.length === 0 && <p className={styles.emptyNote}>No conversations yet. Open your Space chat to start.</p>}
          {!conversations.isError && !lost && <ul className={styles.conversationList}>
            {items.map(item => { const waiting = pendingLabel(user.id, item.id); return <li key={item.id}>
              <button type="button" aria-current={selected?.id === item.id ? "true" : undefined} onClick={() => setSelected(item)}>
                <span className={styles.conversationMark} aria-hidden>{item.kind === "space" ? <UsersRound size={20} /> : <MessageSquare size={20} />}</span>
                <span className={styles.conversationIdentity}>
                  <strong>{item.title}</strong>
                  <span>{item.kind === "space" ? "Space chat" : `Direct / ${item.space_name}`}{item.last_message_at ? ` / ${time.format(new Date(item.last_message_at))}` : ""}</span>
                </span>
                {waiting && <span className={styles.unconfirmed}>{waiting}</span>}
                {item.unread_count > 0 && <span className={styles.badge} aria-label={`${item.unread_count} unread`}>{item.unread_count}</span>}
              </button>
            </li>; })}
          </ul>}
          {conversations.hasNextPage && <button className="text-button" disabled={conversations.isFetchingNextPage} onClick={() => conversations.fetchNextPage()}>Load more conversations</button>}
        </section>
        <section className={styles.chat} aria-label="Conversation">
          {selected && !lost
            ? <ConversationPane key={`${user.id}:${selected.id}`} user={user} initial={selected} onBack={() => setSelected(null)} onChanged={refreshList} />
            : <div className={styles.placeholder}><MessageSquare size={32} strokeWidth={1.5} aria-hidden /><p>Choose a conversation.</p></div>}
        </section>
      </div>
    </main>
  </Shell>;
}

function ConversationPane({ user, initial, onBack, onChanged }: { user: Account; initial: Conversation; onBack: () => void; onChanged: () => void }) {
  const [conversation, setConversation] = useState(initial);
  const [items, setItems] = useState<Message[]>([]);
  const [earlier, setEarlier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState("");
  usePendingVersion();
  const pending = readPending(user.id, initial.id);
  const setPending = useCallback((change: (current: Pending[]) => Pending[]) => updatePending(user.id, initial.id, change), [user.id, initial.id]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const markedThrough = useRef(Number(initial.read_position));
  const itemsRef = useRef<Message[]>([]);
  const endRef = useRef<HTMLLIElement | null>(null);
  const runPoll = useRef<(first: boolean, queue?: boolean) => void>(() => undefined);
  const live = useLiveConnected();
  const conversationId = initial.id;

  const fail = useCallback((problem: unknown) => {
    if (sessionLost(problem)) {
      window.location.replace((problem as ApiError).status === 401 ? "/login" : "/app/messages");
      return;
    }
    if (problem instanceof ApiError && problem.status === 404) {
      setDenied(true);
      setItems([]);
      itemsRef.current = [];
      setPending(() => []);
      onChanged();
    }
    setError(problem instanceof Error ? problem.message : "Messages could not be loaded.");
  }, [onChanged, setPending]);

  const absorb = useCallback((incoming: Message[]) => {
    const merged = mergeMessages(itemsRef.current, incoming);
    itemsRef.current = merged;
    setItems(merged);
    const confirmed = new Set(incoming.filter(item => item.mine).map(item => item.client_message_id));
    setPending(current => current.filter(item => !(confirmed.has(item.key) && item.state !== "sending")));
  }, [setPending]);

  const poll = useCallback(async (signal: AbortSignal, first: boolean) => {
    try {
      const [view, latest] = await Promise.all([readConversation(user.id, conversationId, signal), messagePage(user.id, conversationId, { signal })]);
      const known = itemsRef.current.length ? Number(itemsRef.current[itemsRef.current.length - 1].position) : null;
      let incoming = latest.data;
      // More messages than one page may have arrived since the previous poll; fetch the gap forward. Until the gap is
      // closed, only messages that follow on without a hole are shown, so none is skipped or marked read unseen.
      if (known !== null && latest.data.length && Number(latest.data[0].position) > known + 1) {
        const gap: Message[] = [];
        let after = String(known);
        let closed = false;
        for (let page = 0; page < 10 && !closed; page += 1) {
          const next = await messagePage(user.id, conversationId, { after, signal });
          gap.push(...next.data);
          const joined = gap.length > 0 && Number(gap[gap.length - 1].position) >= Number(latest.data[0].position) - 1;
          if (joined || !next.pagination.has_more || !next.pagination.next_cursor) closed = true;
          else after = next.pagination.next_cursor;
        }
        incoming = closed ? [...gap, ...latest.data] : gap;
      }
      setConversation(view);
      absorb(incoming);
      if (first) setEarlier(latest.pagination.has_more ? latest.pagination.next_cursor : null);
      setError("");
      const newest = itemsRef.current.length ? Number(itemsRef.current[itemsRef.current.length - 1].position) : 0;
      if (document.visibilityState === "visible" && newest > Math.max(markedThrough.current, Number(view.read_position))) {
        const previous = markedThrough.current;
        markedThrough.current = newest;
        try {
          const read = await markRead(user.id, conversationId, String(newest));
          setConversation(read);
          onChanged();
        } catch (problem) {
          markedThrough.current = previous;
          throw problem;
        }
      }
    } catch (problem) {
      if (problem instanceof DOMException && problem.name === "AbortError") return;
      fail(problem);
    } finally {
      if (first) setLoading(false);
    }
  }, [absorb, conversationId, fail, onChanged, user.id]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    // One poll at a time, so a slow response cannot overwrite a newer one; a hint during a poll runs one more after it.
    let running = false;
    let again = false;
    const run = (first: boolean, queue = false) => {
      if (!active) return;
      if (running) { again ||= queue; return; }
      running = true;
      void poll(controller.signal, first).finally(() => {
        running = false;
        if (again) { again = false; run(false); }
      });
    };
    runPoll.current = run;
    run(true);
    const unsubscribe = subscribeLive(event => {
      if (event.accountId !== user.id) return;
      if (event.kind === "resync" || (event.kind === "conversation" && event.conversation_id === conversationId)) run(false, true);
    });
    return () => { active = false; runPoll.current = () => undefined; unsubscribe(); controller.abort(); };
  }, [poll, conversationId, user.id]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") runPoll.current(false); }, live ? LIVE_POLL_MILLISECONDS : POLL_MILLISECONDS);
    return () => window.clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (!draft.trim()) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  const newestId = items.length ? items[items.length - 1].id : "";
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [newestId, pending.length]);

  async function deliver(intent: SendIntent) {
    setPending(current => [...current.filter(item => item.key !== intent.key), { ...intent, state: "sending" }]);
    try {
      const message = await sendMessage(intent);
      absorb([message]);
      setPending(current => current.filter(item => item.key !== intent.key));
      onChanged();
    } catch (problem) {
      if (sessionLost(problem) || (problem instanceof ApiError && problem.status === 404)) { fail(problem); return; }
      const definite = problem instanceof ApiError && problem.status >= 400 && problem.status < 500 && problem.status !== 408;
      setPending(current => current.map(item => item.key === intent.key
        ? { ...item, state: definite ? "failed" : "unknown", error: problem instanceof Error ? problem.message : "The message was not confirmed." }
        : item));
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bodyProblem(draft) || !conversation.can_send || denied) return;
    const intent = { accountId: user.id, conversationId, key: crypto.randomUUID(), body: normalizeBody(draft) };
    setDraft("");
    void deliver(intent);
  }

  async function loadEarlier() {
    if (!earlier) return;
    setLoadingEarlier(true);
    try {
      const page = await messagePage(user.id, conversationId, { before: earlier });
      absorb(page.data);
      setEarlier(page.pagination.has_more ? page.pagination.next_cursor : null);
    } catch (problem) { fail(problem); } finally { setLoadingEarlier(false); }
  }

  async function remove(message: Message) {
    setDeleting(message.id);
    setConfirmDelete(null);
    try { absorb([await deleteMessage(user.id, conversationId, message.id)]); onChanged(); }
    catch (problem) { fail(problem); }
    finally { setDeleting(null); }
  }

  const problem = draft ? bodyProblem(draft) : null;
  const characters = [...normalizeBody(draft)].length;
  return <div className={styles.pane}>
    <header className={styles.chatHeader}>
      <button className={`icon-button ${styles.back}`} aria-label="Back to conversations" title="Back to conversations" onClick={onBack}><ArrowLeft size={19} aria-hidden /></button>
      <div className={styles.chatTitle}>
        <h2>{conversation.title}</h2>
        <span>{conversation.kind === "space" ? "Space chat" : "Direct conversation"} / {conversation.space_name}</span>
      </div>
    </header>
    <p className={styles.protection}><LockKeyhole size={15} aria-hidden />Encrypted at rest on the server. Not end-to-end encrypted.</p>
    {conversation.kind === "space" && <p className={styles.historyNote}>You see messages sent since your current membership began.</p>}
    {error && <div className="message error" role="alert">{error}</div>}
    {denied ? <p className={styles.emptyNote}>You no longer have access to this conversation.</p> : <>
      {earlier && <button className="text-button" disabled={loadingEarlier} onClick={loadEarlier}>{loadingEarlier ? "Loading..." : "Load earlier messages"}</button>}
      {loading && <p role="status" aria-busy="true">Loading messages...</p>}
      {!loading && items.length === 0 && pending.length === 0 && <p className={styles.emptyNote}>No messages yet.</p>}
      <ol className={styles.messages} aria-live="polite" aria-relevant="additions">
        {items.map(message => <li key={message.id} className={message.mine ? styles.mine : undefined}>
          <div className={styles.bubble}>
            <span className={styles.meta}><strong>{message.mine ? "You" : message.sender_name}</strong> <time dateTime={message.created_at}>{time.format(new Date(message.created_at))}</time></span>
            {message.status === "sent" && <p className={styles.body}>{message.body}</p>}
            {message.status === "deleted" && <p className={styles.removed}>Message deleted</p>}
            {message.status === "unavailable" && <p className={styles.removed}>This message cannot be shown.</p>}
            {message.mine && message.status === "sent" && confirmDelete !== message.id && (
              <button className={`icon-button ${styles.deleteButton}`} aria-label="Delete message for everyone" title="Delete for everyone" disabled={deleting !== null} onClick={() => setConfirmDelete(message.id)}><Trash2 size={16} aria-hidden /></button>
            )}
            {confirmDelete === message.id && <div className={styles.confirm} role="group" aria-label="Confirm deletion">
              <span>Delete for everyone? Copies already seen cannot be recalled.</span>
              <button className="secondary-button" onClick={() => remove(message)}>Delete</button>
              <button className="text-button" onClick={() => setConfirmDelete(null)}>Keep</button>
            </div>}
          </div>
        </li>)}
        {pending.map(item => <li key={item.key} className={styles.mine}>
          <div className={`${styles.bubble} ${styles.pendingBubble}`}>
            <p className={styles.body}>{item.body}</p>
            {item.state === "sending" && <span className={styles.meta}><LoaderCircle size={14} className="spin" aria-hidden />Sending...</span>}
            {item.state === "unknown" && <div className={styles.confirm} role="alert">
              <span>Not confirmed. Retry sends this same message once.</span>
              <button className="secondary-button" onClick={() => deliver(item)}>Retry</button>
              <button className="text-button" onClick={() => { if (window.confirm("It may already have been sent. Stop tracking it?")) setPending(current => current.filter(entry => entry.key !== item.key)); }}>Stop tracking</button>
            </div>}
            {item.state === "failed" && <div className={styles.confirm} role="alert">
              <span>Not sent: {item.error}</span>
              <button className="text-button" onClick={() => { setDraft(item.body); setPending(current => current.filter(entry => entry.key !== item.key)); }}>Edit</button>
            </div>}
          </div>
        </li>)}
        <li ref={endRef} aria-hidden className={styles.end} />
      </ol>
      {conversation.can_send
        ? <form className={styles.composer} onSubmit={submit}>
            <label>
              <span id="composer-label">Message</span>
              <textarea aria-labelledby="composer-label" rows={3} value={draft} maxLength={MAX_MESSAGE_CHARACTERS * 2}
                aria-invalid={problem ? true : undefined} aria-describedby="composer-help"
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit(); }} />
            </label>
            <span id="composer-help" className={problem ? "field-error" : styles.count}>{problem ?? `${characters}/${MAX_MESSAGE_CHARACTERS}`}</span>
            <button className="primary-button" type="submit" disabled={Boolean(bodyProblem(draft))}><Send size={17} aria-hidden />Send</button>
          </form>
        : <p className={styles.readOnly} role="status">This conversation is read-only because a participant is no longer a current member.</p>}
    </>}
  </div>;
}
