"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Bot, Check, CheckCircle2, Circle, CircleDot, ExternalLink, FileText, ListChecks, LoaderCircle, MessageCircle, Pencil, Play, RefreshCw, Save, Send, Trash2, X, Zap, ZapOff } from "lucide-react";

import { Dialog as ConfirmDialog } from "@/components/ui/dialog";
import { ApiError, api, characters } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { spacesSchema } from "@/features/spaces/client";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { agentInteraction, answerQuestion, askAgent, cancelRun, decide, editMemory, forgetMemory, isWorking, messageSchema, readMemories, readRun, readWebText, runPage } from "./client";
import type { AgentMemory, AgentRun, AskIntent, DecisionIntent, MemoryEditIntent, RunFilter } from "./client";
import { AgentProviderNotice } from "./provider-notice";
import { AgentProgress } from "./agent-progress";
import { AgentMessageContent } from "./agent-message";
import progressStyles from "./agent-progress.module.css";
import { useLiveConnected } from "@/features/realtime/live";
import { useLanguage, useText, formatDateTime } from "@/features/i18n/i18n";
import styles from "./agents.module.css";

export function AgentScreen({ initialSpaceId = "" }: { initialSpaceId?: string }) {
  const viewer = useViewer();
  const t = useText();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("agent.loading")}</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>{t("agent.unavailableTitle")}</h1><p role="alert">{problemText(viewer.error, t("agent.unavailableFallback"))}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></main></Shell>;
  }
  return <Agent key={viewer.account.id} user={viewer.account} initialSpaceId={initialSpaceId} />;
}

function useSessionGuard(error: unknown) {
  const client = useQueryClient();
  useEffect(() => {
    if (sessionLost(error)) {
      client.clear();
      window.location.replace(error instanceof ApiError && error.status === 401 ? "/login" : "/app/agent");
    }
  }, [error, client]);
}

function readAccessDenied(error: unknown) {
  return sessionLost(error) || error instanceof ApiError && (error.status === 403 || error.status === 404);
}

function Agent({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const t = useText();
  const [view, setView] = useState<"chat" | "memories">("chat");
  return <Shell account workspace><main className={`${styles.main} ${styles.workspace}`}>
    <div className={styles.workspaceBar}>
    <header className={styles.header}>
      <h1><Bot size={24} aria-hidden className={styles.headingIcon} />{t("agent.heading")}</h1>
    </header>
    <div className={styles.toolbar}>
      <Link className="icon-button" href="/app/agent/tasks" aria-label={t("agent.inboxTitle")} title={t("agent.inboxTitle")}><ListChecks size={18} aria-hidden /></Link>
      <div className={styles.tabs} role="group" aria-label={t("agent.viewLabel")}>
        <button className={styles.tab} aria-pressed={view === "chat"} onClick={() => setView("chat")}>{t("agent.chat")}</button>
        <button className={styles.tab} aria-pressed={view === "memories"} onClick={() => setView("memories")}>{t("agent.memories")}</button>
      </div>
    </div>
    </div>
    {view === "memories" ? <Memories user={user} /> : <Conversation user={user} initialSpaceId={initialSpaceId} />}
  </main></Shell>;
}

export function AgentTaskInboxScreen({ initialSpaceId = "" }: { initialSpaceId?: string }) {
  const viewer = useViewer();
  const t = useText();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  return <Shell account><main className={styles.main}>
    <header className={styles.header}><h1><ListChecks size={24} className={styles.headingIcon} aria-hidden />{t("agent.inboxTitle")}</h1></header>
    {viewer.pending || viewer.signedOut ? <p role="status">{t("agent.loading")}</p> : viewer.account
      ? <SpaceInbox key={viewer.account.id} user={viewer.account} initialSpaceId={initialSpaceId} />
      : <p className="message error" role="alert">{problemText(viewer.error, t("agent.unavailableFallback"))}
        <button className="text-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></p>}
  </main></Shell>;
}

function SpaceInbox({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const t = useText();
  const [choice, setChoice] = useState(initialSpaceId);
  const spaces = useInfiniteQuery({
    queryKey: ["agentInboxSpaces", user.id], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const parameters = new URLSearchParams({ limit: "50" });
      if (pageParam) parameters.set("cursor", pageParam);
      return api(`spaces?${parameters}`, spacesSchema, { accountId: user.id, signal });
    },
    getNextPageParam: page => page.pagination?.next_cursor ?? undefined,
  });
  useSessionGuard(spaces.error);
  const choices = [...new Map(spaces.data?.pages.flatMap(page => page.data).map(space => [space.id, space] as const) ?? []).values()];
  const spaceId = choice || choices[0]?.id || "";
  const selected = choices.find(space => space.id === spaceId);
  return <>
    {spaces.isPending && <p role="status">{t("agent.loadingSpaces")}</p>}
    {spaces.isError && <p role="alert" className="message error">{problemText(spaces.error, t("agent.spacesError"))}
      <button className="text-button" disabled={spaces.isFetching} onClick={() => void spaces.refetch()}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></p>}
    {!spaces.isError && !spaces.isPending && <>
      {choices.length === 0 ? <p className={styles.empty}>{t("agent.spacesEmpty")}</p> : <label className={styles.field}>{t("agent.space")}
        <select value={selected ? spaceId : ""} onChange={event => setChoice(event.target.value)}>
          {!selected && <option value="" disabled>{t("agent.inboxSpaceUnavailable")}</option>}
          {choices.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
        </select>
      </label>}
      {spaces.hasNextPage && <button className="text-button" disabled={spaces.isFetching} onClick={() => void spaces.fetchNextPage()}>{t("agent.inboxSpacesMore")}</button>}
      {selected && <InboxRuns key={`${user.id}:${spaceId}`} user={user} spaceId={spaceId} name={selected.name} enabled={selected.agent_enabled} />}
    </>}
  </>;
}

const inboxFilters = {
  all: "agent.filterAll", working: "agent.filterWorking", waiting_for_approval: "agent.status.waiting_for_approval",
  waiting_for_user: "agent.status.waiting_for_user", completed: "agent.filterCompleted", failed: "agent.filterFailed", cancelled: "agent.filterCancelled",
} as const satisfies Record<Exclude<RunFilter, "needs_you">, string>;

function InboxRuns({ user, spaceId, name, enabled }: { user: Account; spaceId: string; name: string; enabled: boolean }) {
  const t = useText();
  const client = useQueryClient();
  const [status, setStatus] = useState<RunFilter>("all");
  const key = ["agentRuns", user.id, spaceId, "inbox", status];
  const runs = useInfiniteQuery({
    queryKey: key, initialPageParam: null as string | null, retry: false,
    queryFn: ({ pageParam, signal }) => runPage(user.id, spaceId, pageParam, signal, status),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
    refetchInterval: query => readAccessDenied(query.state.error) ? false : 5000,
  });
  useSessionGuard(runs.error);
  const refresh = () => client.invalidateQueries({ queryKey: ["agentRuns", user.id, spaceId] });
  const rows = runs.isError ? [] : [...new Map(runs.data?.pages.flatMap(page => page.data).map(run => [run.id, run] as const) ?? []).values()];
  return <section className={styles.inbox} aria-label={name}>
    <div className={styles.runHead}><h2>{name}</h2><AgentProviderNotice />
      <Link className="text-button" href={`/app/messages?space_id=${spaceId}`}><MessageCircle size={17} aria-hidden />{t("agent.openThisSpaceChat")}</Link>
      <button className="icon-button" aria-label={t("agent.refreshRequests")} title={t("agent.refreshRequests")} disabled={runs.isFetching}
        onClick={() => void refresh()}><RefreshCw size={18} className={runs.isFetching ? "spin" : ""} aria-hidden /></button>
    </div>
    <p className={styles.scope}>{t("agent.inboxPrivate")}</p>
    {!enabled && <p role="status" className="message">{t("agent.offInSpace")}</p>}
    <label className={styles.field}>{t("agent.filterStatus")}<select value={status} onChange={event => setStatus(event.target.value as RunFilter)}>
      {(Object.keys(inboxFilters) as (keyof typeof inboxFilters)[]).map(filter => <option key={filter} value={filter}>{t(inboxFilters[filter])}</option>)}
    </select></label>
    {runs.isPending && <p role="status">{t("agent.loadingRequests")}</p>}
    {runs.isError && <p role="alert" className="message error">{problemText(runs.error, t("agent.requestsError"))}
      <button className="text-button" disabled={runs.isFetching} onClick={() => void refresh()}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></p>}
    {!runs.isPending && !runs.isError && rows.length === 0 && <p className={styles.empty}>{t("agent.inboxEmpty")}</p>}
    <ol className={`${styles.list} ${styles.inboxList}`}>{rows.map(run => <li key={run.id}>
      <Turn user={user} run={run} onChanged={refresh} inline />
    </li>)}</ol>
    {!runs.isError && runs.hasNextPage && <button className="text-button" disabled={runs.isFetching} onClick={() => void runs.fetchNextPage()}>{t("agent.inboxMore")}</button>}
  </section>;
}

// The person's Main Agent (DEC-060): the community, the web and their own memories. Each Space's agent lives in its chat.
function Conversation({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const client = useQueryClient();
  const t = useText();
  const fieldId = useId();
  const spaceId = null;
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const [intent, setIntent] = useState<AskIntent | null>(null);
  const autoKey = `agent-auto-approve:${user.id}`;
  const [auto, setAuto] = useState(() => readChoice(autoKey));
  const scroller = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);
  const [newMessages, setNewMessages] = useState(false);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const live = useLiveConnected();
  const key = ["agentRuns", user.id, "main"];
  const runs = useInfiniteQuery({
    queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => runPage(user.id, spaceId, pageParam, signal),
    getNextPageParam: page => page.pagination?.next_cursor ?? undefined,
    // A run works in the background: keep reading it until it answers or waits for you, and recover by itself
    // after the server was briefly unreachable (for example while it restarts). Live hints bring each step at once,
    // so polling is only a slow safety net while the live stream is connected.
    refetchInterval: query => readAccessDenied(query.state.error) ? false
      : query.state.status === "error" ? 5000 : query.state.data?.pages.some(page => page.data.some(isWorking)) ? live ? 5000 : 1500 : false,
  });
  useSessionGuard(runs.error);
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const ask = useMutation({
    mutationFn: askAgent,
    onSuccess: async () => { setIntent(null); setText(""); await refresh(); },
    onError: error => { if (!isUnknown(error)) setIntent(null); },
  });
  useSessionGuard(ask.error);
  useEffect(() => {
    if (!intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [intent]);
  const denied = readAccessDenied(runs.error);
  const rows = denied ? [] : [...new Map(runs.data?.pages.flatMap(page => page.data).map(run => [run.id, run] as const) ?? []).values()].reverse();
  const latest = rows.at(-1);
  const latestStamp = latest ? `${latest.id}:${latest.version}` : "";
  useEffect(() => {
    if (!latestStamp || !scroller.current) return;
    if (followLatest.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
      setNewMessages(false);
    } else setNewMessages(true);
  }, [latestStamp]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    if (followLatest.current) setNewMessages(false);
  };
  const showLatest = () => {
    followLatest.current = true;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setNewMessages(false);
  };
  const send = () => {
    const parsed = messageSchema.safeParse(text);
    if (!parsed.success) {
      setProblem(!text.trim() ? t("agent.requestRequired") : characters(text.trim()) > 2000
        ? t("agent.requestLength") : parsed.error.issues[0]?.message ?? t("agent.requestRequired"));
      return;
    }
    setProblem("");
    const command = intent && intent.message === parsed.data ? intent : { accountId: user.id, spaceId, message: parsed.data, key: crypto.randomUUID(), autoApprove: auto };
    setIntent(command);
    followLatest.current = true;
    setNewMessages(false);
    ask.mutate(command);
  };
  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    saveChoice(autoKey, next);
  };
  const suggest = (value: string) => { setText(value); setProblem(""); input.current?.focus(); };
  const reuse = (value: string) => {
    if (ask.isPending || intent || text) return;
    setAuto(false);
    saveChoice(autoKey, false);
    suggest(value);
  };
  const sendLabel = intent && ask.isError ? t("agent.sendAgain") : t("agent.ask");
  return <section className={styles.chat} aria-labelledby={`${fieldId}-history`}>
    <div className={styles.chatHead}>
      <h2 id={`${fieldId}-history`} className={styles.chatTitle}>{t("agent.mainScope")}</h2>
      <p className={styles.srOnly}>{t("agent.mainHint")}</p>
      <AgentProviderNotice />
      <button className="icon-button" aria-label={t("agent.refreshRequests")} title={t("agent.refreshRequests")} disabled={runs.isFetching} onClick={() => refresh()}><RefreshCw size={18} className={runs.isFetching ? "spin" : ""} aria-hidden /></button>
    </div>
    <div ref={scroller} className={styles.scroller} role="log" aria-label={t("agent.chat")} aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={onScroll}>
      {initialSpaceId && <p className="message" role="status">{t("agent.spaceHere")}{" "}
        <Link className="text-button" href={`/app/messages?space_id=${initialSpaceId}`}><MessageCircle size={16} aria-hidden />{t("agent.openThisSpaceChat")}</Link></p>}
      {!denied && runs.hasNextPage && <button className={`text-button ${styles.earlier}`} disabled={runs.isFetching} onClick={() => runs.fetchNextPage()}>{t("agent.showEarlier")}</button>}
      {runs.isPending && <p role="status" className={styles.empty}>{t("agent.loadingRequests")}</p>}
      {runs.isError && <p className="message error" role="alert">{problemText(runs.error, t("agent.requestsError"))}
        <button className="text-button" type="button" disabled={runs.isFetching} onClick={() => void refresh()}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></p>}
      {!runs.isPending && !runs.isError && rows.length === 0 && <div className={styles.welcome}>
        <span className={styles.welcomeIcon}><Bot size={28} aria-hidden /></span>
        <p className={styles.empty}>{t("agent.emptyRequests")}</p>
        <p className={styles.hint}>{t("about.assistantProviders")} <Link href="/privacy">{t("about.privacyLink")}</Link></p>
        {!denied && <div className={styles.suggestions} role="group" aria-label={t("agent.suggestions")}>
          {suggestionKeys.map(item => <button key={item} type="button" className={styles.suggestion} onClick={() => suggest(t(item))}>{t(item)}</button>)}
        </div>}
      </div>}
      <ol className={styles.thread}>{rows.map(run => <li key={run.id}><Turn user={user} run={run} onChanged={refresh}
        onReuse={reuse} reuseDisabled={ask.isPending || intent !== null || text.length > 0} /></li>)}</ol>
    </div>
    {newMessages && <button className={styles.latestButton} type="button" onClick={showLatest} aria-label={t("agent.latest")} title={t("agent.latest")}><ArrowDown size={18} aria-hidden /></button>}
    {!denied && <form className={styles.composer} onSubmit={event => { event.preventDefault(); send(); }} noValidate>
      <label className={styles.srOnly} htmlFor={`${fieldId}-message`}>{t("agent.message")}</label>
      <span className={styles.srOnly} id={`${fieldId}-hint`}>{t("agent.hint")}</span>
      <div className={styles.inputBox} data-invalid={!!problem || undefined}>
        <textarea ref={input} id={`${fieldId}-message`} className={styles.input} rows={1} maxLength={4000} value={text} placeholder={`${t("agent.message")}…`}
          aria-describedby={`${fieldId}-hint ${fieldId}-keys`} aria-invalid={!!problem} disabled={ask.isPending || (!!intent && ask.isError)}
          onChange={event => { setText(event.target.value); setProblem(""); }}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
        <button className={styles.sendButton} type="submit" disabled={ask.isPending} aria-label={sendLabel} title={sendLabel}>
          {ask.isPending ? <LoaderCircle size={18} className="spin" aria-hidden /> : <Send size={18} aria-hidden />}
        </button>
      </div>
      {problem && <p className="field-error" role="alert">{problem}</p>}
      {ask.isError && <p className="message error" role="alert">{problemText(ask.error, t("agent.sendError"))}
        {intent && <button className="text-button" type="button" onClick={() => { setIntent(null); ask.reset(); }}>{t("agent.editRequest")}</button>}</p>}
      <div className={styles.composerFoot}>
        <span className={auto ? styles.hint : styles.srOnly} id={`${fieldId}-keys`}>{auto ? <span id={`${fieldId}-auto`}>{t("agent.autoApproveHint")}</span> : t("agent.enterHint")}</span>
        <button className={styles.autoApprove} type="button" aria-pressed={auto} aria-describedby={auto ? `${fieldId}-auto` : undefined} onClick={toggleAuto}>
          {auto ? <Zap size={16} aria-hidden /> : <ZapOff size={16} aria-hidden />}{t("agent.autoApprove")}
          <span className={styles.autoState} aria-hidden>{auto ? t("agent.autoApproveOn") : t("agent.autoApproveOff")}</span>
        </button>
      </div>
    </form>}
  </section>;
}

const suggestionKeys = ["agent.suggest.pages", "agent.suggest.post", "agent.suggest.family"] as const;

function readChoice(key: string) {
  try {
    return window.localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
}

function saveChoice(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, "on");
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}

const statusKeys = {
  queued: "agent.status.queued", running: "agent.status.running", waiting_for_approval: "agent.status.waiting_for_approval",
  waiting_for_user: "agent.status.waiting_for_user", verifying: "agent.status.verifying", completed: "agent.status.completed",
  failed: "agent.status.failed", cancelled: "agent.status.cancelled", timed_out: "agent.status.timed_out", expired: "agent.status.expired",
} as const satisfies Record<AgentRun["status"], string>;

const todoKeys = {
  pending: "agent.todo.pending", in_progress: "agent.todo.in_progress", completed: "agent.todo.completed",
} as const satisfies Record<AgentRun["todos"][number]["status"], string>;

export function PrivateAgentRequest({ user, conversationId, messageId, runId }: { user: Account; conversationId: string; messageId: string; runId: string }) {
  const t = useText();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const live = useLiveConnected();
  const key = ["agentMessageRun", user.id, conversationId, messageId, runId] as const;
  const run = useQuery({
    queryKey: key, enabled: expanded, retry: false,
    queryFn: ({ signal }) => readRun(user.id, runId, signal),
    refetchInterval: query => readAccessDenied(query.state.error) ? false
      : query.state.status === "error" ? 5000 : query.state.data && isWorking(query.state.data) ? live ? 5000 : 1500 : false,
  });
  useSessionGuard(run.error);
  useEffect(() => () => { void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, user.id, conversationId, messageId, runId]);
  const unavailable = readAccessDenied(run.error);
  const changed = async (updated?: AgentRun) => {
    if (updated) client.setQueryData(key, updated);
    else await run.refetch();
  };
  return <div className={styles.inlineRequest}>
    <button className="text-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {expanded ? t("chat.agentCloseReview") : t("chat.agentReview")}
    </button>
    <section className={styles.inlineRequestContent} aria-label={t("chat.agentPrivateRequest")} hidden={!expanded}>
      <div className={styles.runHead}>
        <h3>{t("chat.agentPrivateRequest")}</h3>
        <AgentProviderNotice />
        <button className="icon-button" type="button" aria-label={t("agent.refreshRequests")} title={t("agent.refreshRequests")}
          disabled={run.isFetching} onClick={() => void run.refetch()}><RefreshCw size={18} className={run.isFetching ? "spin" : ""} aria-hidden /></button>
      </div>
      {run.isPending && expanded && !unavailable && <p role="status">{t("agent.loadingRequests")}</p>}
      {run.error && <p className="message error" role="alert">{unavailable ? t("chat.agentRequestUnavailable") : problemText(run.error, t("agent.requestsError"))}
        <button className="text-button" type="button" disabled={run.isFetching} onClick={() => void run.refetch()}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></p>}
      {run.data && !unavailable && <Turn user={user} run={run.data} onChanged={changed} inline />}
    </section>
  </div>;
}

function Turn({ user, run, onChanged, inline = false, onReuse, reuseDisabled }: {
  user: Account; run: AgentRun; onChanged: (updated?: AgentRun) => Promise<unknown> | unknown;
  inline?: boolean; onReuse?: (message: string) => void; reuseDisabled?: boolean;
}) {
  const t = useText();
  const { language } = useLanguage();
  const fieldId = useId();
  const keys = useRef(new Map<string, string>());
  const [reply, setReply] = useState("");
  const [answerIntent, setAnswerIntent] = useState<{ run: AgentRun; answer: string } | null>(null);
  const replyTooLong = characters(reply.trim()) > 1000;
  const decision = useMutation({
    mutationFn: (command: DecisionIntent) => decide(command),
    onSuccess: updated => onChanged(updated),
    onError: error => { if (!isUnknown(error)) void onChanged(); },
  });
  const respond = useMutation({
    mutationFn: (command: { run: AgentRun; answer: string }) => answerQuestion(user.id, command.run, command.answer),
    onSuccess: updated => { setAnswerIntent(null); setReply(""); return onChanged(updated); },
    onError: error => { if (!isUnknown(error)) { setAnswerIntent(null); void onChanged(); } },
  });
  const stop = useMutation({ mutationFn: () => cancelRun(user.id, run.id, run.space_id), onSuccess: updated => { setAnswerIntent(null); return onChanged(updated); } });
  useSessionGuard(decision.error ?? respond.error ?? stop.error);
  const busy = decision.isPending || respond.isPending || stop.isPending;
  const approval = run.approval;
  const question = answerIntent?.run.question ?? run.question;
  const pending = run.status === "waiting_for_approval" && approval?.status === "pending";
  const working = isWorking(run);
  const response = agentInteraction(run).messages[1];
  const choose = (action: "approve" | "reject") => {
    if (!approval) return;
    const existing = keys.current.get(`${approval.id}:${action}`) ?? crypto.randomUUID();
    keys.current.set(`${approval.id}:${action}`, existing);
    decision.mutate({ accountId: user.id, approval, action, key: existing });
  };
  const statusKey = run.status === "completed" && run.outcome === "refused" ? "agent.status.refused"
    : run.status === "completed" && run.intent === "unknown" ? "agent.status.notUnderstood" : statusKeys[run.status];
  return <article className={inline ? styles.inlineRun : styles.turn} aria-labelledby={`${fieldId}-asked`}>
    {!inline && <div className={styles.mine}>
      <p className={styles.bubbleText} id={`${fieldId}-asked`}>{run.message}</p>
      <div className={styles.requestMeta}>
        <time className={styles.when} dateTime={run.created_at}>{formatDateTime(language, run.created_at, { dateStyle: "medium", timeStyle: "short" })}</time>
        {onReuse && <button type="button" className="icon-button" aria-label={t("agent.editAsNew")} title={t("agent.editAsNew")}
          disabled={reuseDisabled} onClick={() => onReuse(run.message)}><Pencil size={17} aria-hidden /></button>}
      </div>
    </div>}
    {inline && <p className={styles.asked} id={`${fieldId}-asked`}>{run.message}</p>}
    <div className={inline ? undefined : styles.agentRow}>
    {!inline && <span className={styles.avatar}><Bot size={18} aria-hidden /></span>}
    <div className={styles.agentSide}>
      {run.todos.length > 0 && <section aria-label={t("agent.plan")}>
        <ol className={styles.todos}>{run.todos.map((item, index) => <li key={`${index}-${item.content}`} data-status={item.status}>
          {item.status === "completed" ? <CheckCircle2 size={16} aria-hidden /> : item.status === "in_progress" ? <CircleDot size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
          <span>{item.content}</span><span className={styles.srOnly}>{t(todoKeys[item.status])}</span>
        </li>)}</ol>
      </section>}
      {run.tool_calls.length > 0 && <details className={styles.steps}>
        <summary>{t("agent.steps", { count: String(run.tool_calls.length) })}</summary>
        <ol>{run.tool_calls.map(step => <li key={step.id} data-failed={step.status === "failed" || undefined}>
          <span className={styles.stepKind}>{t(step.effect === "read" ? "agent.action.read" : "agent.action.write")}</span>
          <span>{step.summary.trim() || step.tool_name}</span>
        </li>)}</ol>
      </details>}
      {working && <AgentProgress run={run} stopping={busy} onStop={() => stop.mutate()} />}
      {stop.isError && <p className="message error" role="alert">{problemText(stop.error, t("agent.decisionError"))}
        {!working && !question && isUnknown(stop.error) && <button className="text-button" type="button" disabled={busy}
          onClick={() => stop.mutate()}><X size={17} aria-hidden />{t("agent.stop")}</button>}
      </p>}
      {!answerIntent && approval && (pending || approval.status !== "pending") && <section className={pending ? `${styles.approval} ${progressStyles.enter}` : styles.decided} aria-labelledby={`${fieldId}-check`}>
        <h3 id={`${fieldId}-check`}>{pending ? t("agent.check") : `${approval.summary} ${t(decisionKey(approval))}`}</h3>
        {pending && <p className={styles.approvalSummary}>{approval.summary}</p>}
        {pending && <dl className={styles.facts}>{approval.fields.map(item => <div key={item.label} style={{ display: "contents" }}><dt>{item.label}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{item.value}</dd></div>)}</dl>}
        {pending && <p className={styles.when}>{t("agent.waiting", { date: formatDateTime(language, approval.expires_at, { dateStyle: "medium", timeStyle: "short" }) })}</p>}
        {decision.isError && <p className="message error" role="alert">{problemText(decision.error, t("agent.decisionError"))}</p>}
        {pending && <div className={styles.actions}>
          <button className="primary-button" disabled={busy} onClick={() => choose("approve")}>{decision.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Check size={17} aria-hidden />}{decision.isError && isUnknown(decision.error) ? t("agent.approveAgain") : t("agent.approve")}</button>
          <button className="secondary-button" disabled={busy} onClick={() => choose("reject")}><X size={17} aria-hidden />{t("agent.reject")}</button>
        </div>}
      </section>}
      {question && <form className={`${styles.approval} ${progressStyles.enter}`} onSubmit={event => {
        event.preventDefault();
        if (!answerIntent && (!reply.trim() || replyTooLong)) return;
        const command = answerIntent ?? { run, answer: reply.trim() };
        setAnswerIntent(command);
        respond.mutate(command);
      }}>
        <p className={styles.bubbleText} id={`${fieldId}-question`}>{question.text}</p>
        <label className={styles.field}>{t("agent.answerLabel")}
          <input value={reply} maxLength={2000} aria-describedby={`${fieldId}-question`} aria-invalid={replyTooLong || undefined} disabled={busy || answerIntent !== null} onChange={event => setReply(event.target.value)} />
        </label>
        {replyTooLong && <p className="field-error" role="alert">{t("agent.answerLength")}</p>}
        {respond.isError && <p className="message error" role="alert">{problemText(respond.error, t("agent.answerError"))}</p>}
        <div className={styles.actions}>
          <button className="secondary-button" type="submit" disabled={busy || !reply.trim() || replyTooLong}><Send size={17} aria-hidden />{t(answerIntent && respond.isError ? "agent.sendAgain" : "agent.answer")}</button>
          <button className="text-button" type="button" disabled={busy} onClick={() => stop.mutate()}>{t("agent.stop")}</button>
        </div>
      </form>}
      {respond.isError && !question && <p className="message error" role="alert">{problemText(respond.error, t("agent.answerError"))}</p>}
      {run.answer && <div className={styles.bubble}><AgentMessageContent parts={response.parts} /></div>}
      {run.sources.length > 0 && <WebSources user={user} run={run} />}
      {run.handoffs.length > 0 && <nav className={styles.handoffs} aria-label={t("agent.openSpaceChats")}>
        {run.handoffs.map(item => <Link key={item.space_id} className={styles.handoff} href={`/app/messages?space_id=${item.space_id}`}>
          <MessageCircle size={16} aria-hidden />{t("agent.openSpaceChat", { name: item.name })}</Link>)}
      </nav>}
      {!working && <p className={styles.status}>{t(statusKey)}</p>}
      {(run.plan.length > 0 || run.evidence.length > 0 || run.tool_calls.length > 0 || run.events.length > 0) && <RunRecord run={run} />}
    </div>
    </div>
  </article>;
}

function RunRecord({ run }: { run: AgentRun }) {
  const t = useText();
  const { language } = useLanguage();
  const fieldId = useId();
  const recorded = (text: string) => text.trim() || t("agent.missingRecordText");
  const timestamp = (instant: string) => <time dateTime={instant}>{formatDateTime(language, instant, { dateStyle: "medium", timeStyle: "short" })}</time>;
  return <details className={styles.record}>
    <summary>{t("agent.requestDetails")}</summary>
    <div className={styles.recordContent}>
      <section className={styles.recordSection} aria-labelledby={`${fieldId}-plan`}>
        <h3 id={`${fieldId}-plan`}>{t("agent.plan")}</h3>
        {run.plan.length === 0 ? <p className={styles.recordEmpty}>{t("agent.noPlan")}</p>
          : <ol className={styles.recordList}>{run.plan.map(step => <li key={step.id}>
            <p className={styles.recordTitle}>{recorded(step.label)}</p>
            <p className={styles.recordMeta}>{t(`agent.planKind.${step.kind}`)}{" · "}{t(`agent.planStatus.${step.status}`)}</p>
          </li>)}</ol>}
      </section>
      <section className={styles.recordSection} aria-labelledby={`${fieldId}-sources`}>
        <h3 id={`${fieldId}-sources`}>{t("agent.sources")}</h3>
        {run.evidence.length === 0 ? <p className={styles.recordEmpty}>{t("agent.noSources")}</p>
          : <ul className={styles.recordList}>{run.evidence.map((source, index) => <li key={`${source.kind}:${source.ref}:${index}`}>
            <p className={styles.recordTitle}>{recorded(source.label)}</p>
            <p className={styles.recordMeta}>{t(`agent.evidenceKind.${source.kind}`)}</p>
            {source.ref && <p className={styles.recordReference}>{t("agent.sourceReference")} <code>{source.ref}</code></p>}
          </li>)}</ul>}
      </section>
      <section className={styles.recordSection} aria-labelledby={`${fieldId}-actions`}>
        <h3 id={`${fieldId}-actions`}>{t("agent.actions")}</h3>
        {run.tool_calls.length === 0 ? <p className={styles.recordEmpty}>{t("agent.noActions")}</p>
          : <ol className={styles.recordList}>{run.tool_calls.map(action => <li key={action.id}>
            <p className={styles.recordTitle}>{recorded(action.summary)}</p>
            <p className={styles.recordMeta}>{t(`agent.action.${action.effect}`)}{" · "}{t(`agent.action.${action.status}`)}</p>
            {action.result_ref && <p className={styles.recordReference}>{t("agent.resultReference")} <code>{action.result_ref}</code></p>}
            <p className={styles.recordMeta}>{timestamp(action.created_at)}</p>
          </li>)}</ol>}
      </section>
      <section className={styles.recordSection} aria-labelledby={`${fieldId}-activity`}>
        <h3 id={`${fieldId}-activity`}>{t("agent.activity")}</h3>
        {run.events.length === 0 ? <p className={styles.recordEmpty}>{t("agent.noActivity")}</p>
          : <ol className={styles.recordList}>{run.events.map(event => <li key={event.sequence}>
            <p className={styles.recordTitle}>{recorded(event.summary)}</p>
            <p className={styles.recordMeta}>{timestamp(event.created_at)}</p>
          </li>)}</ol>}
      </section>
    </div>
  </details>;
}

function WebSources({ user, run }: { user: Account; run: AgentRun }) {
  const t = useText();
  const { language } = useLanguage();
  const fieldId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["agentWebText", user.id, run.id, run.version], enabled: selected !== null, retry: false,
    queryFn: ({ signal }) => readWebText(user.id, run.id, signal),
  });
  useSessionGuard(preview.error);
  const denied = readAccessDenied(preview.error);
  const sources = run.sources;
  const videos = [...new Map(sources.filter(source => source.video_id).map(source => [source.video_id, source])).values()].slice(0, 3);
  return <>
    {videos.length > 0 && <div className={styles.videos}>{videos.map(source => <VideoSource key={source.video_id} source={source} />)}</div>}
    <details className={styles.webSources} onToggle={event => { if (!event.currentTarget.open) setSelected(null); }}>
      <summary>{t("agent.sources")}</summary>
      <ul>{sources.map((source, index) => {
        const opened = selected === source.url;
        const excerpt = preview.data?.sources.find(item => item.source.url === source.url);
        const label = t(opened ? "agent.hideSourceText" : "agent.viewSourceText", { title: source.title });
        return <li key={source.url}>
          <div className={styles.sourceHeading}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
            {source.read && !source.video_id && <button type="button" className="icon-button" aria-label={label} title={label}
              aria-expanded={opened} aria-controls={`${fieldId}-${index}`} onClick={() => setSelected(opened ? null : source.url)}>
              {opened ? <X size={17} aria-hidden /> : <FileText size={17} aria-hidden />}
            </button>}
          </div>
          <span>{t(source.read ? "agent.sourceRead" : "agent.sourceSearch")}</span>
          <span>{new URL(source.url).hostname}</span>
          {source.retrieved_at && <time className={styles.when} dateTime={source.retrieved_at}>
            {t("agent.sourceRetrieved", { date: formatDateTime(language, source.retrieved_at, { dateStyle: "medium", timeStyle: "short" }) })}
          </time>}
          <section id={`${fieldId}-${index}`} className={styles.sourceText} aria-label={t("agent.sourceText", { title: source.title })} hidden={!opened}>
            {opened && (preview.isPending || preview.isFetching ? <p role="status">{t("agent.sourceTextLoading")}</p>
              : preview.isError ? <div role="alert"><p>{denied ? t("agent.sourceTextUnavailable") : problemText(preview.error, t("agent.sourceTextError"))}</p>
                {!denied && <button type="button" className="icon-button" aria-label={t("agent.retry")} title={t("agent.retry")} onClick={() => void preview.refetch()}><RefreshCw size={17} aria-hidden /></button>}
              </div> : excerpt ? <>
                {excerpt.partial && <p className={styles.hint}>{t("agent.sourceTextPartial")}</p>}
                <pre tabIndex={0}>{excerpt.text}</pre>
              </> : <p>{t("agent.sourceTextUnavailable")}</p>)}
          </section>
        </li>;
      })}</ul>
    </details>
  </>;
}

function VideoSource({ source }: { source: AgentRun["sources"][number] }) {
  const t = useText();
  const [playing, setPlaying] = useState(false);
  if (!source.video_id) return null;
  return <figure className={styles.video}>
    <div className={styles.videoFrame}>
      {playing ? <iframe
        src={`https://www.youtube-nocookie.com/embed/${source.video_id}?autoplay=1&playsinline=1&rel=0`}
        title={source.title} referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
      /> : <button type="button" className={styles.videoStart} aria-label={t("agent.playVideo", { title: source.title })} onClick={() => setPlaying(true)}>
        <Play size={36} aria-hidden /><span>YouTube</span>
      </button>}
    </div>
    <figcaption className={styles.videoCaption}>
      <strong>{source.title}</strong>
      <div className={styles.videoActions}>
        <a href={source.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden />{t("agent.openVideo")}</a>
        {playing && <button type="button" className="icon-button" aria-label={t("agent.closeVideo")} title={t("agent.closeVideo")} onClick={() => setPlaying(false)}><X size={18} aria-hidden /></button>}
      </div>
    </figcaption>
  </figure>;
}

function decisionKey({ status, reason }: NonNullable<AgentRun["approval"]>) {
  if (status === "approved") return reason === "auto_approved" ? "agent.decision.auto" : "agent.decision.approved";
  return status === "rejected" ? "agent.decision.rejected" : "agent.decision.closed";
}

function Memories({ user }: { user: Account }) {
  const client = useQueryClient();
  const t = useText();
  const [confirm, setConfirm] = useState<AgentMemory | null>(null);
  const [editing, setEditing] = useState<{ memory: AgentMemory; content: string; enabled: boolean } | null>(null);
  const memories = useQuery({ queryKey: ["agentMemories", user.id], queryFn: ({ signal }) => readMemories(user.id, signal) });
  const denied = readAccessDenied(memories.error);
  useEffect(() => { if (denied) { setConfirm(null); setEditing(null); } }, [denied]);
  const forget = useMutation({
    mutationFn: (memory: AgentMemory) => forgetMemory(user.id, memory.id),
    onSuccess: async () => { setConfirm(null); await client.invalidateQueries({ queryKey: ["agentMemories", user.id] }); },
  });
  const change = useMutation({
    mutationFn: (intent: MemoryEditIntent) => editMemory(intent),
    onSuccess: async () => { setEditing(null); await client.invalidateQueries({ queryKey: ["agentMemories", user.id] }); },
    onError: error => {
      if (readAccessDenied(error)) setEditing(null);
      if (readAccessDenied(error) || error instanceof ApiError && error.status === 412) {
        void client.invalidateQueries({ queryKey: ["agentMemories", user.id] });
      }
    },
  });
  const uncertain = change.isError && isUnknown(change.error);
  const conflict = change.error instanceof ApiError && change.error.status === 412;
  const busy = forget.isPending || change.isPending || uncertain;
  const validDraft = editing && editing.content.trim().length > 0 && characters(editing.content.trim()) <= 200;
  const changed = editing && (editing.content.trim() !== editing.memory.content || editing.enabled !== editing.memory.enabled);
  const openEditor = (memory: AgentMemory) => {
    change.reset();
    setEditing({ memory, content: memory.content, enabled: memory.enabled !== false });
  };
  const readError = memories.isError && <p className="message error" role="alert">{problemText(memories.error, t("agent.memoriesError"))}<button className="text-button" disabled={memories.isFetching} onClick={() => void memories.refetch()}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></p>;
  useSessionGuard(memories.error ?? forget.error);
  useSessionGuard(change.error);
  return <section aria-labelledby="agent-memories">
    <h2 id="agent-memories">{t("agent.memoriesHeading")}</h2>
    <p className={styles.hint}>{t("agent.memoriesHint")}</p>
    {memories.isPending && <p role="status">{t("agent.loadingMemories")}</p>}
    {readError}
    {change.isSuccess && <p className="message" role="status">{t("agent.memorySaved")}</p>}
    {change.isError && !editing && !denied && <p className="message error" role="alert">{problemText(change.error, t("agent.memoryEditError"))}
      {uncertain && change.variables && <button className="text-button" disabled={memories.isError || memories.isFetching || change.isPending} onClick={() => change.mutate(change.variables!)}><RefreshCw size={17} aria-hidden />{t("agent.memoryRetry")}</button>}
    </p>}
    {memories.isSuccess && memories.data.length === 0 && <p className={styles.empty}>{t("agent.emptyMemories")}</p>}
    {!memories.isError && memories.data && memories.data.length > 0 && <ul className={styles.memories}>{memories.data.map(memory => <li key={memory.id}>
      <p><span className={styles.label}>{memory.label}{memory.enabled === false ? ` - ${t("agent.memoryDisabled")}` : ""}</span>{memory.content}</p>
      <div className={styles.memoryActions}>
        {memory.etag && memory.version && <button className="text-button" disabled={busy} aria-label={t("agent.editNamedMemory", { content: memory.content })} onClick={() => openEditor(memory)}><Pencil size={16} aria-hidden />{t("agent.editMemory")}</button>}
        <button className="text-button" disabled={busy} aria-label={t("agent.deleteNamedMemory", { content: memory.content })} onClick={() => { forget.reset(); setConfirm(memory); }}><Trash2 size={16} aria-hidden />{t("agent.delete")}</button>
      </div>
    </li>)}</ul>}
    {editing && !denied && <ConfirmDialog title={t("agent.memoryEditTitle")} closeLabel={t("agent.close")} className={styles.dialog} onClose={() => setEditing(null)} locked={change.isPending}>
      <form className={styles.memoryForm} onSubmit={event => {
        event.preventDefault();
        if (!validDraft || !changed || busy || conflict || memories.isError) return;
        change.mutate({ accountId: user.id, memory: editing.memory, key: crypto.randomUUID(),
          changes: { content: editing.content.trim(), enabled: editing.enabled } });
      }}>
        <label>{t("agent.memoryText")}<textarea rows={3} value={editing.content} disabled={change.isPending || uncertain}
          onChange={event => setEditing({ ...editing, content: event.target.value })} /></label>
        <label className={styles.memoryEnabled}><input type="checkbox" checked={editing.enabled} disabled={change.isPending || uncertain}
          onChange={event => setEditing({ ...editing, enabled: event.target.checked })} />{t("agent.memoryEnabled")}</label>
        <p className={styles.hint}>{t("agent.memoryUseWarning")}</p>
        {!validDraft && <p className="field-error" role="alert">{t("agent.memoryLength")}</p>}
        {readError}
        {change.isError && <p className="message error" role="alert">{problemText(change.error, t("agent.memoryEditError"))}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={change.isPending} onClick={() => setEditing(null)}>{t("agent.close")}</button>
          {uncertain && change.variables ? <button type="button" className="primary-button" disabled={memories.isError || memories.isFetching || change.isPending} onClick={() => change.mutate(change.variables!)}><RefreshCw size={17} aria-hidden />{t("agent.memoryRetry")}</button>
            : conflict ? <button type="button" className="primary-button" disabled={memories.isError || memories.isFetching} onClick={() => {
              const latest = memories.data?.find(memory => memory.id === editing.memory.id);
              if (latest) openEditor(latest);
              else setEditing(null);
            }}><RefreshCw size={17} aria-hidden />{t("agent.memoryReviewLatest")}</button>
            : <button type="submit" className="primary-button" disabled={!validDraft || !changed || change.isPending || memories.isError}><Save size={17} aria-hidden />{t("agent.memorySave")}</button>}
        </div>
      </form>
    </ConfirmDialog>}
    {confirm && !denied && <ConfirmDialog title={t("agent.deleteTitle")} closeLabel={t("agent.close")} className={styles.dialog} onClose={() => setConfirm(null)} locked={forget.isPending}>
      <p><strong>{confirm.label}:</strong> {confirm.content}</p>
      <p className={styles.hint}>{t("agent.deleteWarning")}</p>
      {readError}
      {forget.isError && <p className="message error" role="alert">{problemText(forget.error, t("agent.deleteError"))}</p>}
      <div className="dialog-actions">
        <button className="secondary-button" disabled={forget.isPending} onClick={() => setConfirm(null)}>{t("agent.keep")}</button>
        <button className="primary-button" disabled={forget.isPending || memories.isError} onClick={() => forget.mutate(confirm)}><Trash2 size={17} aria-hidden />{t("agent.deleteMemory")}</button>
      </div>
    </ConfirmDialog>}
  </section>;
}
