"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, RefreshCw, Send, Trash2, X } from "lucide-react";

import { ApiError, api } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { spacesSchema } from "@/features/spaces/client";
import { answerQuestion, askAgent, cancelRun, decide, forgetMemory, messageSchema, readMemories, runPage, statusLabels } from "./client";
import type { AgentMemory, AgentRun, AskIntent, DecisionIntent } from "./client";
import styles from "./agents.module.css";

const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function AgentScreen() {
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading the agent</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>Agent unavailable</h1><p role="alert">{problemText(viewer.error, "The agent could not load.")}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />Retry</button></main></Shell>;
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
  const spaces = useQuery({ queryKey: ["agentSpaces", user.id], queryFn: ({ signal }) => api("spaces", spacesSchema, { accountId: user.id, signal }) });
  const [chosen, setChosen] = useState("");
  const [view, setView] = useState<"requests" | "memories">("requests");
  const spaceList = spaces.data?.data ?? [];
  const spaceId = spaceList.some(space => space.id === chosen) ? chosen : spaceList[0]?.id ?? "";
  useSessionGuard(spaces.error);
  return <Shell account><main className={styles.main}>
    <header className={styles.header}>
      <h1>Agent</h1>
      <p>Ask for help with tasks and your own reminders. The agent follows fixed rules, not AI. It shows you every change first and does nothing until you approve it. It never deals with medicines, money, members or contacting anyone.</p>
    </header>
    <div className={styles.tabs} role="group" aria-label="Agent view">
      <button className={styles.tab} aria-pressed={view === "requests"} onClick={() => setView("requests")}>Requests</button>
      <button className={styles.tab} aria-pressed={view === "memories"} onClick={() => setView("memories")}>Memories</button>
    </div>
    {view === "memories" ? <Memories user={user} /> : <>
      {spaces.isPending && <p role="status">Loading your Spaces...</p>}
      {spaces.isError && <p className="message error" role="alert">{problemText(spaces.error, "Your Spaces could not load.")}</p>}
      {spaces.data && spaceList.length === 0 && <p className={styles.empty}>Create or join a Space first. The agent works inside one Space at a time.</p>}
      {spaceId && <>
        <div className={styles.controls}>
          <label className={styles.field}>Space
            <select value={spaceId} onChange={event => setChosen(event.target.value)}>
              {spaceList.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>
        </div>
        <Requests key={spaceId} user={user} spaceId={spaceId} />
      </>}
    </>}
  </main></Shell>;
}

function Requests({ user, spaceId }: { user: Account; spaceId: string }) {
  const client = useQueryClient();
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
    if (!parsed.success) { setProblem(parsed.error.issues[0]?.message ?? "Check the request."); return; }
    setProblem("");
    const command = intent && intent.message === parsed.data ? intent : { accountId: user.id, spaceId, message: parsed.data, key: crypto.randomUUID() };
    setIntent(command);
    ask.mutate(command);
  };
  const rows = [...new Map(runs.data?.pages.flatMap(page => page.data).map(run => [run.id, run] as const) ?? []).values()];
  return <>
    <form className={styles.composer} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-message`}>What do you want to do?</label>
        <span className={styles.hint} id={`${fieldId}-hint`}>For example: add a task to buy milk tomorrow, or remind me to call the bank at 6 pm.</span>
        <textarea id={`${fieldId}-message`} rows={2} maxLength={500} value={text} aria-describedby={`${fieldId}-hint`}
          aria-invalid={!!problem} disabled={ask.isPending || (!!intent && ask.isError)} onChange={event => { setText(event.target.value); setProblem(""); }} />
      </div>
      {problem && <p className="field-error" role="alert">{problem}</p>}
      {ask.isError && <p className="message error" role="alert">{problemText(ask.error, "The request could not be sent.")}</p>}
      <div className={styles.actions}>
        <button className="primary-button" type="submit" disabled={ask.isPending}>{ask.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Send size={17} aria-hidden />}{intent && ask.isError ? "Send again" : "Ask"}</button>
        {intent && ask.isError && <button className="text-button" type="button" onClick={() => { setIntent(null); ask.reset(); }}>Edit the request</button>}
      </div>
    </form>
    <section aria-labelledby={`${fieldId}-history`}>
      <div className={styles.runHead}><h2 id={`${fieldId}-history`}>Your requests</h2>
        <button className="icon-button" aria-label="Refresh requests" title="Refresh requests" disabled={runs.isFetching} onClick={() => refresh()}><RefreshCw size={18} className={runs.isFetching ? "spin" : ""} aria-hidden /></button>
      </div>
      {runs.isPending && <p role="status">Loading requests...</p>}
      {runs.isError && <p className="message error" role="alert">{problemText(runs.error, "Requests could not load.")}</p>}
      {!runs.isPending && !runs.isError && rows.length === 0 && <p className={styles.empty}>No requests in this Space yet. Only you can see your requests.</p>}
      <ul className={styles.list}>{rows.map(run => <li key={run.id}><RunCard user={user} run={run} onChanged={refresh} /></li>)}</ul>
      {runs.hasNextPage && <button className="text-button" disabled={runs.isFetching} onClick={() => runs.fetchNextPage()}>Show earlier requests</button>}
    </section>
  </>;
}

function RunCard({ user, run, onChanged }: { user: Account; run: AgentRun; onChanged: () => Promise<unknown> }) {
  const fieldId = useId();
  const keys = useRef(new Map<string, string>());
  const [reply, setReply] = useState("");
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
      <div><p className={styles.asked} id={`${fieldId}-asked`}>{run.message}</p><p className={styles.when}>{time.format(new Date(run.created_at))}</p></div>
      <span className={styles.status}>{statusLabels[run.status]}</span>
    </div>
    {run.answer && <p className={styles.answer}>{run.answer}</p>}
    {run.question && <form className={styles.check} onSubmit={event => { event.preventDefault(); if (reply.trim()) respond.mutate(reply.trim()); }}>
      <p className={styles.answer} id={`${fieldId}-question`}>{run.question.text}</p>
      <label className={styles.field}>Your answer
        <input value={reply} maxLength={500} aria-describedby={`${fieldId}-question`} disabled={busy} onChange={event => setReply(event.target.value)} />
      </label>
      {respond.isError && <p className="message error" role="alert">{problemText(respond.error, "The answer could not be sent.")}</p>}
      <div className={styles.actions}>
        <button className="secondary-button" type="submit" disabled={busy || !reply.trim()}><Send size={17} aria-hidden />Answer</button>
        <button className="text-button" type="button" disabled={busy} onClick={() => stop.mutate()}>Stop this request</button>
      </div>
    </form>}
    {approval && <section className={styles.check} aria-labelledby={`${fieldId}-check`}>
      <h3 id={`${fieldId}-check`}>{pending ? "Check this before I do it" : approval.summary}</h3>
      <dl className={styles.facts}>{approval.fields.map(item => <div key={item.label} style={{ display: "contents" }}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      {pending && <p className={styles.when}>Waiting for you until {time.format(new Date(approval.expires_at))}. Nothing changes unless you approve.</p>}
      {decision.isError && <p className="message error" role="alert">{problemText(decision.error, "Your decision could not be saved.")}</p>}
      {pending && <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => choose("approve")}>{decision.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Check size={17} aria-hidden />}{decision.isError && isUnknown(decision.error) ? "Approve again" : "Approve"}</button>
        <button className="secondary-button" disabled={busy} onClick={() => choose("reject")}><X size={17} aria-hidden />Don&apos;t do it</button>
      </div>}
    </section>}
  </article>;
}

function Memories({ user }: { user: Account }) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<AgentMemory | null>(null);
  const memories = useQuery({ queryKey: ["agentMemories", user.id], queryFn: ({ signal }) => readMemories(user.id, signal) });
  const forget = useMutation({
    mutationFn: (memory: AgentMemory) => forgetMemory(user.id, memory.id),
    onSuccess: async () => { setConfirm(null); await client.invalidateQueries({ queryKey: ["agentMemories", user.id] }); },
  });
  useSessionGuard(memories.error ?? forget.error);
  return <section aria-labelledby="agent-memories">
    <h2 id="agent-memories">What the agent remembers</h2>
    <p className={styles.hint}>Only what you approved is saved, and only you can see it. Deleting is immediate.</p>
    {memories.isPending && <p role="status">Loading memories...</p>}
    {memories.isError && <p className="message error" role="alert">{problemText(memories.error, "Memories could not load.")}</p>}
    {memories.data && memories.data.length === 0 && <p className={styles.empty}>Nothing saved. Say &ldquo;remember that ...&rdquo; to save a note.</p>}
    {memories.data && memories.data.length > 0 && <ul className={styles.memories}>{memories.data.map(memory => <li key={memory.id}>
      <p><span className={styles.label}>{memory.label}</span>{memory.content}</p>
      <button className="text-button" aria-label={`Delete memory: ${memory.content}`} onClick={() => { forget.reset(); setConfirm(memory); }}><Trash2 size={16} aria-hidden />Delete</button>
    </li>)}</ul>}
    {confirm && <ConfirmDialog title="Delete this memory?" onClose={() => setConfirm(null)} locked={forget.isPending}>
      <p><strong>{confirm.label}:</strong> {confirm.content}</p>
      <p className={styles.hint}>The agent stops using it right away. This cannot be undone.</p>
      {forget.isError && <p className="message error" role="alert">{problemText(forget.error, "The memory could not be deleted.")}</p>}
      <div className="dialog-actions">
        <button className="secondary-button" disabled={forget.isPending} onClick={() => setConfirm(null)}>Keep it</button>
        <button className="primary-button" disabled={forget.isPending} onClick={() => forget.mutate(confirm)}><Trash2 size={17} aria-hidden />Delete memory</button>
      </div>
    </ConfirmDialog>}
  </section>;
}

function ConfirmDialog({ title, locked, onClose, children }: { title: string; locked: boolean; onClose: () => void; children: React.ReactNode }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { if (locked) event.preventDefault(); else onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close" title="Close" disabled={locked} onClick={onClose}><X size={18} aria-hidden /></button></div>
    {children}
  </dialog>;
}
