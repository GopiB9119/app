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
import { readTask } from "@/features/planning/client";
import { notificationPreferencesSchema, offsetLabel, previewReminder, reminderLabels, reminderPage, reminderSchema, saveReminder } from "./client";
import { previewReminderRequest, reminderRequestPage, requestLabels, respondReminderRequest, reviewReminderRequest, saveReminderRequest } from "./client";
import type { ReminderSeries } from "./client";
import type { Reminder, ReminderIntent, ReminderPreview, ReminderRequest, ReminderRequestAction, ReminderRequestIntent, ReminderRequestPreview, ReminderRequestReview } from "./client";
import { displayInstant, protectedReminderError, ReminderDialog, useReminderAccountGuard } from "./reminder-common";
import { SeriesForm, SeriesList } from "./series";
import { BackupPeople } from "./backups";
import styles from "./reminders.module.css";

export { displayInstant, protectedReminderError, ReminderDialog, useReminderAccountGuard } from "./reminder-common";

export function ReminderScreen({ taskId = "" }: { taskId?: string }) {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useReminderAccountGuard(profile.error);
  if (profile.isPending) return <Shell account><main className="account-loading"><LoaderCircle className="spin" aria-hidden />Loading reminders</main></Shell>;
  if (profile.isError || !profile.data) return <Shell account><main className={styles.main}><h1>Reminders unavailable</h1><p className="message error" role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} />Retry</button></main></Shell>;
  return <ReminderWorkspace key={profile.data.data.id} user={profile.data.data} taskId={taskId} />;
}

function ReminderWorkspace({ user, taskId }: { user: Account; taskId: string }) {
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
      setNotice(result.data.status === "cancelled" ? "Reminder cancelled." : `Reminder ${reminderLabels[result.data.status].toLowerCase()}.`);
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
    <nav className={styles.nav} aria-label="Workspace"><Link href="/app/tasks"><ClipboardList size={18} />Tasks</Link><span aria-current="page"><CalendarClock size={18} />Reminders</span><Link href="/app/notifications"><Bell size={18} />Inbox</Link></nav>
    <div className={styles.heading}><div><span className="section-kicker">TASK REMINDERS</span><h1>Reminders</h1></div><span className={styles.channel}>In-app only</span></div>
    {notice && <p className="message success" role="status"><Check size={18} />{notice}</p>}
    {denied ? <p className="message error" role="alert">{accessError?.message ?? records.error?.message}<Link href="/app/tasks">Return to tasks</Link></p> : <div className={styles.workspace}>
      <section aria-labelledby="reminder-list-title"><div className={styles.sectionHeading}><h2 id="reminder-list-title">My reminders</h2><button className="icon-button" aria-label="Refresh reminders" title="Refresh reminders" disabled={locked || !!cancel || records.isFetching} onClick={() => records.refetch()}><RefreshCw size={18} className={records.isFetching ? "spin" : ""} /></button></div>
        {records.isPending && <p role="status">Loading reminders...</p>}
        {records.isError && <p className="message error" role="alert">{records.error.message}</p>}
        {!records.isPending && !records.isError && rows.length === 0 && <p className={styles.empty}>No reminders yet.</p>}
        {!records.isError && <ul className={styles.list}>{rows.map(item => <li key={item.id}>
          <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{reminderLabels[item.status]}</span></div>
          <time dateTime={item.scheduled_at}>{displayInstant(item.scheduled_at, item.timezone)}</time><span className={styles.zone}>{item.timezone}</span>
          {item.follow_up_of ? <span className={styles.zone}>Snoozed reminder {item.snooze_count} of 3</span> : item.series_id && <span className={styles.zone}>Part of a repeating reminder</span>}
          {item.reason && <p className={styles.reason}>{reasonLabel(item.reason)}</p>}
          {item.status === "scheduled" && item.source_changed && <p className={styles.reason}>Task changed since review.</p>}
          {item.acknowledged_at && <span className={styles.ack}>Acknowledged</span>}
          <div className={styles.actions}><Link href={`/app/tasks?space_id=${item.space_id}`}>Open task Space</Link>{item.status === "scheduled" && !(item.series_id && !item.follow_up_of) && <button className="icon-button" aria-label={`Cancel reminder: ${item.task_title}`} title="Cancel reminder" disabled={locked || !!cancel} onClick={() => { cancellation.reset(); setCancel(item); }}><X size={18} /></button>}</div>
        </li>)}</ul>}
        {records.hasNextPage && <button className="text-button" disabled={records.isFetching || locked || !!cancel} onClick={() => records.fetchNextPage()}>Load more reminders</button>}
      </section>
      <section className={styles.editor} aria-labelledby="reminder-editor-title"><h2 id="reminder-editor-title">New reminder</h2>{taskId ? <ReminderForm key={taskId} user={user} taskId={taskId} disabled={requestLocked || seriesLocked || !!cancel} onLocked={setFormLocked} onDenied={setAccessError} onSaved={async result => {
        setNotice("requested_by" in result ? `Request ${requestLabels[result.status].toLowerCase()}.` : "frequency" in result ? "Repeating reminder saved." : "Reminder saved.");
        await client.invalidateQueries({ queryKey: ["reminders", user.id] });
        await client.invalidateQueries({ queryKey: ["reminderRequests", user.id] });
        await client.invalidateQueries({ queryKey: ["reminderSeries", user.id] });
      }} /> : <Link className={styles.empty} href="/app/tasks">Choose a task</Link>}</section>
    </div>}
    {!denied && <SeriesList user={user} taskId={taskId} disabled={formLocked || requestLocked || !!cancel} onLocked={setSeriesLocked} onDenied={setAccessError} onNotice={setNotice} />}
    {!denied && <ReminderRequests user={user} disabled={formLocked || seriesLocked || !!cancel} onLocked={setRequestLocked} onDenied={setAccessError} onNotice={setNotice} />}
    {!denied && <BackupPeople user={user} taskId={taskId} disabled={formLocked || seriesLocked || requestLocked || !!cancel} onLocked={setBackupLocked} onDenied={setAccessError} onNotice={setNotice} />}
    {cancel && !denied && <ReminderDialog title="Cancel this reminder?" locked={cancellation.isPending || uncertain} onClose={() => setCancel(null)}>
      <p className={styles.reviewTitle}>{cancel.task_title}</p><p>{displayInstant(cancel.scheduled_at, cancel.timezone)}</p>
      {cancellation.isError && <p className="message error" role="alert">{cancellation.error.message}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={cancellation.isPending || uncertain} onClick={() => setCancel(null)}>Keep reminder</button><button className="primary-button" disabled={cancellation.isPending} onClick={() => cancellation.mutate(cancel)}><X size={17} />{cancellation.isError && uncertain ? "Retry cancellation" : "Cancel reminder"}</button></div>
    </ReminderDialog>}
  </main></Shell>;
}

function ReminderForm({ user, taskId, disabled, onLocked, onDenied, onSaved }: {
  user: Account; taskId: string; disabled: boolean; onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onSaved: (result: Reminder | ReminderRequest | ReminderSeries) => Promise<void>;
}) {
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
      if (!task.data?.permissions.can_edit || !task.data.assignee || task.data.assignee.account_id === user.id) throw new ApiError(409, "RECIPIENT_UNAVAILABLE", "The task assignee changed. Reload the task.");
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
  if (task.isPending || preferences.isPending) return <p role="status">Loading reminder details...</p>;
  if (task.isError || preferences.isError || !task.data || !preferences.data) return <p className="message error" role="alert">{task.error?.message ?? preferences.error?.message}</p>;
  const canRequest = task.data.permissions.can_edit && !!task.data.assignee && task.data.assignee.account_id !== user.id;
  const eligible = ["open", "in_progress"].includes(task.data.status) && (mode === "assignee" ? canRequest : preferences.data.data.in_app_reminders_enabled);
  return <div className={styles.form}>
    <h3 className={styles.reviewTitle}>{task.data.title}</h3>
    {canRequest && !review && <fieldset className={styles.options} disabled={locked || seriesBusy}><legend>Recipient</legend>
      <label className={styles.option}><input type="radio" name={`${fieldId}-recipient`} checked={mode === "self"} onChange={() => setMode("self")} /><span>Remind me</span></label>
      <label className={styles.option}><input type="radio" name={`${fieldId}-recipient`} checked={mode === "assignee"} onChange={() => setMode("assignee")} /><span>Request for {task.data.assignee?.display_name}</span></label>
    </fieldset>}
    {!eligible && <p className="message error" role="alert">{mode === "assignee" ? "The current assignee is not eligible for a request." : preferences.data.data.in_app_reminders_enabled ? "This task is closed." : "In-app reminders are disabled."} <Link href="/app/notifications">Notification settings</Link></p>}
    {mode === "self" && !review && <label><span id={`${fieldId}-repeat`}>Repeat</span><select aria-labelledby={`${fieldId}-repeat`} name="reminder_repeat" value={repeat} disabled={locked || seriesBusy || !eligible} onChange={event => { setRepeat(event.target.value as "once" | "daily" | "weekly"); setError(""); }}>
      <option value="once">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option>
    </select></label>}
    {zones.isError && !review && <TimezoneListProblem retry={() => zones.refetch()} />}
    {mode === "self" && repeat !== "once" && !review ? <SeriesForm user={user} taskId={taskId} frequency={repeat} zones={zones.data?.data ?? [user.timezone]} disabled={disabled || !eligible} onLocked={setSeriesBusy} onDenied={onDenied} onSaved={async result => { setRepeat("once"); await onSaved(result); }} />
    : review ? <section className={styles.review} aria-labelledby={`${fieldId}-review`}>
      <h3 id={`${fieldId}-review`}>{"requested_by" in review ? "Review reminder request" : "Review reminder"}</h3><dl className={styles.facts}>
        <dt>Task</dt><dd>{review.task_title}</dd><dt>Recipient</dt><dd>{review.recipient.display_name}{review.recipient.account_id === user.id ? " (you)" : ""}</dd>
        <dt>Local time</dt><dd>{review.local_time.replace("T", " ")}</dd><dt>Timezone</dt><dd>{review.timezone}</dd><dt>Channel</dt><dd>In-app only</dd>
        {"request_expires_at" in review && <><dt>Request expires</dt><dd>{displayInstant(review.request_expires_at, review.timezone)}</dd></>}
      </dl>
      <fieldset className={styles.options} disabled={locked}><legend>{review.options.length > 1 ? "This clock time occurs twice. Choose one." : "Scheduled time"}</legend>{review.options.map((option, index) => <label className={styles.option} key={option.preview_token}>
        <input type="radio" name={`${fieldId}-occurrence`} checked={selected === index} onChange={() => setSelected(index)} />
        <span>{offsetLabel(option.utc_offset_minutes)}<strong>{option.scheduled_at.replace("T", " ")}</strong><small>Dispatch deadline: {option.dispatch_expires_at.replace("T", " ")}</small></span>
      </label>)}</fieldset>
      <p className={styles.disclosure}>{"requested_by" in review ? "Requires the recipient's acceptance. " : ""}No push alert or external message.</p>
      <div className={styles.actions}><button className="secondary-button" disabled={locked} onClick={() => { setReview(null); setSelected(null); }}>Change time</button><button className="primary-button" disabled={selected === null || save.isPending || disabled || (!intent && !eligible)} onClick={() => {
        if (selected === null) return;
        const base = { accountId: user.id, taskId, key: intent?.key ?? crypto.randomUUID(), previewToken: review.options[selected].preview_token };
        const command = intent ?? ("requested_by" in review ? { ...base, recipientAccountId: review.recipient.account_id, spaceId: task.data.space_id,
          taskVersion: review.task_version, localTime: review.local_time, timezone: review.timezone, scheduledAt: review.options[selected].scheduled_at } : base);
        setIntent(command); setError(""); save.mutate(command);
      }}>{save.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : <Check size={17} />}{intent && !save.isPending ? "Retry original save" : "requested_by" in review ? "Send request" : "Save reminder"}</button></div>
    </section> : <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!local || !eligible) return; setError(""); preview.mutate(); }}>
      <label>Reminder date and time<input name="reminder_local_time" type="datetime-local" required step={60} value={local} disabled={locked || !eligible} onChange={event => { setLocal(event.target.value); setError(""); }} /></label>
      <label><span id={`${fieldId}-zone`}>Timezone</span><select aria-labelledby={`${fieldId}-zone`} name="reminder_timezone" value={timezone} disabled={locked || !eligible} onChange={event => { setTimezone(event.target.value); setError(""); }}>{(zones.data?.data ?? [user.timezone]).map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>
      <button className="primary-button" type="submit" disabled={locked || !eligible || !local}>{preview.isPending ? <LoaderCircle size={17} className="spin" /> : <CalendarClock size={17} />}Review time</button>
    </form>}
    {error && <p className="message error" role="alert">{error}</p>}
  </div>;
}

function ReminderRequests({ user, disabled, onLocked, onDenied, onNotice }: {
  user: Account; disabled: boolean; onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onNotice: (message: string) => void;
}) {
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
      setIntent(null); setSelection(null); setApproval(null); setError(""); onNotice(`Request ${requestLabels[result.status].toLowerCase()}.`);
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
    <div className={styles.sectionHeading}><h2 id={titleId}>Reminder requests</h2><button className="icon-button" aria-label="Refresh reminder requests" title="Refresh reminder requests" disabled={disabled || !!selection || records.isFetching} onClick={() => records.refetch()}><RefreshCw size={18} className={records.isFetching ? "spin" : ""} /></button></div>
    <div className={styles.requestTabs} role="tablist" aria-label="Reminder request lists" onKeyDown={moveTab}>{(["received", "sent"] as const).map(value => <button key={value} id={`${titleId}-${value}`} role="tab" aria-selected={direction === value} aria-controls={`${titleId}-panel`} tabIndex={direction === value ? 0 : -1} disabled={disabled || !!selection} onClick={() => { setDirection(value); setError(""); }}>
      {value === "received" ? <Inbox size={17} /> : <Send size={17} />}{value === "received" ? "Received" : "Sent"}
    </button>)}</div>
    <div role="tabpanel" id={`${titleId}-panel`} aria-labelledby={`${titleId}-${direction}`}>
    {records.isPending && <p role="status">Loading requests...</p>}
    {(records.error || (error && !selection)) && <p className="message error" role="alert">{records.error?.message ?? error}</p>}
    {!records.isPending && !records.isError && rows.length === 0 && <p className={styles.empty}>No {direction} requests.</p>}
    {!records.isError && <ul className={styles.list}>{rows.map(item => <li key={item.id}>
      <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{requestLabels[item.status]}</span></div>
      <span>{direction === "received" ? `From ${item.requested_by.display_name}` : `For ${item.recipient.display_name}`}</span>
      <time dateTime={item.scheduled_at}>{displayInstant(item.scheduled_at, item.timezone)}</time><span className={styles.zone}>{item.timezone}</span>
      {item.status === "pending" && <div className={styles.actions}>
        {direction === "received" ? <><button className="primary-button" disabled={disabled || !!selection} onClick={() => { setSelection({ request: item, action: "review" }); setApproval(null); setError(""); review.mutate(item); }}><CalendarClock size={17} />Review request</button>
          <button className="secondary-button" disabled={disabled || !!selection} onClick={() => { setSelection({ request: item, action: "decline" }); setApproval(null); setError(""); }}><X size={17} />Decline</button></>
          : <button className="secondary-button" disabled={disabled || !!selection} onClick={() => { setSelection({ request: item, action: "cancel" }); setApproval(null); setError(""); }}><X size={17} />Withdraw request</button>}
      </div>}
    </li>)}</ul>}
    {records.hasNextPage && <button className="text-button" disabled={disabled || !!selection || records.isFetching} onClick={() => records.fetchNextPage()}>Load more requests</button>}
    </div>
    {selection && selected && <ReminderDialog title={selection.action === "review" ? "Review reminder request" : selection.action === "decline" ? "Decline reminder request?" : "Withdraw reminder request?"} locked={locked} onClose={close}>
      <p className={styles.reviewTitle}>{selected.task_title}</p><dl className={styles.facts}>
        <dt>From</dt><dd>{selected.requested_by.display_name}</dd><dt>Recipient</dt><dd>{selected.recipient.display_name}</dd>
        <dt>Local time</dt><dd>{selected.local_time.replace("T", " ")}</dd><dt>Timezone</dt><dd>{selected.timezone}</dd>
        <dt>UTC time</dt><dd>{selected.scheduled_at.replace("T", " ")}</dd><dt>Channel</dt><dd>In-app only</dd>
        <dt>Dispatch deadline</dt><dd>{selected.dispatch_expires_at.replace("T", " ")}</dd><dt>Request expires</dt><dd>{selected.expires_at.replace("T", " ")}</dd>
      </dl>
      {selection.action === "review" && <p className={styles.disclosure}>Accepting creates your personal reminder. No push alert or external message.</p>}
      {review.isPending && <p role="status">Checking this request...</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={locked} onClick={close}>Not now</button>
        {selection.action === "review" && !approval && review.isError && <button className="secondary-button" disabled={locked} onClick={() => review.mutate(selection.request)}><RefreshCw size={17} />Reload review</button>}
        <button className="primary-button" disabled={review.isPending || respond.isPending || (selection.action === "review" && !approval)} onClick={() => {
          const command = intent ?? { accountId: user.id, request: selected, action: selection.action === "review" ? "accept" : selection.action, previewToken: approval?.preview_token };
          setIntent(command); setError(""); respond.mutate(command);
        }}>{respond.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : selection.action === "review" ? <Check size={17} /> : <X size={17} />}
          {intent ? "Retry original response" : selection.action === "review" ? "Accept reminder" : selection.action === "decline" ? "Decline request" : "Withdraw request"}</button>
      </div>
    </ReminderDialog>}
  </section>;
}

function reasonLabel(reason: string) {
  return ({ task_changed: "Task changed after this reminder was reviewed.", task_closed: "Task is no longer open.", preference_revoked: "The earlier reminder permission was withdrawn.", access_lost: "Task access changed.", account_inactive: "Account is inactive.", dispatch_expired: "The dispatch deadline passed.", dispatch_retry: "Delivery retry pending.", dispatch_failed: "Delivery stopped after repeated failures.", skipped: "Skipped.", series_paused: "On hold while the repeating reminder is paused.", series_cancelled: "The repeating reminder was cancelled.", series_ended: "The repeating reminder ended.", series_suppressed: "The repeating reminder stopped.", acknowledged: "Not needed: you acknowledged this reminder." } as Record<string, string>)[reason] ?? "Reminder was stopped.";
}