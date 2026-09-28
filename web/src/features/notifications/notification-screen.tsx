"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, Check, CheckCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { notificationPage, notificationPreferencesSchema, notificationSchema } from "@/features/scheduling/client";
import type { Notification } from "@/features/scheduling/client";
import { displayInstant, protectedReminderError, ReminderDialog, useReminderAccountGuard } from "@/features/scheduling/reminder-screen";
import styles from "@/features/scheduling/reminders.module.css";

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
  const blocked = !!accessError || protectedReminderError(inbox.error) || protectedReminderError(preferences.error);
  const rows = [...new Map(inbox.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];
  return <Shell account><main className={styles.main}>
    <nav className={styles.nav} aria-label="Workspace"><Link href="/app/tasks">Tasks</Link><Link href="/app/reminders"><CalendarClock size={18} />Reminders</Link><span aria-current="page"><Bell size={18} />Inbox</span></nav>
    <div className={styles.heading}><div><span className="section-kicker">PERSONAL NOTIFICATIONS</span><h1>Inbox</h1></div><span className={styles.channel}>In-app only</span></div>
    {blocked ? <p className="message error" role="alert">{accessError?.message ?? inbox.error?.message ?? preferences.error?.message}<Link href="/app/tasks">Return to tasks</Link></p> : <>
      {notice && <p className="message success" role="status"><Check size={18} />{notice}</p>}
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
            <div className={styles.actions}><Link href={`/app/tasks?space_id=${item.space_id}`}>Open task Space</Link>{!item.read_at && <button className="text-button" disabled={read.isPending || !!review} onClick={() => read.mutate(item)}><Check size={16} />Mark read</button>}{!item.acknowledged_at && <button className="secondary-button" disabled={!!review} onClick={() => { acknowledge.reset(); setReview(item); }}><CheckCheck size={17} />Acknowledge</button>}</div>
          </li>)}</ul>}
          {inbox.hasNextPage && <button className="text-button" disabled={inbox.isFetching || !!review} onClick={() => inbox.fetchNextPage()}>Load more notifications</button>}
        </section>
        <section className={styles.editor} aria-labelledby="preference-title"><h2 id="preference-title">Preferences</h2>
          {preferences.isPending && <p role="status">Loading preferences...</p>}
          {preferences.isError && <p className="message error" role="alert">{preferences.error.message}</p>}
          {preferences.data && <label className={styles.toggle}><input type="checkbox" checked={preferences.data.data.in_app_reminders_enabled} disabled={updatePreferences.isPending || !preferences.data.etag} onChange={event => { if (preferences.data.etag) updatePreferences.mutate({ value: event.target.checked, etag: preferences.data.etag }); }} /><span>In-app task reminders</span></label>}
          <p className={styles.disclosure}>Turning reminders off withdraws pending schedules. Turning them back on does not restore those schedules.</p>
          {updatePreferences.isPending && <p role="status">Saving preference...</p>}
          {updatePreferences.isError && <p className="message error" role="alert">{updatePreferences.error.message}</p>}
        </section>
      </div>
    </>}
    {review && !blocked && <ReminderDialog title="Acknowledge this reminder?" locked={acknowledge.isPending || uncertain} onClose={() => setReview(null)}>
      <p className={styles.reviewTitle}>{review.task_title}</p><p className={styles.disclosure}>This records your acknowledgment. The task stays unchanged.</p>
      {acknowledge.isError && <p className="message error" role="alert">{acknowledge.error.message}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={acknowledge.isPending || uncertain} onClick={() => setReview(null)}>Not now</button><button className="primary-button" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(review)}><CheckCheck size={17} />{uncertain && acknowledge.isError ? "Retry acknowledgment" : "Acknowledge reminder"}</button></div>
    </ReminderDialog>}
  </main></Shell>;
}