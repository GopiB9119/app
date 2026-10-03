"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, RefreshCw, Send, Trash2, X } from "lucide-react";

import { ApiError, api, characters } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { spacesSchema } from "@/features/spaces/client";
import { answerQuestion, askAgent, cancelRun, decide, forgetMemory, messageSchema, readMemories, runPage } from "./client";
import type { AgentMemory, AgentRun, AskIntent, DecisionIntent } from "./client";
import { useLanguage, useText, formatDateTime } from "@/features/i18n/i18n";
import styles from "./agents.module.css";

export function AgentScreen() {
  const viewer = useViewer();
  const t = useText();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("agent.loading")}</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>{t("agent.unavailableTitle")}</h1><p role="alert">{problemText(viewer.error, t("agent.unavailableFallback"))}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />{t("agent.retry")}</button></main></Shell>;
  }
  return <Agent key={viewer.account.id} user={viewer.account} />;
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

function Agent({ user }: { user: Account }) {
  const t = useText();
  const spaces = useQuery({ queryKey: ["agentSpaces", user.id], queryFn: ({ signal }) => api("spaces", spacesSchema, { accountId: user.id, signal }) });
  const [chosen, setChosen] = useState("");
  const [view, setView] = useState<"requests" | "memories">("requests");
  const spaceList = spaces.data?.data ?? [];
  const spaceId = spaceList.some(space => space.id === chosen) ? chosen : spaceList[0]?.id ?? "";
  useSessionGuard(spaces.error);
  return <Shell account><main className={styles.main}>
    <header className={styles.header}>
      <h1>{t("agent.heading")}</h1>
      <p>{t("agent.description")}</p>
    </header>
    <div className={styles.tabs} role="group" aria-label={t("agent.viewLabel")}>
      <button className={styles.tab} aria-pressed={view === "requests"} onClick={() => setView("requests")}>{t("agent.requests")}</button>
      <button className={styles.tab} aria-pressed={view === "memories"} onClick={() => setView("memories")}>{t("agent.memories")}</button>
    </div>
    {view === "memories" ? <Memories user={user} /> : <>
      {spaces.isPending && <p role="status">{t("agent.loadingSpaces")}</p>}
      {spaces.isError && <p className="message error" role="alert">{problemText(spaces.error, t("agent.spacesError"))}</p>}
      {spaces.data && spaceList.length === 0 && <p className={styles.empty}>{t("agent.spacesEmpty")}</p>}
      {spaceId && <>
        <div className={styles.controls}>
          <label className={styles.field}>{t("agent.space")}
            <select value={spaceId} onChange={event => setChosen(event.target.value)}>
              {spaceList.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>
        </div>
        <Requests key={spaceId} user={user} spaceId={spaceId} agentEnabled={spaceList.find(space => space.id === spaceId)?.agent_enabled ?? true} />
      </>}
    </>}
  </main></Shell>;
}

function Requests({ user, spaceId, agentEnabled }: { user: Account; spaceId: string; agentEnabled: boolean }) {
  const client = useQueryClient();
  const t = useText();
  const fieldId = useId();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const [intent, setIntent] = useState<AskIntent | null>(null);
  const key = ["agentRuns", user.id, spaceId];
  const runs = useInfiniteQuery({
    queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => runPage(user.id, spaceId, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
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
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = messageSchema.safeParse(text);
    if (!parsed.success) {
      setProblem(!text.trim() ? t("agent.requestRequired") : characters(text.trim()) > 500
        ? t("agent.requestLength") : parsed.error.issues[0]?.message ?? t("agent.requestRequired"));
      return;
    }
    setProblem("");
    const command = intent && intent.message === parsed.data ? intent : { accountId: user.id, spaceId, message: parsed.data, key: crypto.randomUUID() };
    setIntent(command);
    ask.mutate(command);
  };
  const rows = [...new Map(runs.data?.pages.flatMap(page => page.data).map(run => [run.id, run] as const) ?? []).values()];
  return <>
    {!agentEnabled && <p className="message" role="status">{t("agent.offInSpace")}</p>}
    {agentEnabled && <form className={styles.composer} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-message`}>{t("agent.message")}</label>
        <span className={styles.hint} id={`${fieldId}-hint`}>{t("agent.hint")}</span>
        <textarea id={`${fieldId}-message`} rows={2} maxLength={1000} value={text} aria-describedby={`${fieldId}-hint`}
          aria-invalid={!!problem} disabled={ask.isPending || (!!intent && ask.isError)} onChange={event => { setText(event.target.value); setProblem(""); }} />
      </div>
      {problem && <p className="field-error" role="alert">{problem}</p>}
      {ask.isError && <p className="message error" role="alert">{problemText(ask.error, t("agent.sendError"))}</p>}
      <div className={styles.actions}>
        <button className="primary-button" type="submit" disabled={ask.isPending}>{ask.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Send size={17} aria-hidden />}{intent && ask.isError ? t("agent.sendAgain") : t("agent.ask")}</button>
        {intent && ask.isError && <button className="text-button" type="button" onClick={() => { setIntent(null); ask.reset(); }}>{t("agent.editRequest")}</button>}
      </div>
    </form>}
    <section aria-labelledby={`${fieldId}-history`}>
      <div className={styles.runHead}><h2 id={`${fieldId}-history`}>{t("agent.yourRequests")}</h2>
        <button className="icon-button" aria-label={t("agent.refreshRequests")} title={t("agent.refreshRequests")} disabled={runs.isFetching} onClick={() => refresh()}><RefreshCw size={18} className={runs.isFetching ? "spin" : ""} aria-hidden /></button>
      </div>
      {runs.isPending && <p role="status">{t("agent.loadingRequests")}</p>}
      {runs.isError && <p className="message error" role="alert">{problemText(runs.error, t("agent.requestsError"))}</p>}
      {!runs.isPending && !runs.isError && rows.length === 0 && <p className={styles.empty}>{t("agent.emptyRequests")}</p>}
      <ul className={styles.list}>{rows.map(run => <li key={run.id}><RunCard user={user} run={run} onChanged={refresh} /></li>)}</ul>
      {runs.hasNextPage && <button className="text-button" disabled={runs.isFetching} onClick={() => runs.fetchNextPage()}>{t("agent.showEarlier")}</button>}
    </section>
  </>;
}

const statusKeys = {
  queued: "agent.status.queued", running: "agent.status.running", waiting_for_approval: "agent.status.waiting_for_approval",
  waiting_for_user: "agent.status.waiting_for_user", verifying: "agent.status.verifying", completed: "agent.status.completed",
  failed: "agent.status.failed", cancelled: "agent.status.cancelled", timed_out: "agent.status.timed_out", expired: "agent.status.expired",
} as const satisfies Record<AgentRun["status"], string>;

function RunCard({ user, run, onChanged }: { user: Account; run: AgentRun; onChanged: () => Promise<unknown> }) {
  const t = useText();
  const { language } = useLanguage();
  const fieldId = useId();
  const keys = useRef(new Map<string, string>());
  const [reply, setReply] = useState("");
  // The server takes an answer of up to 500 characters, an emoji counting once.
  const replyTooLong = characters(reply.trim()) > 500;
  const decision = useMutation({
    mutationFn: (command: DecisionIntent) => decide(command),
    onSuccess: () => onChanged(),
    onError: error => { if (!isUnknown(error)) void onChanged(); },
  });
  const respond = useMutation({
    mutationFn: (answer: string) => answerQuestion(user.id, run, answer),
    onSuccess: () => { setReply(""); return onChanged(); },
    onError: error => { if (!isUnknown(error)) void onChanged(); },
  });
  const stop = useMutation({ mutationFn: () => cancelRun(user.id, run.id), onSuccess: () => onChanged() });
  useSessionGuard(decision.error ?? respond.error ?? stop.error);
  const busy = decision.isPending || respond.isPending || stop.isPending;
  const approval = run.approval;
  const pending = run.status === "waiting_for_approval" && approval?.status === "pending";
  const choose = (action: "approve" | "reject") => {
    if (!approval) return;
    const existing = keys.current.get(`${approval.id}:${action}`) ?? crypto.randomUUID();
    keys.current.set(`${approval.id}:${action}`, existing);
    decision.mutate({ accountId: user.id, approval, action, key: existing });
  };
  return <article className={styles.run} aria-labelledby={`${fieldId}-asked`}>
    <div className={styles.runHead}>
      <div><p className={styles.asked} id={`${fieldId}-asked`}>{run.message}</p><p className={styles.when}>{formatDateTime(language, run.created_at, { dateStyle: "medium", timeStyle: "short" })}</p></div>
      <span className={styles.status}>{t(statusKeys[run.status])}</span>
    </div>
    {run.answer && <p className={styles.answer}>{run.answer}</p>}
    {run.question && <form className={styles.check} onSubmit={event => { event.preventDefault(); if (reply.trim() && !replyTooLong) respond.mutate(reply.trim()); }}>
      <p className={styles.answer} id={`${fieldId}-question`}>{run.question.text}</p>
      <label className={styles.field}>{t("agent.answerLabel")}
        <input value={reply} maxLength={1000} aria-describedby={`${fieldId}-question`} aria-invalid={replyTooLong || undefined} disabled={busy} onChange={event => setReply(event.target.value)} />
      </label>
      {replyTooLong && <p className="field-error" role="alert">{t("agent.answerLength")}</p>}
      {respond.isError && <p className="message error" role="alert">{problemText(respond.error, t("agent.answerError"))}</p>}
      <div className={styles.actions}>
        <button className="secondary-button" type="submit" disabled={busy || !reply.trim() || replyTooLong}><Send size={17} aria-hidden />{t("agent.answer")}</button>
        <button className="text-button" type="button" disabled={busy} onClick={() => stop.mutate()}>{t("agent.stop")}</button>
      </div>
    </form>}
    {approval && <section className={styles.check} aria-labelledby={`${fieldId}-check`}>
      <h3 id={`${fieldId}-check`}>{pending ? t("agent.check") : approval.summary}</h3>
      <dl className={styles.facts}>{approval.fields.map(item => <div key={item.label} style={{ display: "contents" }}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      {pending && <p className={styles.when}>{t("agent.waiting", { date: formatDateTime(language, approval.expires_at, { dateStyle: "medium", timeStyle: "short" }) })}</p>}
      {decision.isError && <p className="message error" role="alert">{problemText(decision.error, t("agent.decisionError"))}</p>}
      {pending && <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => choose("approve")}>{decision.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Check size={17} aria-hidden />}{decision.isError && isUnknown(decision.error) ? t("agent.approveAgain") : t("agent.approve")}</button>
        <button className="secondary-button" disabled={busy} onClick={() => choose("reject")}><X size={17} aria-hidden />{t("agent.reject")}</button>
      </div>}
    </section>}
  </article>;
}

function Memories({ user }: { user: Account }) {
  const client = useQueryClient();
  const t = useText();
  const [confirm, setConfirm] = useState<AgentMemory | null>(null);
  const memories = useQuery({ queryKey: ["agentMemories", user.id], queryFn: ({ signal }) => readMemories(user.id, signal) });
  const forget = useMutation({
    mutationFn: (memory: AgentMemory) => forgetMemory(user.id, memory.id),
    onSuccess: async () => { setConfirm(null); await client.invalidateQueries({ queryKey: ["agentMemories", user.id] }); },
  });
  useSessionGuard(memories.error ?? forget.error);
  return <section aria-labelledby="agent-memories">
    <h2 id="agent-memories">{t("agent.memoriesHeading")}</h2>
    <p className={styles.hint}>{t("agent.memoriesHint")}</p>
    {memories.isPending && <p role="status">{t("agent.loadingMemories")}</p>}
    {memories.isError && <p className="message error" role="alert">{problemText(memories.error, t("agent.memoriesError"))}</p>}
    {memories.data && memories.data.length === 0 && <p className={styles.empty}>{t("agent.emptyMemories")}</p>}
    {memories.data && memories.data.length > 0 && <ul className={styles.memories}>{memories.data.map(memory => <li key={memory.id}>
      <p><span className={styles.label}>{memory.label}</span>{memory.content}</p>
      <button className="text-button" aria-label={t("agent.deleteNamedMemory", { content: memory.content })} onClick={() => { forget.reset(); setConfirm(memory); }}><Trash2 size={16} aria-hidden />{t("agent.delete")}</button>
    </li>)}</ul>}
    {confirm && <ConfirmDialog title={t("agent.deleteTitle")} onClose={() => setConfirm(null)} locked={forget.isPending}>
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
