"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Bot, Check, CheckCircle2, Circle, CircleDot, ExternalLink, FileText, LoaderCircle, MessageCircle, Play, RefreshCw, Send, Square, Trash2, X, Zap, ZapOff } from "lucide-react";

import { ApiError, characters } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { answerQuestion, askAgent, cancelRun, decide, forgetMemory, isWorking, messageSchema, readMemories, readRun, readWebText, runPage } from "./client";
import type { AgentMemory, AgentRun, AskIntent, DecisionIntent } from "./client";
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
      <div className={styles.tabs} role="group" aria-label={t("agent.viewLabel")}>
        <button className={styles.tab} aria-pressed={view === "chat"} onClick={() => setView("chat")}>{t("agent.chat")}</button>
        <button className={styles.tab} aria-pressed={view === "memories"} onClick={() => setView("memories")}>{t("agent.memories")}</button>
      </div>
    </div>
    </div>
    {view === "memories" ? <Memories user={user} /> : <Conversation user={user} initialSpaceId={initialSpaceId} />}
  </main></Shell>;
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
  const key = ["agentRuns", user.id, "main"];
  const runs = useInfiniteQuery({
    queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => runPage(user.id, spaceId, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
    // A run works in the background: keep reading it until it answers or waits for you, and recover by itself
    // after the server was briefly unreachable (for example while it restarts).
    refetchInterval: query => query.state.status === "error" ? 5000 : query.state.data?.pages.some(page => page.data.some(isWorking)) ? 1500 : false,
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
  const sendLabel = intent && ask.isError ? t("agent.sendAgain") : t("agent.ask");
  return <section className={styles.chat} aria-labelledby={`${fieldId}-history`}>
    <div className={styles.chatHead}>
      <h2 id={`${fieldId}-history`} className={styles.chatTitle}>{t("agent.mainScope")}</h2>
      <p className={styles.srOnly}>{t("agent.mainHint")}</p>
      <button className="icon-button" aria-label={t("agent.refreshRequests")} title={t("agent.refreshRequests")} disabled={runs.isFetching} onClick={() => refresh()}><RefreshCw size={18} className={runs.isFetching ? "spin" : ""} aria-hidden /></button>
    </div>
    <div ref={scroller} className={styles.scroller} role="log" aria-label={t("agent.chat")} aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={onScroll}>
      {initialSpaceId && <p className="message" role="status">{t("agent.spaceHere")}{" "}
        <Link className="text-button" href={`/app/messages?space_id=${initialSpaceId}`}><MessageCircle size={16} aria-hidden />{t("agent.openThisSpaceChat")}</Link></p>}
      {!denied && runs.hasNextPage && <button className={`text-button ${styles.earlier}`} disabled={runs.isFetching} onClick={() => runs.fetchNextPage()}>{t("agent.showEarlier")}</button>}
      {runs.isPending && <p role="status" className={styles.empty}>{t("agent.loadingRequests")}</p>}
      {runs.isError && <p className="message error" role="alert">{problemText(runs.error, t("agent.requestsError"))}</p>}
      {!runs.isPending && !runs.isError && rows.length === 0 && <div className={styles.welcome}>
        <span className={styles.welcomeIcon}><Bot size={28} aria-hidden /></span>
        <p className={styles.empty}>{t("agent.emptyRequests")}</p>
        {!denied && <div className={styles.suggestions} role="group" aria-label={t("agent.suggestions")}>
          {suggestionKeys.map(item => <button key={item} type="button" className={styles.suggestion} onClick={() => suggest(t(item))}>{t(item)}</button>)}
        </div>}
      </div>}
      <ol className={styles.thread}>{rows.map(run => <li key={run.id}><Turn user={user} run={run} onChanged={refresh} /></li>)}</ol>
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
  const key = ["agentMessageRun", user.id, conversationId, messageId, runId] as const;
  const run = useQuery({
    queryKey: key, enabled: expanded, retry: false,
    queryFn: ({ signal }) => readRun(user.id, runId, signal),
    refetchInterval: query => query.state.data && isWorking(query.state.data) ? 1500 : false,
  });
  useSessionGuard(run.error);
  useEffect(() => () => { void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, user.id, conversationId, messageId, runId]);
  const unavailable = run.error instanceof ApiError && [401, 403, 404].includes(run.error.status);
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
        <button className="icon-button" type="button" aria-label={t("agent.refreshRequests")} title={t("agent.refreshRequests")}
          disabled={run.isFetching} onClick={() => void run.refetch()}><RefreshCw size={18} className={run.isFetching ? "spin" : ""} aria-hidden /></button>
      </div>
      {run.isPending && expanded && !unavailable && <p role="status">{t("agent.loadingRequests")}</p>}
      {unavailable && <p className="message error" role="alert">{t("chat.agentRequestUnavailable")}</p>}
      {run.error && !unavailable && <p className="message error" role="alert">{problemText(run.error, t("agent.requestsError"))}</p>}
      {run.data && !unavailable && <Turn user={user} run={run.data} onChanged={changed} inline />}
    </section>
  </div>;
}

function Turn({ user, run, onChanged, inline = false }: { user: Account; run: AgentRun; onChanged: (updated?: AgentRun) => Promise<unknown> | unknown; inline?: boolean }) {
  const t = useText();
  const { language } = useLanguage();
  const fieldId = useId();
  const keys = useRef(new Map<string, string>());
  const [reply, setReply] = useState("");
  const replyTooLong = characters(reply.trim()) > 1000;
  const decision = useMutation({
    mutationFn: (command: DecisionIntent) => decide(command),
    onSuccess: updated => onChanged(updated),
    onError: error => { if (!isUnknown(error)) void onChanged(); },
  });
  const respond = useMutation({
    mutationFn: (answer: string) => answerQuestion(user.id, run, answer),
    onSuccess: updated => { setReply(""); return onChanged(updated); },
    onError: error => { if (!isUnknown(error)) void onChanged(); },
  });
  const stop = useMutation({ mutationFn: () => cancelRun(user.id, run.id), onSuccess: updated => onChanged(updated) });
  useSessionGuard(decision.error ?? respond.error ?? stop.error);
  const busy = decision.isPending || respond.isPending || stop.isPending;
  const approval = run.approval;
  const pending = run.status === "waiting_for_approval" && approval?.status === "pending";
  const working = isWorking(run);
  const progress = run.events.at(-1)?.summary;
  const choose = (action: "approve" | "reject") => {
    if (!approval) return;
    const existing = keys.current.get(`${approval.id}:${action}`) ?? crypto.randomUUID();
    keys.current.set(`${approval.id}:${action}`, existing);
    decision.mutate({ accountId: user.id, approval, action, key: existing });
  };
  const ended = !working && run.status !== "completed" && run.status !== "waiting_for_approval" && run.status !== "waiting_for_user";
  return <article className={inline ? styles.inlineRun : styles.turn} aria-labelledby={`${fieldId}-asked`}>
    {!inline && <div className={styles.mine}>
      <p className={styles.bubbleText} id={`${fieldId}-asked`}>{run.message}</p>
      <time className={styles.when} dateTime={run.created_at}>{formatDateTime(language, run.created_at, { dateStyle: "medium", timeStyle: "short" })}</time>
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
      {working && <p className={styles.thinking} role="status"><LoaderCircle size={16} className="spin" aria-hidden /><span>{progress && progress !== "Request received." ? progress : t("agent.thinking")}</span>
        <button className="text-button" type="button" disabled={busy} onClick={() => stop.mutate()}><Square size={14} aria-hidden />{t("agent.stop")}</button></p>}
      {approval && (pending || approval.status !== "pending") && <section className={pending ? styles.approval : styles.decided} aria-labelledby={`${fieldId}-check`}>
        <h3 id={`${fieldId}-check`}>{pending ? t("agent.check") : `${approval.summary} ${t(decisionKey(approval))}`}</h3>
        {pending && <p className={styles.approvalSummary}>{approval.summary}</p>}
        {pending && <dl className={styles.facts}>{approval.fields.map(item => <div key={item.label} style={{ display: "contents" }}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
        {pending && <p className={styles.when}>{t("agent.waiting", { date: formatDateTime(language, approval.expires_at, { dateStyle: "medium", timeStyle: "short" }) })}</p>}
        {decision.isError && <p className="message error" role="alert">{problemText(decision.error, t("agent.decisionError"))}</p>}
        {pending && <div className={styles.actions}>
          <button className="primary-button" disabled={busy} onClick={() => choose("approve")}>{decision.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Check size={17} aria-hidden />}{decision.isError && isUnknown(decision.error) ? t("agent.approveAgain") : t("agent.approve")}</button>
          <button className="secondary-button" disabled={busy} onClick={() => choose("reject")}><X size={17} aria-hidden />{t("agent.reject")}</button>
        </div>}
      </section>}
      {run.question && <form className={styles.approval} onSubmit={event => { event.preventDefault(); if (reply.trim() && !replyTooLong) respond.mutate(reply.trim()); }}>
        <p className={styles.bubbleText} id={`${fieldId}-question`}>{run.question.text}</p>
        <label className={styles.field}>{t("agent.answerLabel")}
          <input value={reply} maxLength={2000} aria-describedby={`${fieldId}-question`} aria-invalid={replyTooLong || undefined} disabled={busy} onChange={event => setReply(event.target.value)} />
        </label>
        {replyTooLong && <p className="field-error" role="alert">{t("agent.answerLength")}</p>}
        {respond.isError && <p className="message error" role="alert">{problemText(respond.error, t("agent.answerError"))}</p>}
        <div className={styles.actions}>
          <button className="secondary-button" type="submit" disabled={busy || !reply.trim() || replyTooLong}><Send size={17} aria-hidden />{t("agent.answer")}</button>
          <button className="text-button" type="button" disabled={busy} onClick={() => stop.mutate()}>{t("agent.stop")}</button>
        </div>
      </form>}
      {run.answer && <div className={styles.bubble}><p className={styles.bubbleText}>{run.answer}</p></div>}
      {run.sources.length > 0 && <WebSources user={user} run={run} />}
      {run.handoffs.length > 0 && <nav className={styles.handoffs} aria-label={t("agent.openSpaceChats")}>
        {run.handoffs.map(item => <Link key={item.space_id} className={styles.handoff} href={`/app/messages?space_id=${item.space_id}`}>
          <MessageCircle size={16} aria-hidden />{t("agent.openSpaceChat", { name: item.name })}</Link>)}
      </nav>}
      {ended && <p className={styles.status}>{t(statusKeys[run.status])}</p>}
    </div>
    </div>
  </article>;
}

function WebSources({ user, run }: { user: Account; run: AgentRun }) {
  const t = useText();
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
  const memories = useQuery({ queryKey: ["agentMemories", user.id], queryFn: ({ signal }) => readMemories(user.id, signal) });
  const denied = readAccessDenied(memories.error);
  useEffect(() => { if (denied) setConfirm(null); }, [denied]);
  const forget = useMutation({
    mutationFn: (memory: AgentMemory) => forgetMemory(user.id, memory.id),
    onSuccess: async () => { setConfirm(null); await client.invalidateQueries({ queryKey: ["agentMemories", user.id] }); },
  });
  useSessionGuard(memories.error ?? forget.error);
  return <section aria-labelledby="agent-memories">
    <h2 id="agent-memories">{t("agent.memoriesHeading")}</h2>
    <p className={styles.hint}>{t("agent.memoriesHint")}</p>
    {memories.isPending && <p role="status">{t("agent.loadingMemories")}</p>}
    {memories.isError && <p className="message error" role="alert">{problemText(memories.error, t("agent.memoriesError"))}<button className="text-button" disabled={memories.isFetching} onClick={() => void memories.refetch()}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></p>}
    {memories.isSuccess && memories.data.length === 0 && <p className={styles.empty}>{t("agent.emptyMemories")}</p>}
    {!denied && memories.data && memories.data.length > 0 && <ul className={styles.memories}>{memories.data.map(memory => <li key={memory.id}>
      <p><span className={styles.label}>{memory.label}</span>{memory.content}</p>
      <button className="text-button" aria-label={t("agent.deleteNamedMemory", { content: memory.content })} onClick={() => { forget.reset(); setConfirm(memory); }}><Trash2 size={16} aria-hidden />{t("agent.delete")}</button>
    </li>)}</ul>}
    {confirm && !denied && <ConfirmDialog title={t("agent.deleteTitle")} onClose={() => setConfirm(null)} locked={forget.isPending}>
      <p><strong>{confirm.label}:</strong> {confirm.content}</p>
      <p className={styles.hint}>{t("agent.deleteWarning")}</p>
      {forget.isError && <p className="message error" role="alert">{problemText(forget.error, t("agent.deleteError"))}</p>}
      <div className="dialog-actions">
        <button className="secondary-button" disabled={forget.isPending} onClick={() => setConfirm(null)}>{t("agent.keep")}</button>
        <button className="primary-button" disabled={forget.isPending} onClick={() => forget.mutate(confirm)}><Trash2 size={17} aria-hidden />{t("agent.deleteMemory")}</button>
      </div>
    </ConfirmDialog>}
  </section>;
}

function ConfirmDialog({ title, locked, onClose, children }: { title: string; locked: boolean; onClose: () => void; children: React.ReactNode }) {
  const t = useText();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { if (locked) event.preventDefault(); else onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={t("agent.close")} title={t("agent.close")} disabled={locked} onClick={onClose}><X size={18} aria-hidden /></button></div>
    {children}
  </dialog>;
}
