"use client";

import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw } from "lucide-react";

import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import {
  REPORT_REASONS, moderationActionLabels, moderationAppeals, moderationQueue, moderationTargetLabels, moderatorStatus,
  reasonLabels, recordModerationDecision, resolveModerationAppeal, textProblem,
} from "./client";
import type { ContentPreview, CreateIntent, ModerationAppealReview, ModerationDecisionBody, ModerationQueueItem, ReportReason } from "./client";
import { CommunityFrame, Failure, Loading, problemText, sessionLost, time, useViewer } from "./shared";
import styles from "./community.module.css";
import reviewStyles from "./moderation.module.css";

export function ModerationScreen() {
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) return <Loading label="Loading moderation" />;
  if (!viewer.account) return <CommunityFrame account={null} current="safety"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <ModeratorGate key={viewer.account.id} account={viewer.account} />;
}

function ModeratorGate({ account }: { account: Account }) {
  const access = useQuery({ queryKey: ["platform-moderator", account.id], queryFn: ({ signal }) => moderatorStatus(account.id, signal), retry: false, networkMode: "always" });
  useEffect(() => { if (sessionLost(access.error)) window.location.replace("/login"); }, [access.error]);
  return <CommunityFrame account={account} current="safety">
    {access.isPending ? <p role="status">Loading moderation...</p>
      : access.isError ? <Failure error={access.error} retry={() => access.refetch()} />
      : !access.data.moderator ? <p>Only platform moderators can open this page.</p>
      : <Reviews account={account} />}
  </CommunityFrame>;
}

function Preview({ preview, pageName, targetType }: { preview: ContentPreview; pageName: string | null; targetType: ModerationQueueItem["target_type"] }) {
  const excerpt = [...(preview.body ?? preview.description ?? "")];
  return <>
    <p className={reviewStyles.meta}>{moderationTargetLabels[targetType]}{pageName && ` / ${pageName}`}</p>
    {(preview.name || preview.title) && <h2 className={styles.title}>{preview.name ?? preview.title}</h2>}
    {preview.handle && <p className={reviewStyles.meta}>@{preview.handle}</p>}
    {excerpt.length > 0 && <p className={styles.body}>{excerpt.slice(0, 240).join("")}{excerpt.length > 240 ? "..." : ""}</p>}
    {preview.status === "unavailable" && <p className={reviewStyles.meta}>Content unavailable.</p>}
  </>;
}

function Reviews({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const heading = useId();
  const [tab, setTab] = useState<"reports" | "appeals">("reports");
  const [message, setMessage] = useState("");
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
    <div className={styles.heading}><h1>Moderation</h1></div>
    <div className={`${styles.tabs} ${reviewStyles.tabs}`} role="tablist" aria-label="Moderation lists" onKeyDown={moveTab}>
      {(["reports", "appeals"] as const).map(value => <button key={value} id={`${heading}-${value}`} role="tab" aria-selected={tab === value}
        aria-controls={`${heading}-${value}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => { setTab(value); setMessage(""); }}>
        {value === "reports" ? "Reports" : "Appeals"}
      </button>)}
    </div>
    {message && <p className={styles.notice} role="status">{message}</p>}
    <section className={styles.stack} role="tabpanel" id={`${heading}-reports-panel`} aria-labelledby={`${heading}-reports`} hidden={tab !== "reports"}>
      {reports.isPending && <p role="status">Loading reports...</p>}
      {reports.error && <Failure error={reports.error} retry={() => reports.isFetchNextPageError ? more() : reports.refetch()} />}
      {!reports.isPending && !reports.error && rows.length === 0 && <p className={styles.empty}>No reports are waiting.</p>}
      {rows.map(item => <article key={`${item.target_type}:${item.target_id}`} className={styles.card} aria-label={`${moderationTargetLabels[item.target_type]} report`}>
        <Preview preview={item.preview} pageName={item.page_name} targetType={item.target_type} />
        <p>{item.report_count} reports</p>
        <ul className={reviewStyles.reasons}>{item.reasons.map(entry => <li key={entry.reason}>{reasonLabels[entry.reason]}: {entry.count}</li>)}</ul>
        <p className={reviewStyles.meta}>First reported <time dateTime={item.first_reported_at}>{time.format(new Date(item.first_reported_at))}</time></p>
        <DecisionForm account={account} item={item} done={() => { setDecided(previous => new Set(previous).add(`${item.target_type}:${item.target_id}`)); setMessage("Decision recorded."); }} />
      </article>)}
      {reports.hasNextPage && <button className="secondary-button" disabled={reports.isFetching} onClick={more}>Load more</button>}
    </section>
    <section className={styles.stack} role="tabpanel" id={`${heading}-appeals-panel`} aria-labelledby={`${heading}-appeals`} hidden={tab !== "appeals"}>
      {appeals.isPending && <p role="status">Loading appeals...</p>}
      {appeals.error && <Failure error={appeals.error} retry={() => appeals.refetch()} />}
      {!appeals.isPending && !appeals.error && appeals.data?.filter(item => !resolved.has(item.appeal.id)).length === 0 && <p className={styles.empty}>No appeals are waiting.</p>}
      {appeals.data?.filter(item => !resolved.has(item.appeal.id)).map(item => <article key={item.appeal.id} className={styles.card} aria-label={`${moderationTargetLabels[item.decision.target_type]} appeal`}>
        <Preview preview={item.preview} pageName={item.page_name} targetType={item.decision.target_type} />
        <p>{moderationActionLabels[item.decision.action]} / {reasonLabels[item.decision.reason]}</p>
        <time className={reviewStyles.meta} dateTime={item.decision.decided_at}>{time.format(new Date(item.decision.decided_at))}</time>
        <p className={styles.body}>{item.appeal.note}</p>
        <AppealResolution account={account} item={item} done={() => { setResolved(previous => new Set(previous).add(item.appeal.id)); setMessage("Appeal resolved."); }} />
      </article>)}
    </section>
  </div>;
}

function DecisionForm({ account, item, done }: { account: Account; item: ModerationQueueItem; done: () => void }) {
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
      setError(problemText(problem, "The decision was not recorded."));
    } finally { setBusy(false); }
  }
  return <form className={reviewStyles.form} onSubmit={submit}>
    <fieldset disabled={busy || intent !== null} className={reviewStyles.radios}>
      <legend>Decision</legend>
      <label><input type="radio" name={`${heading}-action`} checked={action === "hide"} onChange={() => setAction("hide")} />Hide</label>
      <label><input type="radio" name={`${heading}-action`} checked={action === "no_action"} onChange={() => setAction("no_action")} />No action</label>
    </fieldset>
    <label className={reviewStyles.field} htmlFor={`${heading}-reason`}>Reason
      <select id={`${heading}-reason`} value={reason} disabled={busy || intent !== null} onChange={event => setReason(event.target.value as ReportReason)}>
        {REPORT_REASONS.map(value => <option key={value} value={value}>{reasonLabels[value]}</option>)}
      </select>
    </label>
    <label className={reviewStyles.field} htmlFor={`${heading}-note`}>Note for moderators (optional)</label>
    <textarea id={`${heading}-note`} value={note} maxLength={2000} disabled={busy || intent !== null} onChange={event => setNote(event.target.value)}
      aria-describedby={`${heading}-count`} aria-invalid={Boolean(noteProblem)} />
    <p id={`${heading}-count`} className={reviewStyles.meta}>{[...note].length}/1000 characters</p>
    {noteProblem && <p className="field-error">{noteProblem}</p>}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className={styles.actions}><button className="primary-button" type="submit" disabled={!action || Boolean(noteProblem) || busy}><Check size={17} aria-hidden />Record decision</button></div>
  </form>;
}

function AppealResolution({ account, item, done }: { account: Account; item: ModerationAppealReview; done: () => void }) {
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
      setError(problemText(problem, "The appeal was not resolved."));
    } finally { setBusy(false); }
  }
  return <div className={reviewStyles.form}>
    <label htmlFor={`${heading}-note`}>Note for moderators (optional)</label>
    <textarea id={`${heading}-note`} value={note} maxLength={2000} disabled={busy || intent !== null} onChange={event => setNote(event.target.value)}
      aria-describedby={`${heading}-count`} aria-invalid={Boolean(noteProblem)} />
    <p id={`${heading}-count`} className={reviewStyles.meta}>{[...note].length}/1000 characters</p>
    {noteProblem && <p className="field-error">{noteProblem}</p>}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className={styles.actions}>
      <button className="secondary-button" disabled={busy || Boolean(noteProblem) || (intent !== null && intent.outcome !== "upheld")} onClick={() => resolve("upheld")}><Check size={17} aria-hidden />Keep decision</button>
      <button className="primary-button" disabled={busy || Boolean(noteProblem) || (intent !== null && intent.outcome !== "overturned")} onClick={() => resolve("overturned")}><RotateCcw size={17} aria-hidden />Restore content</button>
    </div>
  </div>;
}