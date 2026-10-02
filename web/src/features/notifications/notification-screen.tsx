"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, CalendarClock, Check, CheckCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { browserAlertsEnabled, setBrowserAlertsEnabled } from "@/features/realtime/live";
import { notificationPage, notificationPreferencesSchema, notificationSchema, snoozeChoices, snoozeNotification } from "@/features/scheduling/client";
import type { Notification, SnoozeIntent, SnoozeMinutes } from "@/features/scheduling/client";
import { displayInstant, protectedReminderError, ReminderDialog, useReminderAccountGuard } from "@/features/scheduling/reminder-screen";
import styles from "@/features/scheduling/reminders.module.css";
import { DueNowPanel, QuietHoursSettings } from "./alerts";

export function NotificationScreen() {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useReminderAccountGuard(profile.error);
  if (profile.isPending) return <Shell account><main className="account-loading"><LoaderCircle className="spin" />{t("inbox.loading")}</main></Shell>;
  if (profile.isError || !profile.data) return <Shell account><main className={styles.main}><h1>{t("inbox.unavailable")}</h1><p className="message error" role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} />{t("inbox.retry")}</button></main></Shell>;
  return <Inbox key={profile.data.data.id} user={profile.data.data} />;
}

function Inbox({ user }: { user: Account }) {
  const t = useText();
  const { language } = useLanguage();
  const client = useQueryClient();
  const [review, setReview] = useState<Notification | null>(null);
  const [snoozing, setSnoozing] = useState<Notification | null>(null);
  const [snoozeIntent, setSnoozeIntent] = useState<SnoozeIntent | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState<{ id: "inbox.acknowledgedNotice" | "inbox.snoozedNotice" | "inbox.snoozedUntilNotice"; date?: string } | null>(null);
  const [accessError, setAccessError] = useState<Error | null>(null);
  const inbox = useInfiniteQuery({ queryKey: ["notifications", user.id], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => notificationPage(user.id, pageParam, signal), getNextPageParam: page => page.pagination.next_cursor ?? undefined });
  const preferences = useQuery({ queryKey: ["notificationPreferences", user.id], queryFn: ({ signal }) => api("me/notification-preferences", notificationPreferencesSchema, { accountId: user.id, signal }) });
  const updatePreferences = useMutation({
    mutationFn: (command: { value: boolean; etag: string }) => api("me/notification-preferences", notificationPreferencesSchema, { method: "PATCH", accountId: user.id, headers: { "If-Match": command.etag }, body: { in_app_reminders_enabled: command.value } }),
    onSuccess: async result => {
      // A read that started before the save would otherwise land afterwards and switch the setting back.
      await client.cancelQueries({ queryKey: ["notificationPreferences", user.id] });
      client.setQueryData(["notificationPreferences", user.id], result);
      await client.invalidateQueries({ queryKey: ["reminders", user.id] });
    },
    onError: error => { if (protectedReminderError(error)) setAccessError(error); preferences.refetch(); },
  });
  const read = useMutation({
    mutationFn: (item: Notification) => api(`notifications/${item.id}/read`, notificationSchema, { method: "POST", accountId: user.id, body: {} }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications", user.id] }),
    onError: error => { if (protectedReminderError(error)) setAccessError(error); },
  });
  const acknowledge = useMutation({
    mutationFn: (item: Notification) => api(`notifications/${item.id}/acknowledge`, notificationSchema, { method: "POST", accountId: user.id, body: {} }),
    onMutate: () => { setUncertain(true); setNotice(null); },
    onSuccess: async () => { setReview(null); setUncertain(false); setNotice({ id: "inbox.acknowledgedNotice" }); await client.invalidateQueries({ queryKey: ["notifications", user.id] }); await client.invalidateQueries({ queryKey: ["reminders", user.id] }); },
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
      setNotice(result.snoozed_until ? { id: "inbox.snoozedUntilNotice", date: result.snoozed_until } : { id: "inbox.snoozedNotice" });
      await client.invalidateQueries({ queryKey: ["notifications", user.id] });
      await client.invalidateQueries({ queryKey: ["reminders", user.id] });
    },
    onError: error => {
      if (protectedReminderError(error)) setAccessError(error);
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) { setSnoozing(null); setSnoozeIntent(null); void inbox.refetch(); }
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
    <nav className={styles.nav} aria-label={t("inbox.workspace")}><Link href="/app/tasks">{t("inbox.tasks")}</Link><Link href="/app/reminders"><CalendarClock size={18} />{t("inbox.reminders")}</Link><span aria-current="page"><Bell size={18} />{t("inbox.title")}</span></nav>
    <div className={styles.heading}><div><span className="section-kicker">{t("inbox.kicker")}</span><h1>{t("inbox.title")}</h1></div><span className={styles.channel}>{t("inbox.inApp")}</span></div>
    {blocked ? <p className="message error" role="alert">{accessError?.message ?? inbox.error?.message ?? preferences.error?.message}<Link href="/app/tasks">{t("inbox.returnTasks")}</Link></p> : <>
      {notice && <p className="message success" role="status"><Check size={18} />{t(notice.id, notice.date ? { date: displayInstant(notice.date, user.timezone, language) } : undefined)}</p>}
      <DueNowPanel user={user} onDenied={setAccessError} />
      <div className={styles.workspace}>
        <section aria-labelledby="inbox-list-title"><div className={styles.sectionHeading}><h2 id="inbox-list-title">{t("inbox.taskReminders")} {inbox.data && <span className={styles.count}>{t("inbox.unread", { count: inbox.data.pages[0]?.unreadCount ?? 0 })}</span>}</h2><button className="icon-button" aria-label={t("inbox.refresh")} title={t("inbox.refresh")} disabled={inbox.isFetching || !!review} onClick={() => inbox.refetch()}><RefreshCw size={18} className={inbox.isFetching ? "spin" : ""} /></button></div>
          {inbox.isPending && <p role="status">{t("inbox.loadingNotifications")}</p>}
          {inbox.isError && <p className="message error" role="alert">{inbox.error.message}</p>}
          {read.isError && <p className="message error" role="alert">{read.error.message}</p>}
          {snooze.isError && !snoozing && <p className="message error" role="alert">{snooze.error.message}</p>}
          {!inbox.isPending && !inbox.isError && rows.length === 0 && <p className={styles.empty}>{t("inbox.empty")}</p>}
          {!inbox.isError && <ul className={styles.list}>{rows.map(item => <li key={item.id}>
            <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{t(item.read_at ? "inbox.read" : "inbox.unreadStatus")}</span></div>
            <time dateTime={item.scheduled_at}>{displayInstant(item.scheduled_at, user.timezone, language)}</time>
            <p className={styles.reason}>{t("inbox.availableAt", { date: displayInstant(item.created_at, user.timezone, language) })}</p>
            {item.acknowledged_at && <span className={styles.ack}><CheckCheck size={16} />{t("inbox.acknowledged")}</span>}
            {item.snoozed_until && <p className={styles.reason}><AlarmClock size={15} aria-hidden /> {t("inbox.snoozedUntil", { date: displayInstant(item.snoozed_until, user.timezone, language) })}</p>}
            {!!item.snooze_count && <p className={styles.reason}>{t("inbox.snoozedCount", { count: item.snooze_count })}</p>}
            <div className={styles.actions}><Link href={`/app/tasks?space_id=${item.space_id}`}>{t("inbox.openSpace")}</Link>{!item.read_at && <button className="text-button" disabled={read.isPending || busy} onClick={() => read.mutate(item)}><Check size={16} />{t("inbox.markRead")}</button>}{item.can_snooze && <button className="secondary-button" aria-label={t("inbox.snoozeLabel", { title: item.task_title })} disabled={busy} onClick={() => { snooze.reset(); setSnoozeIntent(null); setSnoozing(item); }}><AlarmClock size={17} />{t("inbox.snooze")}</button>}{!item.acknowledged_at && <button className="secondary-button" disabled={busy} onClick={() => { acknowledge.reset(); setReview(item); }}><CheckCheck size={17} />{t("inbox.acknowledge")}</button>}</div>
          </li>)}</ul>}
          {inbox.hasNextPage && <button className="text-button" disabled={inbox.isFetching || busy} onClick={() => inbox.fetchNextPage()}>{t("inbox.more")}</button>}
        </section>
        <section className={styles.editor} aria-labelledby="preference-title"><h2 id="preference-title">{t("inbox.preferences")}</h2>
          {preferences.isPending && <p role="status">{t("inbox.loadingPreferences")}</p>}
          {preferences.isError && <p className="message error" role="alert">{preferences.error.message}</p>}
          {preferences.data && <label className={styles.toggle}><input type="checkbox" checked={preferences.data.data.in_app_reminders_enabled} disabled={updatePreferences.isPending || !preferences.data.etag} onChange={event => { if (preferences.data.etag) updatePreferences.mutate({ value: event.target.checked, etag: preferences.data.etag }); }} /><span>{t("inbox.preferenceLabel")}</span></label>}
          <p className={styles.disclosure}>{t("inbox.preferenceDisclosure")}</p>
          {updatePreferences.isPending && <p role="status">{t("inbox.savingPreference")}</p>}
          {updatePreferences.isError && <p className="message error" role="alert">{updatePreferences.error.message}</p>}
          <BrowserAlerts user={user} />
          <QuietHoursSettings user={user} onDenied={setAccessError} />
        </section>
      </div>
    </>}
    {review && !blocked && <ReminderDialog title={t("inbox.acknowledgeTitle")} closeLabel={t("inbox.closeDialog")} locked={acknowledge.isPending || uncertain} onClose={() => setReview(null)}>
      <p className={styles.reviewTitle}>{review.task_title}</p><p className={styles.disclosure}>{t("inbox.acknowledgeDisclosure")}</p>
      {acknowledge.isError && <p className="message error" role="alert">{acknowledge.error.message}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={acknowledge.isPending || uncertain} onClick={() => setReview(null)}>{t("inbox.notNow")}</button><button className="primary-button" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(review)}><CheckCheck size={17} />{t(uncertain && acknowledge.isError ? "inbox.retryAcknowledgment" : "inbox.acknowledgeReminder")}</button></div>
    </ReminderDialog>}
    {snoozing && !blocked && <SnoozeDialog item={snoozing} timezone={user.timezone} intent={snoozeIntent} pending={snooze.isPending} error={snooze.isError ? snooze.error.message : ""} onClose={() => setSnoozing(null)} onSnooze={minutes => {
      const command = snoozeIntent ?? { accountId: user.id, notification: snoozing, minutes, key: crypto.randomUUID() };
      setSnoozeIntent(command); snooze.mutate(command);
    }} />}
  </main></Shell>;
}

function BrowserAlerts({ user }: { user: Account }) {
  const t = useText();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [problem, setProblem] = useState(false);
  // Read after mounting: the server render knows neither the browser's permission nor its stored choice.
  useEffect(() => {
    setSupported(typeof window.Notification === "function");
    setEnabled(browserAlertsEnabled(user.id));
  }, [user.id]);
  if (!supported) return null;
  async function change(on: boolean) {
    setProblem(false);
    if (!on) { setBrowserAlertsEnabled(user.id, false); setEnabled(false); return; }
    // The switch moves at once and moves back if the browser refuses. Asked only from this switch, never when the page opens.
    setEnabled(true);
    const permission = window.Notification.permission === "granted" ? "granted" : await window.Notification.requestPermission();
    const allowed = permission === "granted" && setBrowserAlertsEnabled(user.id, true);
    if (!allowed) { setBrowserAlertsEnabled(user.id, false); setProblem(true); }
    setEnabled(allowed);
  }
  return <>
    <label className={styles.toggle}><input type="checkbox" role="switch" checked={enabled} onChange={event => void change(event.target.checked)} /><span>{t("inbox.browserAlerts")}</span></label>
    <p className={styles.disclosure}>{t("inbox.browserDisclosure")}</p>
    {problem && <p className="message error" role="alert">{t("inbox.browserProblem")}</p>}
  </>;
}

function SnoozeDialog({ item, timezone, intent, pending, error, onClose, onSnooze }: {
  item: Notification; timezone: string; intent: SnoozeIntent | null; pending: boolean; error: string; onClose: () => void; onSnooze: (minutes: SnoozeMinutes) => void;
}) {
  const t = useText();
  const { language } = useLanguage();
  const fieldId = useId();
  const [minutes, setMinutes] = useState<SnoozeMinutes | null>(intent?.minutes ?? null);
  const [now] = useState(() => Date.now());
  const until = (value: SnoozeMinutes) => Math.ceil((now + value * 60000) / 60000) * 60000;
  const allowed = (value: SnoozeMinutes) => !item.snooze_before || until(value) < Date.parse(item.snooze_before);
  const locked = pending || intent !== null;
  return <ReminderDialog title={t("inbox.snoozeTitle")} closeLabel={t("inbox.closeDialog")} locked={locked} onClose={onClose}>
    <p className={styles.reviewTitle}>{item.task_title}</p>
    <fieldset className={styles.options} disabled={locked}><legend>{t("inbox.snoozeAgain")}</legend>{snoozeChoices.map(choice => <label className={styles.option} key={choice.minutes}>
      <input type="radio" name={`${fieldId}-snooze`} checked={minutes === choice.minutes} disabled={!allowed(choice.minutes)} onChange={() => setMinutes(choice.minutes)} />
      <span><strong>{t(`inbox.snooze.${choice.minutes}`)}</strong><small>{allowed(choice.minutes) ? t("inbox.about", { date: displayInstant(new Date(until(choice.minutes)).toISOString(), timezone, language) }) : t("inbox.afterRepeat")}</small></span>
    </label>)}</fieldset>
    <p className={styles.disclosure}>{t("inbox.snoozeDisclosure")}</p>
    {error && <p className="message error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="secondary-button" disabled={locked} onClick={onClose}>{t("inbox.notNow")}</button><button className="primary-button" disabled={pending || (!intent && minutes === null)} onClick={() => { const value = intent?.minutes ?? minutes; if (value) onSnooze(value); }}>{pending ? <LoaderCircle size={17} className="spin" /> : <AlarmClock size={17} />}{t(intent && !pending ? "inbox.retrySnooze" : "inbox.snooze")}</button></div>
  </ReminderDialog>;
}