"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, Check, ClipboardList, Inbox, LoaderCircle, RefreshCw, Send, X } from "lucide-react";
import { z } from "zod";
import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { TimezoneListProblem } from "@/features/identity/timezone-list-problem";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { translate, type Language } from "@/features/i18n/messages";
import { en as reminderMessages } from "@/features/i18n/areas/reminders";
import { readTask } from "@/features/planning/client";
import { notificationPreferencesSchema, offsetLabel, previewReminder, reminderPage, reminderSchema, saveReminder } from "./client";
import { previewReminderRequest, reminderRequestPage, respondReminderRequest, reviewReminderRequest, saveReminderRequest } from "./client";
import type { ReminderSeries } from "./client";
import type { Reminder, ReminderIntent, ReminderPreview, ReminderRequest, ReminderRequestAction, ReminderRequestIntent, ReminderRequestPreview, ReminderRequestReview } from "./client";
import { displayInstant, displayReminderTime, protectedReminderError, ReminderDialog, useReminderAccountGuard } from "./reminder-common";
import { SeriesForm, SeriesList } from "./series";
import { BackupPeople } from "./backups";
import styles from "./reminders.module.css";

export { displayInstant, protectedReminderError, ReminderDialog, useReminderAccountGuard } from "./reminder-common";

export function ReminderScreen({ taskId = "" }: { taskId?: string }) {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useReminderAccountGuard(profile.error);
  if (profile.isPending) return <Shell account><main className="account-loading"><LoaderCircle className="spin" aria-hidden />{t("reminders.loading")}</main></Shell>;
  if (profile.isError || !profile.data) return <Shell account><main className={styles.main}><h1>{t("reminders.unavailable")}</h1><p className="message error" role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} />{t("reminders.retry")}</button></main></Shell>;
  return <ReminderWorkspace key={profile.data.data.id} user={profile.data.data} taskId={taskId} />;
}

function ReminderWorkspace({ user, taskId }: { user: Account; taskId: string }) {
  const t = useText();
  const { language } = useLanguage();
  const client = useQueryClient();
  const [formLocked, setFormLocked] = useState(false);
  const [requestLocked, setRequestLocked] = useState(false);
  const [seriesLocked, setSeriesLocked] = useState(false);
  const [backupLocked, setBackupLocked] = useState(false);
  const locked = formLocked || requestLocked || seriesLocked || backupLocked;
  const [notice, setNotice] = useState("");
  const [cancel, setCancel] = useState<Reminder | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [accessError, setAccessError] = useState<Error | null>(null);
  const records = useInfiniteQuery({
    queryKey: ["reminders", user.id, taskId], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => reminderPage(user.id, taskId || undefined, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
  });
  const cancellation = useMutation({
    mutationFn: (record: Reminder) => api(`reminders/${record.id}/cancel`, reminderSchema, { method: "POST", accountId: user.id, body: {} }),
    onMutate: () => { setUncertain(true); setNotice(""); },
    onSuccess: async result => {
      setCancel(null); setUncertain(false);
      setNotice(`reminders.notice.${result.data.status}`);
      await client.invalidateQueries({ queryKey: ["reminders", user.id] });
    },
    onError: error => {
      if (protectedReminderError(error)) setAccessError(error);
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) setUncertain(false);
    },
  });
  useReminderAccountGuard(accessError ?? records.error);
  const denied = !!accessError || protectedReminderError(records.error);
  const rows = [...new Map(records.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];
  return <Shell account><main className={styles.main} onClickCapture={event => {
    if (locked && event.target instanceof Element && event.target.closest("a")) event.preventDefault();
  }}>
    <nav className={styles.nav} aria-label={t("reminders.workspace")}><Link href="/app/tasks"><ClipboardList size={18} />{t("reminders.tasks")}</Link><span aria-current="page"><CalendarClock size={18} />{t("reminders.title")}</span><Link href="/app/notifications"><Bell size={18} />{t("reminders.inbox")}</Link></nav>
    <div className={styles.heading}><div><span className="section-kicker">{t("reminders.kicker")}</span><h1>{t("reminders.title")}</h1></div><span className={styles.channel}>{t("reminders.inApp")}</span></div>
    {notice && <p className="message success" role="status"><Check size={18} />{Object.hasOwn(reminderMessages, notice) ? t(notice as keyof typeof reminderMessages) : notice}</p>}
    {denied ? <p className="message error" role="alert">{accessError?.message ?? records.error?.message}<Link href="/app/tasks">{t("reminders.returnTasks")}</Link></p> : <div className={styles.workspace}>
      <section aria-labelledby="reminder-list-title"><div className={styles.sectionHeading}><h2 id="reminder-list-title">{t("reminders.mine")}</h2><button className="icon-button" aria-label={t("reminders.refresh")} title={t("reminders.refresh")} disabled={locked || !!cancel || records.isFetching} onClick={() => records.refetch()}><RefreshCw size={18} className={records.isFetching ? "spin" : ""} /></button></div>
        {records.isPending && <p role="status">{t("reminders.loadingList")}</p>}
        {records.isError && <p className="message error" role="alert">{records.error.message}</p>}
        {!records.isPending && !records.isError && rows.length === 0 && <p className={styles.empty}>{t("reminders.empty")}</p>}
        {!records.isError && <ul className={styles.list}>{rows.map(item => <li key={item.id}>
          <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{t(`reminders.status.${item.status}`)}</span></div>
          <time dateTime={item.scheduled_at}>{displayInstant(item.scheduled_at, item.timezone, language)}</time><span className={styles.zone}>{item.timezone}</span>
          {item.follow_up_of ? <span className={styles.zone}>{t("reminders.snoozedCount", { count: item.snooze_count ?? 0 })}</span> : item.series_id && <span className={styles.zone}>{t("reminders.partOfSeries")}</span>}
          {item.reason && <p className={styles.reason}>{reasonLabel(item.reason, language)}</p>}
          {item.status === "scheduled" && item.source_changed && <p className={styles.reason}>{t("reminders.taskChanged")}</p>}
          {item.acknowledged_at && <span className={styles.ack}>{t("reminders.acknowledged")}</span>}
          <div className={styles.actions}><Link href={`/app/tasks?space_id=${item.space_id}`}>{t("reminders.openSpace")}</Link>{item.status === "scheduled" && !(item.series_id && !item.follow_up_of) && <button className="icon-button" aria-label={t("reminders.cancelLabel", { title: item.task_title })} title={t("reminders.cancel")} disabled={locked || !!cancel} onClick={() => { cancellation.reset(); setCancel(item); }}><X size={18} /></button>}</div>
        </li>)}</ul>}
        {records.hasNextPage && <button className="text-button" disabled={records.isFetching || locked || !!cancel} onClick={() => records.fetchNextPage()}>{t("reminders.more")}</button>}
      </section>
      <section className={styles.editor} aria-labelledby="reminder-editor-title"><h2 id="reminder-editor-title">{t("reminders.new")}</h2>{taskId ? <ReminderForm key={taskId} user={user} taskId={taskId} disabled={requestLocked || seriesLocked || !!cancel} onLocked={setFormLocked} onDenied={setAccessError} onSaved={async result => {
        setNotice("requested_by" in result ? `reminders.requestNotice.${result.status}` : "frequency" in result ? "reminders.seriesSaved" : "reminders.saved");
        await client.invalidateQueries({ queryKey: ["reminders", user.id] });
        await client.invalidateQueries({ queryKey: ["reminderRequests", user.id] });
        await client.invalidateQueries({ queryKey: ["reminderSeries", user.id] });
      }} /> : <Link className={styles.empty} href="/app/tasks">{t("reminders.chooseTask")}</Link>}</section>
    </div>}
    {!denied && <SeriesList user={user} taskId={taskId} disabled={formLocked || requestLocked || !!cancel} onLocked={setSeriesLocked} onDenied={setAccessError} onNotice={setNotice} />}
    {!denied && <ReminderRequests user={user} disabled={formLocked || seriesLocked || !!cancel} onLocked={setRequestLocked} onDenied={setAccessError} onNotice={setNotice} />}
    {!denied && <BackupPeople user={user} taskId={taskId} disabled={formLocked || seriesLocked || requestLocked || !!cancel} onLocked={setBackupLocked} onDenied={setAccessError} onNotice={setNotice} />}
    {cancel && !denied && <ReminderDialog title={t("reminders.cancelTitle")} closeLabel={t("reminders.closeDialog")} locked={cancellation.isPending || uncertain} onClose={() => setCancel(null)}>
      <p className={styles.reviewTitle}>{cancel.task_title}</p><p>{displayInstant(cancel.scheduled_at, cancel.timezone, language)}</p>
      {cancellation.isError && <p className="message error" role="alert">{cancellation.error.message}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={cancellation.isPending || uncertain} onClick={() => setCancel(null)}>{t("reminders.keep")}</button><button className="primary-button" disabled={cancellation.isPending} onClick={() => cancellation.mutate(cancel)}><X size={17} />{t(cancellation.isError && uncertain ? "reminders.retryCancel" : "reminders.cancel")}</button></div>
    </ReminderDialog>}
  </main></Shell>;
}

function ReminderForm({ user, taskId, disabled, onLocked, onDenied, onSaved }: {
  user: Account; taskId: string; disabled: boolean; onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onSaved: (result: Reminder | ReminderRequest | ReminderSeries) => Promise<void>;
}) {
  const t = useText();
  const { language } = useLanguage();
  const fieldId = useId();
  const [local, setLocal] = useState("");
  const [timezone, setTimezone] = useState(user.timezone);
  const [mode, setMode] = useState<"self" | "assignee">("self");
  const [repeat, setRepeat] = useState<"once" | "daily" | "weekly">("once");
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [review, setReview] = useState<ReminderPreview | ReminderRequestPreview | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [intent, setIntent] = useState<ReminderIntent | ReminderRequestIntent | null>(null);
  const [error, setError] = useState("");
  const task = useQuery({ queryKey: ["reminderTask", user.id, taskId], queryFn: () => readTask(taskId, user.id) });
  const zones = useQuery({ queryKey: ["timezones"], queryFn: ({ signal }) => api("timezones", z.array(z.string()), { signal }) });
  const preferences = useQuery({ queryKey: ["notificationPreferences", user.id], queryFn: ({ signal }) => api("me/notification-preferences", notificationPreferencesSchema, { accountId: user.id, signal }) });
  const preview = useMutation({
    mutationFn: async () => {
      if (mode === "self") return previewReminder(user.id, taskId, local, timezone);
      if (!task.data?.permissions.can_edit || !task.data.assignee || task.data.assignee.account_id === user.id) throw new ApiError(409, "RECIPIENT_UNAVAILABLE", t("reminders.assigneeChanged"));
      return previewReminderRequest(user.id, task.data.assignee.account_id, taskId, local, timezone);
    },
    onSuccess: result => { setReview(result); setSelected(result.options.length === 1 ? 0 : null); setError(""); },
    onError: problem => { setError(problem.message); if (protectedReminderError(problem)) onDenied(problem); },
  });
  const save = useMutation({
    mutationFn: async (command: ReminderIntent | ReminderRequestIntent): Promise<Reminder | ReminderRequest> => "recipientAccountId" in command ? saveReminderRequest(command) : saveReminder(command),
    onSuccess: async result => { setIntent(null); setReview(null); setSelected(null); setLocal(""); setError(""); await onSaved(result); },
    onError: problem => {
      setError(problem.message);
      if (protectedReminderError(problem)) onDenied(problem);
      if (problem instanceof ApiError && problem.status >= 400 && problem.status < 500 && problem.status !== 408) { setIntent(null); setReview(null); setSelected(null); }
    },
  });
  const ownLocked = preview.isPending || save.isPending || intent !== null;
  const locked = ownLocked || disabled;
  useEffect(() => { onLocked(ownLocked || review !== null || seriesBusy); return () => onLocked(false); }, [ownLocked, review, seriesBusy, onLocked]);
  useEffect(() => {
    if (!intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [intent]);
  useEffect(() => { if (task.error && protectedReminderError(task.error)) onDenied(task.error); }, [task.error, onDenied]);
  useReminderAccountGuard(preferences.error);
  if (task.isPending || preferences.isPending) return <p role="status">{t("reminders.detailsLoading")}</p>;
  if (task.isError || preferences.isError || !task.data || !preferences.data) return <p className="message error" role="alert">{task.error?.message ?? preferences.error?.message}</p>;
  const canRequest = task.data.permissions.can_edit && !!task.data.assignee && task.data.assignee.account_id !== user.id;
  const eligible = ["open", "in_progress"].includes(task.data.status) && (mode === "assignee" ? canRequest : preferences.data.data.in_app_reminders_enabled);
  return <div className={styles.form}>
    <h3 className={styles.reviewTitle}>{task.data.title}</h3>
    {canRequest && !review && <fieldset className={styles.options} disabled={locked || seriesBusy}><legend>{t("reminders.recipient")}</legend>
      <label className={styles.option}><input type="radio" name={`${fieldId}-recipient`} checked={mode === "self"} onChange={() => setMode("self")} /><span>{t("reminders.remindMe")}</span></label>
      <label className={styles.option}><input type="radio" name={`${fieldId}-recipient`} checked={mode === "assignee"} onChange={() => setMode("assignee")} /><span>{t("reminders.requestFor", { name: task.data.assignee?.display_name ?? "" })}</span></label>
    </fieldset>}
    {!eligible && <p className="message error" role="alert">{t(mode === "assignee" ? "reminders.assigneeIneligible" : preferences.data.data.in_app_reminders_enabled ? "reminders.taskClosed" : "reminders.disabled")} <Link href="/app/notifications">{t("reminders.settings")}</Link></p>}
    {mode === "self" && !review && <label><span id={`${fieldId}-repeat`}>{t("reminders.repeat")}</span><select aria-labelledby={`${fieldId}-repeat`} name="reminder_repeat" value={repeat} disabled={locked || seriesBusy || !eligible} onChange={event => { setRepeat(event.target.value as "once" | "daily" | "weekly"); setError(""); }}>
      <option value="once">{t("reminders.once")}</option><option value="daily">{t("reminders.daily")}</option><option value="weekly">{t("reminders.weekly")}</option>
    </select></label>}
    {zones.isError && !review && <TimezoneListProblem message={t("reminders.timezoneProblem")} retryLabel={t("reminders.retry")} retry={() => zones.refetch()} />}
    {mode === "self" && repeat !== "once" && !review ? <SeriesForm user={user} taskId={taskId} frequency={repeat} zones={zones.data?.data ?? [user.timezone]} disabled={disabled || !eligible} onLocked={setSeriesBusy} onDenied={onDenied} onSaved={async result => { setRepeat("once"); await onSaved(result); }} />
    : review ? <section className={styles.review} aria-labelledby={`${fieldId}-review`}>
      <h3 id={`${fieldId}-review`}>{t("requested_by" in review ? "reminders.reviewRequest" : "reminders.review")}</h3><dl className={styles.facts}>
        <dt>{t("reminders.task")}</dt><dd>{review.task_title}</dd><dt>{t("reminders.recipient")}</dt><dd>{review.recipient.account_id === user.id ? t("reminders.you", { name: review.recipient.display_name }) : review.recipient.display_name}</dd>
        <dt>{t("reminders.localTime")}</dt><dd>{displayReminderTime(review.local_time, language)}</dd><dt>{t("reminders.timezone")}</dt><dd>{review.timezone}</dd><dt>{t("reminders.channel")}</dt><dd>{t("reminders.inApp")}</dd>
        {"request_expires_at" in review && <><dt>{t("reminders.requestExpires")}</dt><dd>{displayInstant(review.request_expires_at, review.timezone, language)}</dd></>}
      </dl>
      <fieldset className={styles.options} disabled={locked}><legend>{t(review.options.length > 1 ? "reminders.ambiguous" : "reminders.scheduledTime")}</legend>{review.options.map((option, index) => <label className={styles.option} key={option.preview_token}>
        <input type="radio" name={`${fieldId}-occurrence`} checked={selected === index} onChange={() => setSelected(index)} />
        <span>{offsetLabel(option.utc_offset_minutes)}<strong>{displayReminderTime(option.scheduled_at, language)}</strong><small>{t("reminders.dispatchDeadline", { date: displayReminderTime(option.dispatch_expires_at, language) })}</small></span>
      </label>)}</fieldset>
      <p className={styles.disclosure}>{t("requested_by" in review ? "reminders.requestDisclosure" : "reminders.noPush")}</p>
      <div className={styles.actions}><button className="secondary-button" disabled={locked} onClick={() => { setReview(null); setSelected(null); }}>{t("reminders.changeTime")}</button><button className="primary-button" disabled={selected === null || save.isPending || disabled || (!intent && !eligible)} onClick={() => {
        if (selected === null) return;
        const base = { accountId: user.id, taskId, key: intent?.key ?? crypto.randomUUID(), previewToken: review.options[selected].preview_token };
        const command = intent ?? ("requested_by" in review ? { ...base, recipientAccountId: review.recipient.account_id, spaceId: task.data.space_id,
          taskVersion: review.task_version, localTime: review.local_time, timezone: review.timezone, scheduledAt: review.options[selected].scheduled_at } : base);
        setIntent(command); setError(""); save.mutate(command);
      }}>{save.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : <Check size={17} />}{t(intent && !save.isPending ? "reminders.retrySave" : "requested_by" in review ? "reminders.sendRequest" : "reminders.save")}</button></div>
    </section> : <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!local || !eligible) return; setError(""); preview.mutate(); }}>
      <label>{t("reminders.dateTime")}<input name="reminder_local_time" type="datetime-local" required step={60} value={local} disabled={locked || !eligible} onChange={event => { setLocal(event.target.value); setError(""); }} /></label>
      <label><span id={`${fieldId}-zone`}>{t("reminders.timezone")}</span><select aria-labelledby={`${fieldId}-zone`} name="reminder_timezone" value={timezone} disabled={locked || !eligible} onChange={event => { setTimezone(event.target.value); setError(""); }}>{(zones.data?.data ?? [user.timezone]).map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>
      <button className="primary-button" type="submit" disabled={locked || !eligible || !local}>{preview.isPending ? <LoaderCircle size={17} className="spin" /> : <CalendarClock size={17} />}{t("reminders.reviewTime")}</button>
    </form>}
    {error && <p className="message error" role="alert">{error}</p>}
  </div>;
}

function ReminderRequests({ user, disabled, onLocked, onDenied, onNotice }: {
  user: Account; disabled: boolean; onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onNotice: (message: string) => void;
}) {
  const t = useText();
  const { language } = useLanguage();
  const client = useQueryClient();
  const titleId = useId();
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [selection, setSelection] = useState<{ request: ReminderRequest; action: "review" | "decline" | "cancel" } | null>(null);
  const [approval, setApproval] = useState<ReminderRequestReview | null>(null);
  const [intent, setIntent] = useState<ReminderRequestAction | null>(null);
  const [error, setError] = useState("");
  const records = useInfiniteQuery({
    queryKey: ["reminderRequests", user.id, direction], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => reminderRequestPage(user.id, direction, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
  });
  const review = useMutation({
    mutationFn: (request: ReminderRequest) => reviewReminderRequest(user.id, request),
    onSuccess: result => { setApproval(result); setError(""); },
    onError: problem => { setError(problem.message); if (protectedReminderError(problem)) onDenied(problem); },
  });
  const respond = useMutation({
    mutationFn: respondReminderRequest,
    onSuccess: async result => {
      setIntent(null); setSelection(null); setApproval(null); setError(""); onNotice(`reminders.requestNotice.${result.status}`);
      await client.invalidateQueries({ queryKey: ["reminderRequests", user.id] });
      await client.invalidateQueries({ queryKey: ["reminders", user.id] });
    },
    onError: problem => {
      setError(problem.message);
      if (protectedReminderError(problem)) onDenied(problem);
      if (problem instanceof ApiError && problem.status >= 400 && problem.status < 500 && problem.status !== 408) {
        setIntent(null); setSelection(null); setApproval(null);
      }
    },
  });
  const locked = review.isPending || respond.isPending || intent !== null;
  useEffect(() => { onLocked(selection !== null || locked); return () => onLocked(false); }, [selection, locked, onLocked]);
  useEffect(() => { if (records.error && protectedReminderError(records.error)) onDenied(records.error); }, [records.error, onDenied]);
  useEffect(() => {
    if (!intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [intent]);
  const rows = [...new Map(records.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];
  const selected = approval?.request ?? selection?.request;
  const close = () => { setSelection(null); setApproval(null); setError(""); };
  // The two lists follow the tab pattern: arrow keys, Home and End move between them, and only the selected tab is in the Tab order.
  const moveTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === "Home" ? "received" : event.key === "End" ? "sent"
      : event.key === "ArrowLeft" || event.key === "ArrowRight" ? (direction === "received" ? "sent" : "received") : null;
    if (!next || disabled || selection) return;
    event.preventDefault();
    setDirection(next);
    setError("");
    document.getElementById(`${titleId}-${next}`)?.focus();
  };
  return <section className={styles.requests} aria-labelledby={titleId}>
    <div className={styles.sectionHeading}><h2 id={titleId}>{t("reminders.requests")}</h2><button className="icon-button" aria-label={t("reminders.refreshRequests")} title={t("reminders.refreshRequests")} disabled={disabled || !!selection || records.isFetching} onClick={() => records.refetch()}><RefreshCw size={18} className={records.isFetching ? "spin" : ""} /></button></div>
    <div className={styles.requestTabs} style={language === "en" ? undefined : { flexWrap: "wrap" }} role="tablist" aria-label={t("reminders.requestLists")} onKeyDown={moveTab}>{(["received", "sent"] as const).map(value => <button key={value} id={`${titleId}-${value}`} role="tab" aria-selected={direction === value} aria-controls={`${titleId}-panel`} tabIndex={direction === value ? 0 : -1} disabled={disabled || !!selection} onClick={() => { setDirection(value); setError(""); }}>
      {value === "received" ? <Inbox size={17} /> : <Send size={17} />}{t(value === "received" ? "reminders.received" : "reminders.sent")}
    </button>)}</div>
    <div role="tabpanel" id={`${titleId}-panel`} aria-labelledby={`${titleId}-${direction}`}>
    {records.isPending && <p role="status">{t("reminders.loadingRequests")}</p>}
    {(records.error || (error && !selection)) && <p className="message error" role="alert">{records.error?.message ?? error}</p>}
    {!records.isPending && !records.isError && rows.length === 0 && <p className={styles.empty}>{t(direction === "received" ? "reminders.noReceived" : "reminders.noSent")}</p>}
    {!records.isError && <ul className={styles.list}>{rows.map(item => <li key={item.id}>
      <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{t(`reminders.requestStatus.${item.status}`)}</span></div>
      <span>{t(direction === "received" ? "reminders.fromName" : "reminders.forName", { name: direction === "received" ? item.requested_by.display_name : item.recipient.display_name })}</span>
      <time dateTime={item.scheduled_at}>{displayInstant(item.scheduled_at, item.timezone, language)}</time><span className={styles.zone}>{item.timezone}</span>
      {item.status === "pending" && <div className={styles.actions}>
        {direction === "received" ? <><button className="primary-button" disabled={disabled || !!selection} onClick={() => { setSelection({ request: item, action: "review" }); setApproval(null); setError(""); review.mutate(item); }}><CalendarClock size={17} />{t("reminders.reviewRequestAction")}</button>
          <button className="secondary-button" disabled={disabled || !!selection} onClick={() => { setSelection({ request: item, action: "decline" }); setApproval(null); setError(""); }}><X size={17} />{t("reminders.decline")}</button></>
          : <button className="secondary-button" disabled={disabled || !!selection} onClick={() => { setSelection({ request: item, action: "cancel" }); setApproval(null); setError(""); }}><X size={17} />{t("reminders.withdraw")}</button>}
      </div>}
    </li>)}</ul>}
    {records.hasNextPage && <button className="text-button" disabled={disabled || !!selection || records.isFetching} onClick={() => records.fetchNextPage()}>{t("reminders.moreRequests")}</button>}
    </div>
    {selection && selected && <ReminderDialog title={t(selection.action === "review" ? "reminders.reviewRequest" : selection.action === "decline" ? "reminders.declineTitle" : "reminders.withdrawTitle")} closeLabel={t("reminders.closeDialog")} locked={locked} onClose={close}>
      <p className={styles.reviewTitle}>{selected.task_title}</p><dl className={styles.facts}>
        <dt>{t("reminders.from")}</dt><dd>{selected.requested_by.display_name}</dd><dt>{t("reminders.recipient")}</dt><dd>{selected.recipient.display_name}</dd>
        <dt>{t("reminders.localTime")}</dt><dd>{displayReminderTime(selected.local_time, language)}</dd><dt>{t("reminders.timezone")}</dt><dd>{selected.timezone}</dd>
        <dt>{t("reminders.utcTime")}</dt><dd>{displayReminderTime(selected.scheduled_at, language)}</dd><dt>{t("reminders.channel")}</dt><dd>{t("reminders.inApp")}</dd>
        <dt>{t("reminders.dispatchDeadlineLabel")}</dt><dd>{displayReminderTime(selected.dispatch_expires_at, language)}</dd><dt>{t("reminders.requestExpires")}</dt><dd>{displayReminderTime(selected.expires_at, language)}</dd>
      </dl>
      {selection.action === "review" && <p className={styles.disclosure}>{t("reminders.acceptDisclosure")}</p>}
      {review.isPending && <p role="status">{t("reminders.checkingRequest")}</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={locked} onClick={close}>{t("reminders.notNow")}</button>
        {selection.action === "review" && !approval && review.isError && <button className="secondary-button" disabled={locked} onClick={() => review.mutate(selection.request)}><RefreshCw size={17} />{t("reminders.reloadReview")}</button>}
        <button className="primary-button" disabled={review.isPending || respond.isPending || (selection.action === "review" && !approval)} onClick={() => {
          const command = intent ?? { accountId: user.id, request: selected, action: selection.action === "review" ? "accept" : selection.action, previewToken: approval?.preview_token };
          setIntent(command); setError(""); respond.mutate(command);
        }}>{respond.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : selection.action === "review" ? <Check size={17} /> : <X size={17} />}
          {t(intent ? "reminders.retryResponse" : selection.action === "review" ? "reminders.accept" : selection.action === "decline" ? "reminders.declineRequest" : "reminders.withdraw")}</button>
      </div>
    </ReminderDialog>}
  </section>;
}

function reasonLabel(reason: string, language: Language) {
  const id = `reminders.reason.${reason}`;
  return translate(language, Object.hasOwn(reminderMessages, id) ? id as keyof typeof reminderMessages : "reminders.reason.stopped");
}