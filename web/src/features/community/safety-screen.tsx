"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, X } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { useText } from "@/features/i18n/i18n";
import { appealModerationDecision, moderationNotices, moderatorStatus, myBlocks, myReports, unblock } from "./client";
import type { CreateIntent, ModerationNotice } from "./client";
import { CommunityFrame, Failure, Loading, problemText, sessionLost, useCommunityTime, useTextProblem, useViewer } from "./shared";
import styles from "./community.module.css";
import reviewStyles from "./moderation.module.css";

export function SafetyScreen() {
  const t = useText();
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) return <Loading label={t("community.loadingBlocked")} />;
  if (!viewer.account) return <CommunityFrame account={null} current="safety"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <Blocks key={viewer.account.id} account={viewer.account} />;
}

function Blocks({ account }: { account: Account }) {
  const t = useText();
  const time = useCommunityTime();
  const queryClient = useQueryClient();
  const blocks = useQuery({ queryKey: ["blocks", account.id], queryFn: ({ signal }) => myBlocks(account.id, signal), networkMode: "always" });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (sessionLost(blocks.error)) window.location.replace("/login"); }, [blocks.error]);
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try { await unblock(account.id, id); setConfirm(null); await queryClient.invalidateQueries({ queryKey: ["blocks", account.id] }); }
    catch (problem) { setError(problemText(problem, t("community.unblockFailed"), t)); }
    finally { setBusy(false); }
  }
  return <CommunityFrame account={account} current="safety">
    <div className={styles.heading}><h1>{t("community.blockedHeading")}</h1></div>
    <p className={styles.meta}>{t("community.blockingHint")}</p>
    <p className={styles.meta}>{t("community.reportingHint")}</p>
    {error && <div className="message error" role="alert">{error}</div>}
    {blocks.isPending && <p role="status">{t("community.loading")}</p>}
    {blocks.isError && !sessionLost(blocks.error) && <Failure error={blocks.error} retry={() => blocks.refetch()} />}
    {blocks.data?.length === 0 && <p className={styles.empty}>{t("community.noBlocks")}</p>}
    <ul className={`${styles.list} ${reviewStyles.blocked}`} aria-label={t("community.blocked")}>
      {blocks.data?.map(item => <li key={item.id} className={styles.row}>
        <span>
          {item.page_id ? <Link href={`/pages/${item.page_id}`}>{item.label}</Link> : <strong>{item.label}</strong>}
          <span className={styles.meta}>{t("community.blockedSummary", { target: t(item.target_type === "page" ? "community.target.page" : "community.person"), date: time.format(new Date(item.created_at)) })}</span>
        </span>
        {confirm === item.id
          ? <span className={styles.actions} role="group" aria-label={t("community.confirmUnblock", { name: item.label })}>
            <button className="primary-button" disabled={busy} onClick={() => remove(item.id)}>{t("community.unblock")}</button>
            <button className="secondary-button" disabled={busy} onClick={() => setConfirm(null)}>{t("community.keepBlocked")}</button>
          </span>
          : <button className="secondary-button" disabled={busy} onClick={() => setConfirm(item.id)} aria-label={t("community.unblockName", { name: item.label })}>{t("community.unblock")}</button>}
      </li>)}
    </ul>
    <SafetyHistory account={account} />
  </CommunityFrame>;
}

type AppealIntent = CreateIntent<{ note: string }> & { decisionId: string };
const appealLabels = { open: "community.appealStatus.open", upheld: "community.appealStatus.upheld", overturned: "community.appealStatus.overturned" } as const;

function SafetyHistory({ account }: { account: Account }) {
  const t = useText();
  const time = useCommunityTime();
  const queryClient = useQueryClient();
  const heading = useId();
  const noticesKey = ["moderation-notices", account.id];
  const notices = useQuery({ queryKey: noticesKey, queryFn: ({ signal }) => moderationNotices(account.id, signal), retry: false, networkMode: "always" });
  const reports = useQuery({ queryKey: ["my-reports", account.id], queryFn: ({ signal }) => myReports(account.id, signal), retry: false, networkMode: "always" });
  const access = useQuery({ queryKey: ["platform-moderator", account.id], queryFn: ({ signal }) => moderatorStatus(account.id, signal), retry: false, networkMode: "always" });
  const [selection, setSelection] = useState<ModerationNotice | null>(null);
  const [intents, setIntents] = useState<Record<string, AppealIntent>>({});
  const [message, setMessage] = useState<"community.appealSent" | "">("");
  useEffect(() => {
    if (sessionLost(notices.error) || sessionLost(reports.error) || sessionLost(access.error)) window.location.replace("/login");
  }, [notices.error, reports.error, access.error]);
  return <div className={reviewStyles.safety}>
    {access.data?.moderator && <Link className="text-button" href="/app/moderation">{t("community.moderationQueue")}</Link>}
    {access.isError && !sessionLost(access.error) && <Failure error={access.error} retry={() => access.refetch()} />}
    {message && <p className={styles.notice} role="status">{t(message)}</p>}
    <section className={styles.stack} aria-labelledby={`${heading}-notices`}>
      <h2 id={`${heading}-notices`}>{t("community.decisionsHeading")}</h2>
      {notices.isPending && <p role="status">{t("community.loadingDecisions")}</p>}
      {notices.isError && !sessionLost(notices.error) && <Failure error={notices.error} retry={() => notices.refetch()} />}
      {notices.isSuccess && notices.data.length === 0 && <p className={styles.empty}>{t("community.noDecisions")}</p>}
      <ul className={styles.list} aria-label={t("community.decisionsHeading")}>
        {notices.data?.map(item => <li key={item.id} className={styles.row}>
          <div className={reviewStyles.notice}>
            <strong>{t("community.summary", { first: t(`community.target.${item.target_type}`), second: t(`community.action.${item.action}`) })}</strong>
            <span>{t(`community.reason.${item.reason}`)}</span>
            <time className={reviewStyles.meta} dateTime={item.decided_at}>{time.format(new Date(item.decided_at))}</time>
            {item.appeal_status && <span>{t(appealLabels[item.appeal_status])}</span>}
            {item.action === "restore" && item.appeal_of !== null && item.appeal_status === null && <span>{t("community.appealStatus.overturned")}</span>}
          </div>
          {(item.action === "hide" || item.action === "limit") && item.appeal_status === null && item.appeal_of === null
            && <button className="secondary-button" onClick={() => { setSelection(item); setMessage(""); }}>{t("community.appeal")}</button>}
        </li>)}
      </ul>
    </section>
    <section className={styles.stack} aria-labelledby={`${heading}-reports`}>
      <h2 id={`${heading}-reports`}>{t("community.yourReports")}</h2>
      {reports.isPending && <p role="status">{t("community.loadingYourReports")}</p>}
      {reports.isError && !sessionLost(reports.error) && <Failure error={reports.error} retry={() => reports.refetch()} />}
      {reports.isSuccess && reports.data.length === 0 && <p className={styles.empty}>{t("community.noYourReports")}</p>}
      <ul className={styles.list} aria-label={t("community.yourReports")}>
        {reports.data?.map(item => <li key={item.id} className={styles.row}>
          <div className={reviewStyles.notice}>
            <strong>{t("community.summary", { first: t(`community.target.${item.target_type}`), second: t(`community.reason.${item.reason}`) })}</strong>
            <span>{t(item.status === "open" ? "community.reportWaiting" : item.outcome === "action_taken" ? "community.reportAction" : "community.reportNoAction")}</span>
          </div>
        </li>)}
      </ul>
    </section>
    {selection && <AppealDialog key={selection.id} account={account} notice={selection} intent={intents[selection.id] ?? null}
      keepIntent={intent => setIntents(previous => ({ ...previous, [selection.id]: intent }))}
      close={() => setSelection(null)} done={status => {
        queryClient.setQueryData<ModerationNotice[]>(noticesKey, previous => previous?.map(item => item.id === selection.id ? { ...item, appeal_status: status } : item));
        setIntents(previous => { const next = { ...previous }; delete next[selection.id]; return next; });
        setSelection(null);
        setMessage("community.appealSent");
      }} />}
  </div>;
}

function AppealDialog({ account, notice, intent, keepIntent, close, done }: {
  account: Account; notice: ModerationNotice; intent: AppealIntent | null; keepIntent: (intent: AppealIntent) => void;
  close: () => void; done: (status: "open" | "upheld" | "overturned") => void;
}) {
  const t = useText();
  const textProblem = useTextProblem();
  const heading = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [note, setNote] = useState(intent?.body.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  const noteProblem = textProblem(note, 1000);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (noteProblem || busy) return;
    const command = intent ?? { accountId: account.id, decisionId: notice.id, key: crypto.randomUUID(), body: { note: note.trim().replace(/\r\n/g, "\n") } };
    keepIntent(command);
    setBusy(true);
    setError("");
    try { const result = await appealModerationDecision(command); done(result.status); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.replace("/login"); return; }
      setError(problemText(problem, t("community.appealFailed"), t));
    } finally { setBusy(false); }
  }
  return <dialog ref={setDialog} className={`${styles.dialog} ${reviewStyles.dialog}`} aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <h2 id={heading}>{t("community.appealDecision")}</h2>
    <p>{t("community.summary", { first: t(`community.target.${notice.target_type}`), second: t(`community.reason.${notice.reason}`) })}</p>
    <form className={reviewStyles.form} onSubmit={send}>
      <label htmlFor={`${heading}-note`}>{t("community.note")}</label>
      <textarea id={`${heading}-note`} required value={note} maxLength={2000} disabled={busy || intent !== null}
        onChange={event => setNote(event.target.value)} aria-describedby={`${heading}-count`} aria-invalid={note !== "" && Boolean(noteProblem)} />
      <p id={`${heading}-count`} className={reviewStyles.meta}>{t("community.noteCount", { count: [...note].length })}</p>
      {note !== "" && noteProblem && <p className="field-error">{noteProblem}</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={close}><X size={17} aria-hidden />{t("community.cancel")}</button>
        <button type="submit" className="primary-button" disabled={busy || Boolean(noteProblem)}><Send size={17} aria-hidden />{t("community.sendAppeal")}</button>
      </div>
    </form>
  </dialog>;
}
