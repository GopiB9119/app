"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, CalendarClock, Check, CheckCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { browserAlertsEnabled, setBrowserAlertsEnabled } from "@/features/realtime/live";
import { notificationPage, notificationPreferencesSchema, notificationSchema, snoozeChoices, snoozeNotification } from "@/features/scheduling/client";
import type { Notification, SnoozeIntent, SnoozeMinutes } from "@/features/scheduling/client";
import { displayInstant, protectedReminderError, ReminderDialog, useReminderAccountGuard } from "@/features/scheduling/reminder-screen";
import styles from "@/features/scheduling/reminders.module.css";
import { DueNowPanel, QuietHoursSettings } from "./alerts";

export function NotificationScreen() {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useReminderAccountGuard(profile.error);
  if (profile.isPending) return <Shell account><main className="account-loading"><LoaderCircle className="spin" />Loading inbox</main></Shell>;
  if (profile.isError || !profile.data) return <Shell account><main className={styles.main}><h1>Inbox unavailable</h1><p className="message error" role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} />Retry</button></main></Shell>;
  return <Inbox key={profile.data.data.id} user={profile.data.data} />;
}

function Inbox({ user }: { user: Account }) {
  const client = useQueryClient();
  const [review, setReview] = useState<Notification | null>(null);
  const [snoozing, setSnoozing] = useState<Notification | null>(null);
  const [snoozeIntent, setSnoozeIntent] = useState<SnoozeIntent | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [accessError, setAccessError] = useState<Error | null>(null);
  const inbox = useInfiniteQuery({ queryKey: ["notifications", user.id], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => notificationPage(user.id, pageParam, signal), getNextPageParam: page => page.pagination.next_cursor ?? undefined });
  const preferences = useQuery({ queryKey: ["notificationPreferences", user.id], queryFn: ({ signal }) => api("me/notification-preferences", notificationPreferencesSchema, { accountId: user.id, signal }) });
  const updatePreferences = useMutation({
    mutationFn: (command: { value: boolean; etag: string }) => api("me/notification-preferences", notificationPreferencesSchema, { method: "PATCH", accountId: user.id, headers: { "If-Match": command.etag }, body: { in_app_reminders_enabled: command.value } }),
    onSuccess: async result => { client.setQueryData(["notificationPreferences", user.id], result); await client.invalidateQueries({ queryKey: ["reminders", user.id] }); },
    onError: error => { if (protectedReminderError(error)) setAccessError(error); preferences.refetch(); },
  });
  const read = useMutation({
    mutationFn: (item: Notification) => api(`notifications/${item.id}/read`, notificationSchema, { method: "POST", accountId: user.id, body: {} }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications", user.id] }),
    onError: error => { if (protectedReminderError(error)) setAccessError(error); },
  });
  const acknowledge = useMutation({
    mutationFn: (item: Notification) => api(`notifications/${item.id}/acknowledge`, notificationSchema, { method: "POST", accountId: user.id, body: {} }),
    onMutate: () => { setUncertain(true); setNotice(""); },
    onSuccess: async () => { setReview(null); setUncertain(false); setNotice("Reminder acknowledged."); await client.invalidateQueries({ queryKey: ["notifications", user.id] }); await client.invalidateQueries({ queryKey: ["reminders", user.id] }); },
    onError: error => {
      if (protectedReminderError(error)) setAccessError(error);
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) setUncertain(false);
    },
  });
  useReminderAccountGuard(accessError ?? inbox.error ?? preferences.error);
  const snooze = useMutation({
    mutationFn: snoozeNotification,
    onSuccess: async result => {
      setSnoozing(null); setSnoozeIntent(null);
      setNotice(result.snoozed_until ? `Snoozed until ${displayInstant(result.snoozed_until, user.timezone)}.` : "Reminder snoozed.");
      await client.invalidateQueries({ queryKey: ["notifications", user.id] });
      await client.invalidateQueries({ queryKey: ["reminders", user.id] });
    },
    onError: error => {
      if (protectedReminderError(error)) setAccessError(error);
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) { setSnoozeIntent(null); void inbox.refetch(); }
    },
  });
  useEffect(() => {
    if (!snoozeIntent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [snoozeIntent]);
  const busy = !!review || !!snoozing;
  const blocked = !!accessError || protectedReminderError(inbox.error) || protectedReminderError(preferences.error);
  const rows = [...new Map(inbox.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];
  return <Shell account><main className={styles.main}>
    <nav className={styles.nav} aria-label="Workspace"><Link href="/app/tasks">Tasks</Link><Link href="/app/reminders"><CalendarClock size={18} />Reminders</Link><span aria-current="page"><Bell size={18} />Inbox</span></nav>
    <div className={styles.heading}><div><span className="section-kicker">PERSONAL NOTIFICATIONS</span><h1>Inbox</h1></div><span className={styles.channel}>In-app only</span></div>
    {blocked ? <p className="message error" role="alert">{accessError?.message ?? inbox.error?.message ?? preferences.error?.message}<Link href="/app/tasks">Return to tasks</Link></p> : <>
      {notice && <p className="message success" role="status"><Check size={18} />{notice}</p>}
      <DueNowPanel user={user} onDenied={setAccessError} />
      <div className={styles.workspace}>
        <section aria-labelledby="inbox-list-title"><div className={styles.sectionHeading}><h2 id="inbox-list-title">Task reminders {inbox.data && <span className={styles.count}>{inbox.data.pages[0]?.unreadCount ?? 0} unread</span>}</h2><button className="icon-button" aria-label="Refresh inbox" title="Refresh inbox" disabled={inbox.isFetching || !!review} onClick={() => inbox.refetch()}><RefreshCw size={18} className={inbox.isFetching ? "spin" : ""} /></button></div>
          {inbox.isPending && <p role="status">Loading notifications...</p>}
          {inbox.isError && <p className="message error" role="alert">{inbox.error.message}</p>}
          {read.isError && <p className="message error" role="alert">{read.error.message}</p>}
          {!inbox.isPending && !inbox.isError && rows.length === 0 && <p className={styles.empty}>No notifications yet.</p>}
          {!inbox.isError && <ul className={styles.list}>{rows.map(item => <li key={item.id}>
            <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{item.read_at ? "Read" : "Unread"}</span></div>
            <time dateTime={item.scheduled_at}>{displayInstant(item.scheduled_at, user.timezone)}</time>
            <p className={styles.reason}>Available in inbox {displayInstant(item.created_at, user.timezone)}</p>
            {item.acknowledged_at && <span className={styles.ack}><CheckCheck size={16} />Acknowledged</span>}
            {item.snoozed_until && <p className={styles.reason}><AlarmClock size={15} aria-hidden /> Snoozed until {displayInstant(item.snoozed_until, user.timezone)}</p>}
            {!!item.snooze_count && <p className={styles.reason}>Snoozed reminder {item.snooze_count} of 3</p>}
            <div className={styles.actions}><Link href={`/app/tasks?space_id=${item.space_id}`}>Open task Space</Link>{!item.read_at && <button className="text-button" disabled={read.isPending || busy} onClick={() => read.mutate(item)}><Check size={16} />Mark read</button>}{item.can_snooze && <button className="secondary-button" aria-label={`Snooze reminder: ${item.task_title}`} disabled={busy} onClick={() => { snooze.reset(); setSnoozeIntent(null); setSnoozing(item); }}><AlarmClock size={17} />Snooze</button>}{!item.acknowledged_at && <button className="secondary-button" disabled={busy} onClick={() => { acknowledge.reset(); setReview(item); }}><CheckCheck size={17} />Acknowledge</button>}</div>
          </li>)}</ul>}
          {inbox.hasNextPage && <button className="text-button" disabled={inbox.isFetching || busy} onClick={() => inbox.fetchNextPage()}>Load more notifications</button>}
        </section>
        <section className={styles.editor} aria-labelledby="preference-title"><h2 id="preference-title">Preferences</h2>
          {preferences.isPending && <p role="status">Loading preferences...</p>}
          {preferences.isError && <p className="message error" role="alert">{preferences.error.message}</p>}
          {preferences.data && <label className={styles.toggle}><input type="checkbox" checked={preferences.data.data.in_app_reminders_enabled} disabled={updatePreferences.isPending || !preferences.data.etag} onChange={event => { if (preferences.data.etag) updatePreferences.mutate({ value: event.target.checked, etag: preferences.data.etag }); }} /><span>In-app task reminders</span></label>}
          <p className={styles.disclosure}>Turning reminders off withdraws pending schedules. Turning them back on does not restore those schedules.</p>
          {updatePreferences.isPending && <p role="status">Saving preference...</p>}
          {updatePreferences.isError && <p className="message error" role="alert">{updatePreferences.error.message}</p>}
          <BrowserAlerts user={user} />
          <QuietHoursSettings user={user} onDenied={setAccessError} />
        </section>
      </div>
    </>}
    {review && !blocked && <ReminderDialog title="Acknowledge this reminder?" locked={acknowledge.isPending || uncertain} onClose={() => setReview(null)}>
      <p className={styles.reviewTitle}>{review.task_title}</p><p className={styles.disclosure}>This records your acknowledgment. The task stays unchanged.</p>
      {acknowledge.isError && <p className="message error" role="alert">{acknowledge.error.message}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={acknowledge.isPending || uncertain} onClick={() => setReview(null)}>Not now</button><button className="primary-button" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(review)}><CheckCheck size={17} />{uncertain && acknowledge.isError ? "Retry acknowledgment" : "Acknowledge reminder"}</button></div>
    </ReminderDialog>}
    {snoozing && !blocked && <SnoozeDialog item={snoozing} timezone={user.timezone} intent={snoozeIntent} pending={snooze.isPending} error={snooze.isError ? snooze.error.message : ""} onClose={() => setSnoozing(null)} onSnooze={minutes => {
      const command = snoozeIntent ?? { accountId: user.id, notification: snoozing, minutes, key: crypto.randomUUID() };
      setSnoozeIntent(command); snooze.mutate(command);
    }} />}
  </main></Shell>;
}

function BrowserAlerts({ user }: { user: Account }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [problem, setProblem] = useState("");
  // Read after mounting: the server render knows neither the browser's permission nor its stored choice.
  useEffect(() => {
    setSupported(typeof window.Notification === "function");
    setEnabled(browserAlertsEnabled(user.id));
  }, [user.id]);
  if (!supported) return null;
  async function change(on: boolean) {
    setProblem("");
    if (!on) { setBrowserAlertsEnabled(user.id, false); setEnabled(false); return; }
    // The switch moves at once and moves back if the browser refuses. Asked only from this switch, never when the page opens.
    setEnabled(true);
    const permission = window.Notification.permission === "granted" ? "granted" : await window.Notification.requestPermission();
    const allowed = permission === "granted" && setBrowserAlertsEnabled(user.id, true);
    if (!allowed) { setBrowserAlertsEnabled(user.id, false); setProblem("Your browser did not allow alerts. Alerts are off."); }
    setEnabled(allowed);
  }
  return <>
    <label className={styles.toggle}><input type="checkbox" role="switch" checked={enabled} onChange={event => void change(event.target.checked)} /><span>Browser alerts for new reminders</span></label>
    <p className={styles.disclosure}>While the app is open in a background tab, your browser shows an alert with the task name when a reminder arrives.</p>
    {problem && <p className="message error" role="alert">{problem}</p>}
  </>;
}

function SnoozeDialog({ item, timezone, intent, pending, error, onClose, onSnooze }: {
  item: Notification; timezone: string; intent: SnoozeIntent | null; pending: boolean; error: string; onClose: () => void; onSnooze: (minutes: SnoozeMinutes) => void;
}) {
  const fieldId = useId();
  const [minutes, setMinutes] = useState<SnoozeMinutes | null>(intent?.minutes ?? null);
  const [now] = useState(() => Date.now());
  const until = (value: SnoozeMinutes) => Math.ceil((now + value * 60000) / 60000) * 60000;
  const allowed = (value: SnoozeMinutes) => !item.snooze_before || until(value) < Date.parse(item.snooze_before);
  const locked = pending || intent !== null;
  return <ReminderDialog title="Snooze this reminder?" locked={locked} onClose={onClose}>
    <p className={styles.reviewTitle}>{item.task_title}</p>
    <fieldset className={styles.options} disabled={locked}><legend>Remind me again in</legend>{snoozeChoices.map(choice => <label className={styles.option} key={choice.minutes}>
      <input type="radio" name={`${fieldId}-snooze`} checked={minutes === choice.minutes} disabled={!allowed(choice.minutes)} onChange={() => setMinutes(choice.minutes)} />
      <span><strong>{choice.label}</strong><small>{allowed(choice.minutes) ? `About ${displayInstant(new Date(until(choice.minutes)).toISOString(), timezone)}` : "After this reminder repeats"}</small></span>
    </label>)}</fieldset>
    <p className={styles.disclosure}>Snoozing marks this read. It comes back as a new inbox item at that time, in the app only. A reminder can be snoozed at most three times; the task stays unchanged.</p>
    {error && <p className="message error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="secondary-button" disabled={locked} onClick={onClose}>Not now</button><button className="primary-button" disabled={pending || (!intent && minutes === null)} onClick={() => { const value = intent?.minutes ?? minutes; if (value) onSnooze(value); }}>{pending ? <LoaderCircle size={17} className="spin" /> : <AlarmClock size={17} />}{intent && !pending ? "Retry original snooze" : "Snooze"}</button></div>
  </ReminderDialog>;
}