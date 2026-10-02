"use client";

import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw } from "lucide-react";

import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { useText } from "@/features/i18n/i18n";
import {
  REPORT_REASONS, moderationAppeals, moderationQueue, moderatorStatus,
  recordModerationDecision, resolveModerationAppeal,
} from "./client";
import type { ContentPreview, CreateIntent, ModerationAppealReview, ModerationDecisionBody, ModerationQueueItem, ReportReason } from "./client";
import { CommunityFrame, Failure, Loading, problemText, sessionLost, useCommunityTime, useTextProblem, useViewer } from "./shared";
import styles from "./community.module.css";
import reviewStyles from "./moderation.module.css";

export function ModerationScreen() {
  const t = useText();
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) return <Loading label={t("community.loadingModeration")} />;
  if (!viewer.account) return <CommunityFrame account={null} current="safety"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <ModeratorGate key={viewer.account.id} account={viewer.account} />;
}

function ModeratorGate({ account }: { account: Account }) {
  const t = useText();
  const access = useQuery({ queryKey: ["platform-moderator", account.id], queryFn: ({ signal }) => moderatorStatus(account.id, signal), retry: false, networkMode: "always" });
  useEffect(() => { if (sessionLost(access.error)) window.location.replace("/login"); }, [access.error]);
  return <CommunityFrame account={account} current="safety">
    {access.isPending ? <p role="status">{t("community.loadingModerationStatus")}</p>
      : access.isError ? <Failure error={access.error} retry={() => access.refetch()} />
      : !access.data.moderator ? <p>{t("community.moderatorsOnly")}</p>
      : <Reviews account={account} />}
  </CommunityFrame>;
}

function Preview({ preview, pageName, targetType }: { preview: ContentPreview; pageName: string | null; targetType: ModerationQueueItem["target_type"] }) {
  const t = useText();
  const excerpt = [...(preview.body ?? preview.description ?? "")];
  return <>
    <p className={reviewStyles.meta}>{t(`community.target.${targetType}`)}{pageName && ` / ${pageName}`}</p>
    {(preview.name || preview.title) && <h2 className={styles.title}>{preview.name ?? preview.title}</h2>}
    {preview.handle && <p className={reviewStyles.meta}>@{preview.handle}</p>}
    {excerpt.length > 0 && <p className={styles.body}>{excerpt.slice(0, 240).join("")}{excerpt.length > 240 ? "..." : ""}</p>}
    {preview.status === "unavailable" && <p className={reviewStyles.meta}>{t("community.contentUnavailable")}</p>}
  </>;
}

function Reviews({ account }: { account: Account }) {
  const t = useText();
  const time = useCommunityTime();
  const queryClient = useQueryClient();
  const heading = useId();
  const [tab, setTab] = useState<"reports" | "appeals">("reports");
  const [message, setMessage] = useState<"community.decisionRecorded" | "community.appealResolved" | "">("");
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const queueKey = ["moderation-queue", account.id];
  const reports = useInfiniteQuery({
    queryKey: queueKey, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => moderationQueue(account.id, pageParam, signal),
    getNextPageParam: page => page.next ?? undefined, enabled: tab === "reports", retry: false, networkMode: "always", refetchOnWindowFocus: false,
  });
  const appeals = useQuery({
    queryKey: ["moderation-appeals", account.id, "open"], queryFn: ({ signal }) => moderationAppeals(account.id, "open", signal),
    enabled: tab === "appeals", retry: false, networkMode: "always", refetchOnWindowFocus: false,
  });
  useEffect(() => { if (sessionLost(reports.error) || sessionLost(appeals.error)) window.location.replace("/login"); }, [reports.error, appeals.error]);
  const rows = [...new Map(reports.data?.pages.flatMap(page => page.items).map(item => [`${item.target_type}:${item.target_id}`, item]) ?? []).values()]
    .filter(item => !decided.has(`${item.target_type}:${item.target_id}`));
  async function more() {
    try { await reports.fetchNextPage({ throwOnError: true }); }
    catch (problem) {
      if (problem instanceof ApiError && (problem.code === "CURSOR_INVALID" || problem.code === "CURSOR_EXPIRED")) {
        queryClient.setQueryData(queueKey, (data: typeof reports.data) => data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data);
        await reports.refetch();
      }
    }
  }
  const moveTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === "Home" ? "reports" : event.key === "End" ? "appeals"
      : event.key === "ArrowLeft" || event.key === "ArrowRight" ? (tab === "reports" ? "appeals" : "reports") : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    setMessage("");
    document.getElementById(`${heading}-${next}`)?.focus();
  };
  return <div className={reviewStyles.workspace}>
    <div className={styles.heading}><h1>{t("community.moderation")}</h1></div>
    <div className={`${styles.tabs} ${reviewStyles.tabs}`} role="tablist" aria-label={t("community.moderationLists")} onKeyDown={moveTab}>
      {(["reports", "appeals"] as const).map(value => <button key={value} id={`${heading}-${value}`} role="tab" aria-selected={tab === value}
        aria-controls={`${heading}-${value}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => { setTab(value); setMessage(""); }}>
        {t(value === "reports" ? "community.reports" : "community.appeals")}
      </button>)}
    </div>
    {message && <p className={styles.notice} role="status">{t(message)}</p>}
    <section className={styles.stack} role="tabpanel" id={`${heading}-reports-panel`} aria-labelledby={`${heading}-reports`} hidden={tab !== "reports"}>
      {reports.isPending && <p role="status">{t("community.loadingReports")}</p>}
      {reports.error && <Failure error={reports.error} retry={() => reports.isFetchNextPageError ? more() : reports.refetch()} />}
      {!reports.isPending && !reports.error && rows.length === 0 && <p className={styles.empty}>{t("community.noReportsWaiting")}</p>}
      {rows.map(item => <article key={`${item.target_type}:${item.target_id}`} className={styles.card} aria-label={t("community.reportCard", { target: t(`community.target.${item.target_type}`) })}>
        <Preview preview={item.preview} pageName={item.page_name} targetType={item.target_type} />
        <p>{t("community.reportsCount", { count: item.report_count })}</p>
        <ul className={reviewStyles.reasons}>{item.reasons.map(entry => <li key={entry.reason}>{t("community.reasonCount", { reason: t(`community.reason.${entry.reason}`), count: entry.count })}</li>)}</ul>
        <p className={reviewStyles.meta}>{t("community.firstReportedBefore")}<time dateTime={item.first_reported_at}>{time.format(new Date(item.first_reported_at))}</time></p>
        <DecisionForm account={account} item={item} done={() => { setDecided(previous => new Set(previous).add(`${item.target_type}:${item.target_id}`)); setMessage("community.decisionRecorded"); }} />
      </article>)}
      {reports.hasNextPage && <button className="secondary-button" disabled={reports.isFetching} onClick={more}>{t("community.more")}</button>}
    </section>
    <section className={styles.stack} role="tabpanel" id={`${heading}-appeals-panel`} aria-labelledby={`${heading}-appeals`} hidden={tab !== "appeals"}>
      {appeals.isPending && <p role="status">{t("community.loadingAppeals")}</p>}
      {appeals.error && <Failure error={appeals.error} retry={() => appeals.refetch()} />}
      {!appeals.isPending && !appeals.error && appeals.data?.filter(item => !resolved.has(item.appeal.id)).length === 0 && <p className={styles.empty}>{t("community.noAppealsWaiting")}</p>}
      {appeals.data?.filter(item => !resolved.has(item.appeal.id)).map(item => <article key={item.appeal.id} className={styles.card} aria-label={t("community.appealCard", { target: t(`community.target.${item.decision.target_type}`) })}>
        <Preview preview={item.preview} pageName={item.page_name} targetType={item.decision.target_type} />
        <p>{t("community.summary", { first: t(`community.action.${item.decision.action}`), second: t(`community.reason.${item.decision.reason}`) })}</p>
        <time className={reviewStyles.meta} dateTime={item.decision.decided_at}>{time.format(new Date(item.decision.decided_at))}</time>
        <p className={styles.body}>{item.appeal.note}</p>
        <AppealResolution account={account} item={item} done={() => { setResolved(previous => new Set(previous).add(item.appeal.id)); setMessage("community.appealResolved"); }} />
      </article>)}
    </section>
  </div>;
}

function DecisionForm({ account, item, done }: { account: Account; item: ModerationQueueItem; done: () => void }) {
  const t = useText();
  const textProblem = useTextProblem();
  const heading = useId();
  const [action, setAction] = useState<"hide" | "no_action" | "">("");
  const [reason, setReason] = useState<ReportReason>(() => item.reasons.reduce((best, entry) => entry.count > best.count ? entry : best).reason);
  const [note, setNote] = useState("");
  const [intent, setIntent] = useState<CreateIntent<ModerationDecisionBody> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noteProblem = textProblem(note, 1000, false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action || noteProblem || busy) return;
    const command = intent ?? { accountId: account.id, key: crypto.randomUUID(), body: { target_type: item.target_type, target_id: item.target_id, action, reason, note: note.trim().replace(/\r\n/g, "\n") } };
    setIntent(command);
    setBusy(true);
    setError("");
    try { await recordModerationDecision(command); done(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.replace("/login"); return; }
      setError(problemText(problem, t("community.decisionFailed"), t));
    } finally { setBusy(false); }
  }
  return <form className={reviewStyles.form} onSubmit={submit}>
    <fieldset disabled={busy || intent !== null} className={reviewStyles.radios}>
      <legend>{t("community.decision")}</legend>
      <label><input type="radio" name={`${heading}-action`} checked={action === "hide"} onChange={() => setAction("hide")} />{t("community.hide")}</label>
      <label><input type="radio" name={`${heading}-action`} checked={action === "no_action"} onChange={() => setAction("no_action")} />{t("community.action.no_action")}</label>
    </fieldset>
    <label className={reviewStyles.field} htmlFor={`${heading}-reason`}>{t("community.reason")}
      <select id={`${heading}-reason`} value={reason} disabled={busy || intent !== null} onChange={event => setReason(event.target.value as ReportReason)}>
        {REPORT_REASONS.map(value => <option key={value} value={value}>{t(`community.reason.${value}`)}</option>)}
      </select>
    </label>
    <label className={reviewStyles.field} htmlFor={`${heading}-note`}>{t("community.moderatorNote")}</label>
    <textarea id={`${heading}-note`} value={note} maxLength={2000} disabled={busy || intent !== null} onChange={event => setNote(event.target.value)}
      aria-describedby={`${heading}-count`} aria-invalid={Boolean(noteProblem)} />
    <p id={`${heading}-count`} className={reviewStyles.meta}>{t("community.noteCount", { count: [...note].length })}</p>
    {noteProblem && <p className="field-error">{noteProblem}</p>}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className={styles.actions}><button className="primary-button" type="submit" disabled={!action || Boolean(noteProblem) || busy}><Check size={17} aria-hidden />{t("community.recordDecision")}</button></div>
  </form>;
}

function AppealResolution({ account, item, done }: { account: Account; item: ModerationAppealReview; done: () => void }) {
  const t = useText();
  const textProblem = useTextProblem();
  const heading = useId();
  const [note, setNote] = useState("");
  const [intent, setIntent] = useState<{ outcome: "upheld" | "overturned"; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noteProblem = textProblem(note, 1000, false);
  async function resolve(outcome: "upheld" | "overturned") {
    if (busy || noteProblem) return;
    const command = intent ?? { outcome, note: note.trim().replace(/\r\n/g, "\n") };
    setIntent(command);
    setBusy(true);
    setError("");
    try { await resolveModerationAppeal(account.id, item.appeal.id, command); done(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.replace("/login"); return; }
      setError(problemText(problem, t("community.appealResolutionFailed"), t));
    } finally { setBusy(false); }
  }
  return <div className={reviewStyles.form}>
    <label htmlFor={`${heading}-note`}>{t("community.moderatorNote")}</label>
    <textarea id={`${heading}-note`} value={note} maxLength={2000} disabled={busy || intent !== null} onChange={event => setNote(event.target.value)}
      aria-describedby={`${heading}-count`} aria-invalid={Boolean(noteProblem)} />
    <p id={`${heading}-count`} className={reviewStyles.meta}>{t("community.noteCount", { count: [...note].length })}</p>
    {noteProblem && <p className="field-error">{noteProblem}</p>}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className={styles.actions}>
      <button className="secondary-button" disabled={busy || Boolean(noteProblem) || (intent !== null && intent.outcome !== "upheld")} onClick={() => resolve("upheld")}><Check size={17} aria-hidden />{t("community.keepDecision")}</button>
      <button className="primary-button" disabled={busy || Boolean(noteProblem) || (intent !== null && intent.outcome !== "overturned")} onClick={() => resolve("overturned")}><RotateCcw size={17} aria-hidden />{t("community.restoreContent")}</button>
    </div>
  </div>;
}