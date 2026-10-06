"use client";

import Link from "next/link";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, Bot, ClipboardList, CornerUpLeft, LoaderCircle, LockKeyhole, MessageSquare, Pencil, RefreshCw, Send, Share2, SmilePlus, Trash2, UserRound, UsersRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LoadingState, PageSkeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useHydrated } from "@/features/platform/use-hydrated";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { subscribeLive, useLiveConnected } from "@/features/realtime/live";
import { readMembers, spacesSchema } from "@/features/spaces/client";
import {
  MAX_MESSAGE_CHARACTERS, REACTIONS, askAgentAgain, bodyProblem, conversationPage, deleteMessage, editMessage, editable, markRead, mentionsAgent, mergeMessages,
  messagePage, normalizeBody, openConversation, reactToMessage, readConversation, sendMessage, shareAgentAnswer,
} from "./client";
import type { Conversation, Message, Reaction, Reply, SendIntent } from "./client";
import styles from "./messages.module.css";

const PrivateAgentRequest = lazy(() => import("@/features/agents/agent-screen").then(module => ({ default: module.PrivateAgentRequest })));

type Pending = SendIntent & { state: "sending" | "unknown" | "failed"; error?: string };
const EMOJI: Record<Reaction, string> = { like: "\u{1F44D}", love: "\u2764\uFE0F", laugh: "\u{1F602}", wow: "\u{1F62E}", sad: "\u{1F622}", thanks: "\u{1F64F}" };
const POLL_MILLISECONDS = 5000;
// While the live connection is up it announces changes, so the timers only catch a lost hint.
const LIVE_POLL_MILLISECONDS = 30000;
const LIVE_LIST_MILLISECONDS = 60000;
// Hints that can be about any message, not only the newest page (T106).
const ANY_MESSAGE_HINTS = new Set(["deleted", "changed", "member_left"]);

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
  if (waiting.some(item => item.state === "unknown")) return "chat.notConfirmed";
  if (waiting.some(item => item.state === "failed")) return "chat.notSent";
  return null;
}

function sessionLost(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED");
}

export function MessagesScreen({ initialSpaceId }: { initialSpaceId: string }) {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  const hydrated = useHydrated();
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) window.location.replace("/login");
  }, [profile.error]);
  if (!hydrated || profile.isPending) {
    return <Shell account workspace><PageSkeleton label={t("chat.loadingScreen")} /></Shell>;
  }
  if (!profile.data || profile.isError) {
    return <Shell account><main className={styles.main}><h1>{t("chat.unavailableTitle")}</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />{t("chat.retry")}</button></main></Shell>;
  }
  return <Messaging key={profile.data.data.id} user={profile.data.data} initialSpaceId={initialSpaceId} />;
}

function Messaging({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const t = useText();
  const { language } = useLanguage();
  const time = new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium", timeStyle: "short" });
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
  return <Shell account workspace>
    <main className={styles.main}>
      <nav className={styles.navigation} aria-label={t("chat.workspace")}>
        <Link href="/app/settings/account"><UserRound size={18} aria-hidden />{t("chat.account")}</Link>
        <Link href="/app/spaces"><UsersRound size={18} aria-hidden />{t("chat.spaces")}</Link>
        <Link href="/app/tasks"><ClipboardList size={18} aria-hidden />{t("chat.tasks")}</Link>
        <span aria-current="page"><MessageSquare size={18} aria-hidden />{t("chat.messages")}</span>
      </nav>
      <div className={styles.layout} data-open={selected ? "conversation" : "list"}>
        <section className={styles.sidebar} aria-labelledby="conversations-title">
          <div className={styles.sectionHeading}>
            <h1 id="conversations-title">{t("chat.messages")}</h1>
            {unread > 0 && <span className={styles.badge} aria-label={t("chat.unreadMessages", { count: unread })}>{unread}</span>}
            <button className="icon-button" title={t("chat.refreshConversations")} aria-label={t("chat.refreshConversations")} disabled={conversations.isFetching} onClick={() => conversations.refetch()}>
              <RefreshCw size={18} className={conversations.isFetching ? "spin" : ""} aria-hidden />
            </button>
          </div>
          <form className={styles.start} onSubmit={event => { event.preventDefault(); if (spaceId) open.mutate({ space: spaceId }); }}>
            <label>
              <span id="chat-space-label">{t("chat.space")}</span>
              <select aria-labelledby="chat-space-label" value={spaceId} disabled={open.isPending || lost} onChange={event => { setSpaceId(event.target.value); open.reset(); }}>
                <option value="">{t("chat.chooseSpace")}</option>
                {spaces.data?.data.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
              </select>
            </label>
            <button className="secondary-button" type="submit" disabled={!spaceId || open.isPending || lost}>
              {open.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UsersRound size={17} aria-hidden />}{t("chat.openSpaceChat")}
            </button>
            {members.data && members.data.length > 1 && <div className={styles.memberChoices} aria-label={t("chat.directMembers")}>
              {members.data.filter(member => member.account_id !== user.id).map(member => (
                <button key={member.account_id} type="button" className="text-button" disabled={open.isPending || lost} onClick={() => open.mutate({ space: spaceId, participant: member.account_id })}>
                  <MessageSquare size={16} aria-hidden />{t("chat.directMember", { name: member.display_name })}
                </button>
              ))}
            </div>}
            {open.isError && !lost && <div className="message error" role="alert">{open.error.message}</div>}
          </form>
          {conversations.isPending && <LoadingState label={t("chat.loadingConversations")} />}
          {conversations.isError && !lost && <div className="message error" role="alert">{conversations.error.message}<button className="text-button" onClick={() => conversations.refetch()}><RefreshCw size={16} aria-hidden />{t("chat.retry")}</button></div>}
          {!conversations.isPending && !conversations.isError && items.length === 0 && <p className={styles.emptyNote}>{t("chat.emptyConversations")}</p>}
          {!conversations.isError && !lost && <ul className={styles.conversationList}>
            {items.map(item => { const waiting = pendingLabel(user.id, item.id); return <li key={item.id}>
              <button type="button" aria-current={selected?.id === item.id ? "true" : undefined} onClick={() => setSelected(item)}>
                <span className={styles.conversationMark} aria-hidden>{item.kind === "space" ? <UsersRound size={20} /> : <MessageSquare size={20} />}</span>
                <span className={styles.conversationIdentity}>
                  <strong>{item.title}</strong>
                  <span>{item.kind === "space" ? t("chat.spaceChat") : t("chat.directSpace", { name: item.space_name })}{item.last_message_at ? t("chat.lastMessageAt", { date: time.format(new Date(item.last_message_at)) }) : ""}</span>
                </span>
                {waiting && <span className={styles.unconfirmed}>{t(waiting)}</span>}
                {item.unread_count > 0 && <span className={styles.badge} aria-label={t("chat.unreadCount", { count: item.unread_count })}>{item.unread_count}</span>}
              </button>
            </li>; })}
          </ul>}
          {conversations.hasNextPage && <button className="text-button" disabled={conversations.isFetchingNextPage} onClick={() => conversations.fetchNextPage()}>{t("chat.moreConversations")}</button>}
        </section>
        <section className={styles.chat} aria-label={t("chat.conversation")}>
          {selected && !lost
            ? <ConversationPane key={`${user.id}:${selected.id}`} user={user} initial={selected} onBack={() => setSelected(null)} onChanged={refreshList} />
            : <div className={styles.placeholder}><MessageSquare size={32} strokeWidth={1.5} aria-hidden /><p>{t("chat.chooseConversation")}</p></div>}
        </section>
      </div>
    </main>
  </Shell>;
}

function ConversationPane({ user, initial, onBack, onChanged }: { user: Account; initial: Conversation; onBack: () => void; onChanged: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const time = new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium", timeStyle: "short" });
  const loadError = t("chat.loadError");
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
  const [confirmShare, setConfirmShare] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const markedThrough = useRef(Number(initial.read_position));
  const itemsRef = useRef<Message[]>([]);
  const messagesRef = useRef<HTMLOListElement | null>(null);
  const followingLatest = useRef(true);
  const earlierPosition = useRef<{ height: number; top: number } | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  const runPoll = useRef<(first: boolean, queue?: boolean, reread?: boolean) => void>(() => undefined);
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
    setError(problem instanceof Error ? problem.message : loadError);
  }, [loadError, onChanged, setPending]);

  const absorb = useCallback((incoming: Message[]) => {
    const merged = mergeMessages(itemsRef.current, incoming);
    itemsRef.current = merged;
    setItems(merged);
    const confirmed = new Set(incoming.filter(item => item.mine).map(item => item.client_message_id));
    setPending(current => current.filter(item => !(confirmed.has(item.key) && item.state !== "sending")));
  }, [setPending]);

  const poll = useCallback(async (signal: AbortSignal, first: boolean, reread = false) => {
    try {
      const [view, latest] = await Promise.all([readConversation(user.id, conversationId, signal), messagePage(user.id, conversationId, { signal })]);
      const known = itemsRef.current.length ? Number(itemsRef.current[itemsRef.current.length - 1].position) : null;
      const oldest = itemsRef.current.length ? Number(itemsRef.current[0].position) : null;
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
      // The messages shown before the newest page are read again, oldest first, up to the newest one shown.
      if (reread && known !== null && oldest !== null && latest.data.length && oldest < Number(latest.data[0].position)) {
        const shown: Message[] = [];
        const through = Math.min(known, Number(latest.data[0].position) - 1);
        let after = String(oldest - 1);
        for (let page = 0; page <= itemsRef.current.length / 30; page += 1) {
          const next = await messagePage(user.id, conversationId, { after, signal });
          shown.push(...next.data);
          if (!next.data.length || Number(next.data[next.data.length - 1].position) >= through || !next.pagination.has_more || !next.pagination.next_cursor) break;
          after = next.pagination.next_cursor;
        }
        incoming = [...shown, ...incoming];
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
    let againReread = false;
    const run = (first: boolean, queue = false, reread = false) => {
      if (!active) return;
      if (running) { again ||= queue; againReread ||= queue && reread; return; }
      running = true;
      void poll(controller.signal, first, reread).finally(() => {
        running = false;
        if (again) { const deep = againReread; again = false; againReread = false; run(false, false, deep); }
      });
    };
    runPoll.current = run;
    run(true);
    const unsubscribe = subscribeLive(event => {
      if (event.accountId !== user.id) return;
      if (event.kind === "resync") run(false, true, true);
      else if (event.kind === "conversation" && event.conversation_id === conversationId) run(false, true, ANY_MESSAGE_HINTS.has(event.reason));
    });
    return () => { active = false; runPoll.current = () => undefined; unsubscribe(); controller.abort(); };
  }, [poll, conversationId, user.id]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") runPoll.current(false, false, true); }, live ? LIVE_POLL_MILLISECONDS : POLL_MILLISECONDS);
    const resume = () => { if (document.visibilityState === "visible") runPoll.current(false, true, true); };
    document.addEventListener("visibilitychange", resume);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", resume); };
  }, [live]);

  useEffect(() => {
    if (!draft.trim()) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  const newestId = items.length ? items[items.length - 1].id : "";
  useLayoutEffect(() => {
    const list = messagesRef.current;
    const previous = earlierPosition.current;
    if (!list || !previous) return;
    list.scrollTop = previous.top + list.scrollHeight - previous.height;
    earlierPosition.current = null;
  }, [items]);

  useLayoutEffect(() => {
    const list = messagesRef.current;
    if (!list) return;
    if (followingLatest.current) list.scrollTop = list.scrollHeight;
    else if (newestId || pending.length) setNewMessages(true);
  }, [newestId, pending.length]);

  useEffect(() => {
    const list = messagesRef.current;
    if (!list) return;
    const resize = new ResizeObserver(() => { if (followingLatest.current) list.scrollTop = list.scrollHeight; });
    resize.observe(list);
    return () => resize.disconnect();
  }, []);

  function rememberPosition() {
    const list = messagesRef.current;
    if (!list) return;
    followingLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    if (followingLatest.current) setNewMessages(false);
  }

  function showLatest() {
    followingLatest.current = true;
    setNewMessages(false);
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }

  async function deliver(intent: SendIntent) {
    followingLatest.current = true;
    setNewMessages(false);
    setPending(current => [...current.filter(item => item.key !== intent.key), { ...intent, state: "sending" }]);
    try {
      const message = await sendMessage(intent);
      absorb([message]);
      setPending(current => current.filter(item => item.key !== intent.key));
      // The agent answers before the send returns, so its reply is already there to fetch (DEC-046).
      if (message.agent_request) runPoll.current(false, true);
      onChanged();
    } catch (problem) {
      if (sessionLost(problem) || (problem instanceof ApiError && problem.status === 404)) { fail(problem); return; }
      const definite = problem instanceof ApiError && problem.status >= 400 && problem.status < 500 && problem.status !== 408;
      setPending(current => current.map(item => item.key === intent.key
        ? { ...item, state: definite ? "failed" : "unknown", error: problem instanceof Error ? problem.message : undefined }
        : item));
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bodyProblem(draft) || !conversation.can_send || denied) return;
    const intent: SendIntent = { accountId: user.id, conversationId, key: crypto.randomUUID(), body: normalizeBody(draft) };
    if (replyingTo) intent.replyTo = replyingTo.id;
    setDraft("");
    setReplyingTo(null);
    void deliver(intent);
  }

  // Edits and reactions name the change itself, so trying again is safe; their known refusals get their own words.
  function actionFailed(problem: unknown) {
    const code = problem instanceof ApiError ? problem.code : "";
    const known = code === "EDIT_WINDOW_CLOSED" ? "chat.editClosed" : code === "EDIT_LIMIT_REACHED" ? "chat.editLimit"
      : code === "MESSAGE_DELETED" ? "chat.messageGone" : code === "REPLY_UNAVAILABLE" ? "chat.replyUnavailable" : null;
    if (known) { setError(t(known)); runPoll.current(false, true); } else fail(problem);
  }

  async function react(message: Message, reaction: Reaction, on: boolean) {
    setActing(message.id);
    setPicking(null);
    try { absorb([await reactToMessage(user.id, conversationId, message.id, reaction, on)]); setError(""); }
    catch (problem) { actionFailed(problem); }
    finally { setActing(null); }
  }

  async function saveEdit(message: Message, text: string) {
    if (bodyProblem(text)) return;
    setActing(message.id);
    try { absorb([await editMessage(user.id, conversationId, message.id, normalizeBody(text))]); setEditing(null); setError(""); }
    catch (problem) { actionFailed(problem); }
    finally { setActing(null); }
  }

  function quote(reply: Reply) {
    // The agent's replies are named in the reader's language when the quoted reply is loaded (DEC-046).
    const name = items.find(entry => entry.id === reply.message_id)?.from_agent ? t("chat.agentName") : reply.sender_name;
    return <p className={styles.quote}>
      <CornerUpLeft size={14} aria-hidden />
      {reply.status === "sent" ? <span><strong>{name}</strong> {reply.excerpt}</span>
        : <span>{reply.status === "deleted" ? t("chat.quoteDeleted") : t("chat.quoteHidden")}</span>}
    </p>;
  }

  async function askAgain(message: Message) {
    setActing(message.id);
    try { absorb([await askAgentAgain(user.id, conversationId, message.id)]); setError(""); runPoll.current(false, true); }
    catch (problem) { fail(problem); }
    finally { setActing(null); }
  }

  // Showing a private answer to everyone (DEC-061): its known refusals get their own words, and the agent's reply,
  // which now holds the answer, is read again.
  async function shareAnswer(message: Message) {
    setActing(message.id);
    setConfirmShare(null);
    try { absorb([await shareAgentAnswer(user.id, conversationId, message.id)]); setError(""); runPoll.current(false, true, true); }
    catch (problem) {
      const code = problem instanceof ApiError ? problem.code : "";
      const known = code === "AGENT_ANSWER_NOT_SHARED" ? "chat.agentShareRefused" : code === "AGENT_ANSWER_PERSONAL" ? "chat.agentSharePersonal"
        : code === "AGENT_ANSWER_NOT_READY" ? "chat.agentShareNotReady" : code === "CONVERSATION_READ_ONLY" ? "chat.readOnly" : null;
      if (known) setError(t(known)); else fail(problem);
    }
    finally { setActing(null); }
  }

  function agentStatus(message: Message) {
    const request = message.agent_request;
    if (!request || request.status === "answered" || message.status !== "sent") return null;
    const open = request.status === "private" || request.status === "waiting";
    const retry = request.status === "pending" || request.status === "failed";
    const shareable = request.status === "private" && message.mine && request.run_id !== null && conversation.can_send;
    return <div className={styles.agentStatus} role="status">
      <Bot size={15} aria-hidden /><span>{t(`chat.agentStatus.${request.status}`)}</span>
      {open && message.mine && request.run_id && <Suspense fallback={<span aria-busy="true">{t("chat.loading")}</span>}>
        <PrivateAgentRequest user={user} conversationId={conversationId} messageId={message.id} runId={request.run_id} />
      </Suspense>}
      {shareable && confirmShare !== message.id && <button className="text-button" type="button" disabled={acting !== null}
        onClick={() => setConfirmShare(message.id)}><Share2 size={15} aria-hidden /> {t("chat.agentShare")}</button>}
      {shareable && confirmShare === message.id && <div className={styles.confirm} role="group" aria-label={t("chat.agentShareConfirmation")}>
        <span>{t("chat.agentShareWarning")}</span>
        <button className="secondary-button" type="button" disabled={acting !== null} onClick={() => shareAnswer(message)}>{t("chat.agentShareConfirm")}</button>
        <button className="text-button" type="button" onClick={() => setConfirmShare(null)}>{t("chat.agentKeepPrivate")}</button>
      </div>}
      {retry && <button className="text-button" disabled={acting !== null} onClick={() => askAgain(message)}>{t("chat.agentAskAgain")}</button>}
    </div>;
  }

  async function loadEarlier() {
    if (!earlier) return;
    setLoadingEarlier(true);
    try {
      const page = await messagePage(user.id, conversationId, { before: earlier });
      const list = messagesRef.current;
      if (list) {
        followingLatest.current = false;
        earlierPosition.current = { height: list.scrollHeight, top: list.scrollTop };
      }
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

  const validation = draft ? bodyProblem(draft) : null;
  const problem = validation === "Write a message first." ? t("chat.problemEmpty")
    : validation === `Messages can have up to ${MAX_MESSAGE_CHARACTERS} characters.` ? t("chat.problemLong", { limit: MAX_MESSAGE_CHARACTERS })
    : validation === "Remove control characters from the message." ? t("chat.problemControl") : validation;
  const characters = [...normalizeBody(draft)].length;
  return <div className={styles.pane}>
    <header className={styles.chatHeader}>
      <button className={`icon-button ${styles.back}`} aria-label={t("chat.back")} title={t("chat.back")} onClick={onBack}><ArrowLeft size={19} aria-hidden /></button>
      <div className={styles.chatTitle}>
        <h2>{conversation.title}</h2>
        <span>{conversation.kind === "space" ? t("chat.spaceChat") : t("chat.directConversation")} / {conversation.space_name}</span>
      </div>
    </header>
    <details className={styles.conversationDetails} open>
      <summary className={styles.protection}><LockKeyhole size={15} aria-hidden />{t("chat.protection")}</summary>
      {conversation.kind === "space" && <p className={styles.historyNote}>{t("chat.historyNote")}</p>}
    </details>
    {error && <div className="message error" role="alert">{error}</div>}
    {denied ? <p className={styles.emptyNote}>{t("chat.denied")}</p> : <>
      {earlier && <button className="text-button" disabled={loadingEarlier} onClick={loadEarlier}>{loadingEarlier ? t("chat.loading") : t("chat.earlier")}</button>}
      {loading && <LoadingState label={t("chat.loadingMessages")} rows={2} />}
      {!loading && items.length === 0 && pending.length === 0 && <p className={styles.emptyNote}>{t("chat.emptyMessages")}</p>}
      <div className={styles.messageViewport} role="log" aria-label={t("chat.messages")} aria-live="polite" aria-relevant="additions">
      <ol ref={messagesRef} className={styles.messages} onScroll={rememberPosition}>
        {items.map(message => <li key={message.id} className={message.from_agent ? styles.agent : message.mine ? styles.mine : undefined}>
          <div className={styles.bubble}>
            <span className={styles.meta}><strong className={message.from_agent ? styles.agentLabel : undefined}>{message.from_agent ? <><Bot size={14} aria-hidden />{t("chat.agentName")}</> : message.mine ? t("chat.you") : message.sender_name}</strong> <time dateTime={message.created_at}>{time.format(new Date(message.created_at))}</time>{message.edited_at && message.status !== "deleted" && <> · <span>{t("chat.edited")}</span></>}</span>
            {message.reply_to && quote(message.reply_to)}
            {message.status === "sent" && editing?.id !== message.id && <p className={styles.body}>{message.body}</p>}
            {editing?.id === message.id && <form className={styles.editor} onSubmit={event => { event.preventDefault(); void saveEdit(message, editing.draft); }}>
              <label>
                <span>{t("chat.editLabel")}</span>
                <textarea rows={3} value={editing.draft} maxLength={MAX_MESSAGE_CHARACTERS * 2} aria-describedby={`edit-hint-${message.id}`}
                  onChange={event => setEditing({ id: message.id, draft: event.target.value })} />
              </label>
              <span id={`edit-hint-${message.id}`} className={styles.count}>{t("chat.editHint")}</span>
              <div className={styles.confirm}>
                <button className="secondary-button" type="submit" disabled={acting !== null || Boolean(bodyProblem(editing.draft))}>{t("chat.saveEdit")}</button>
                <button className="text-button" type="button" onClick={() => setEditing(null)}>{t("chat.cancelEdit")}</button>
              </div>
            </form>}
            {message.status === "deleted" && <p className={styles.removed}>{t("chat.deleted")}</p>}
            {message.status === "unavailable" && <p className={styles.removed}>{t("chat.hidden")}</p>}
            {agentStatus(message)}
            {message.reactions.length > 0 && <div className={styles.reactions} role="group" aria-label={t("chat.reactions")}>
              {message.reactions.map(item => <button key={item.reaction} type="button" className={styles.reaction} aria-pressed={item.mine}
                disabled={acting !== null || !conversation.can_send || message.status === "deleted"}
                aria-label={t(item.mine ? "chat.reactionMine" : "chat.reactionCount", { reaction: t(`chat.reaction.${item.reaction}`), count: item.count })}
                onClick={() => react(message, item.reaction, !item.mine)}><span aria-hidden>{EMOJI[item.reaction]}</span> {item.count}</button>)}
            </div>}
            {message.status === "sent" && conversation.can_send && editing?.id !== message.id && confirmDelete !== message.id && <div className={styles.actions}>
              <button type="button" className="icon-button" aria-label={t("chat.replyTo", { name: message.from_agent ? t("chat.agentName") : message.mine ? t("chat.you") : message.sender_name })} title={t("chat.reply")}
                onClick={() => setReplyingTo(message)}><CornerUpLeft size={16} aria-hidden /></button>
              <button type="button" className="icon-button" aria-label={t("chat.react")} title={t("chat.react")} aria-expanded={picking === message.id}
                disabled={acting !== null} onClick={() => setPicking(picking === message.id ? null : message.id)}><SmilePlus size={16} aria-hidden /></button>
              {editable(message) && <button type="button" className="icon-button" aria-label={t("chat.editMessage")} title={t("chat.editMessage")}
                disabled={acting !== null} onClick={() => setEditing({ id: message.id, draft: message.body ?? "" })}><Pencil size={16} aria-hidden /></button>}
            </div>}
            {picking === message.id && <div className={styles.reactions} role="group" aria-label={t("chat.chooseReaction")}>
              {REACTIONS.map(reaction => {
                const mine = message.reactions.some(item => item.reaction === reaction && item.mine);
                return <button key={reaction} type="button" className={styles.reaction} aria-pressed={mine} aria-label={t(`chat.reaction.${reaction}`)}
                  disabled={acting !== null} onClick={() => react(message, reaction, !mine)}><span aria-hidden>{EMOJI[reaction]}</span></button>;
              })}
            </div>}
            {message.mine && message.status === "sent" && confirmDelete !== message.id && (
              <button className={`icon-button ${styles.deleteButton}`} aria-label={t("chat.deleteMessage")} title={t("chat.deleteTitle")} disabled={deleting !== null} onClick={() => setConfirmDelete(message.id)}><Trash2 size={16} aria-hidden /></button>
            )}
            {confirmDelete === message.id && <div className={styles.confirm} role="group" aria-label={t("chat.confirmDeletion")}>
              <span>{t("chat.deleteWarning")}</span>
              <button className="secondary-button" onClick={() => remove(message)}>{t("chat.delete")}</button>
              <button className="text-button" onClick={() => setConfirmDelete(null)}>{t("chat.keep")}</button>
            </div>}
          </div>
        </li>)}
        {pending.map(item => <li key={item.key} className={styles.mine}>
          <div className={`${styles.bubble} ${styles.pendingBubble}`}>
            {item.replyTo && (() => {
              const original = items.find(entry => entry.id === item.replyTo);
              return original?.status === "sent" ? quote({ message_id: original.id, status: "sent", position: original.position, sender_name: original.mine ? t("chat.you") : original.sender_name, excerpt: original.body }) : null;
            })()}
            <p className={styles.body}>{item.body}</p>
            {item.state === "sending" && <span className={styles.meta}><LoaderCircle size={14} className="spin" aria-hidden />{t("chat.sending")}</span>}
            {item.state === "unknown" && <div className={styles.confirm} role="alert">
              <span>{t("chat.unknown")}</span>
              <button className="secondary-button" onClick={() => deliver(item)}>{t("chat.retry")}</button>
              <button className="text-button" onClick={() => { if (window.confirm(t("chat.stopConfirm"))) setPending(current => current.filter(entry => entry.key !== item.key)); }}>{t("chat.stopTracking")}</button>
            </div>}
            {item.state === "failed" && <div className={styles.confirm} role="alert">
              <span>{t("chat.failed", { error: item.error ?? t("chat.unconfirmedFallback") })}</span>
              <button className="text-button" onClick={() => { setDraft(item.body); setReplyingTo(items.find(entry => entry.id === item.replyTo && entry.status === "sent") ?? null); setPending(current => current.filter(entry => entry.key !== item.key)); }}>{t("chat.edit")}</button>
            </div>}
          </div>
        </li>)}
        <li aria-hidden className={styles.end} />
      </ol>
      {newMessages && <Button variant="outline" className={styles.latestMessages} onClick={showLatest}>
        <ArrowDown aria-hidden />{t("ui.latestMessages")}
      </Button>}
      </div>
      {conversation.can_send
        ? <form className={styles.composer} onSubmit={submit}>
            {replyingTo && <div className={styles.replying} role="status">
              <span>{t("chat.replyingTo", { name: replyingTo.mine ? t("chat.you") : replyingTo.sender_name })}: {replyingTo.body}</span>
              <button type="button" className="icon-button" aria-label={t("chat.cancelReply")} title={t("chat.cancelReply")} onClick={() => setReplyingTo(null)}><X size={16} aria-hidden /></button>
            </div>}
            <div className={styles.composerInput}>
            <label>
              <span id="composer-label" className="sr-only">{t("chat.message")}</span>
              <Textarea aria-labelledby="composer-label" placeholder={t("chat.message")} rows={2} value={draft} maxLength={MAX_MESSAGE_CHARACTERS * 2}
                aria-invalid={problem ? true : undefined} aria-describedby="composer-help"
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit(); }} />
            </label>
            <Button type="submit" size="icon" aria-label={t("chat.send")} title={t("chat.send")} disabled={Boolean(bodyProblem(draft))}><Send aria-hidden /></Button>
            </div>
            <span id="composer-help" className={problem ? "field-error" : styles.count}>{problem ?? `${characters}/${MAX_MESSAGE_CHARACTERS}`}</span>
            {!problem && mentionsAgent(draft) && <span className={styles.agentHint}>{t("chat.agentHint")}</span>}
          </form>
        : <p className={styles.readOnly} role="status">{t("chat.readOnly")}</p>}
    </>}
  </div>;
}
