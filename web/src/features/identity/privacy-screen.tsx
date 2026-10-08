"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Brain, Clock3, Download, ListFilter, LoaderCircle, RefreshCw, ShieldCheck, Undo2 } from "lucide-react";
import { z } from "zod";
import { Account, ApiError, api, eventSchema, userSchema } from "./client";
import { eventLabel } from "./account-screen";
import { Shell } from "./shell";
import { useHydrated } from "@/features/platform/use-hydrated";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { Language } from "@/features/i18n/messages";
import { forgetMemory, readMemories } from "@/features/agents/client";
import { readInterests, saveInterests } from "@/features/community/client";
import { notificationPreferencesSchema, reminderPage, reminderRequestPage, reminderSchema } from "@/features/scheduling/client";
import type { Reminder, ReminderRequest } from "@/features/scheduling/client";
import styles from "./privacy.module.css";

// Each permission stays where it is kept and is taken back through its own operation; this page grants nothing (DEC-034).
type TakeBack =
  | { kind: "request"; name: string; reminderId: string }
  | { kind: "inApp"; name: string; etag: string }
  | { kind: "memory"; name: string; memoryId: string }
  | { kind: "interests"; name: string; etag: string };

const MAX_PAGES = 10;

/** Accepted requests whose reminder is still to come: the reminders other members may still send. */
export async function standingRequests(accountId: string, signal?: AbortSignal) {
  const accepted: ReminderRequest[] = [];
  let cursor: string | null = null;
  let hasMoreRequests = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await reminderRequestPage(accountId, "received", cursor, signal);
    accepted.push(...result.data.filter(item => item.status === "accepted" && item.reminder_id));
    cursor = result.pagination.next_cursor;
    hasMoreRequests = result.pagination.has_more;
    if (!result.pagination.has_more || !cursor) break;
  }
  const wanted = new Set(accepted.map(item => item.reminder_id));
  const reminders = new Map<string, Reminder>();
  let hasMoreReminders = false;
  cursor = null;
  for (let page = 0; page < MAX_PAGES && reminders.size < wanted.size; page += 1) {
    const result = await reminderPage(accountId, undefined, cursor, signal);
    for (const item of result.data) if (wanted.has(item.id)) reminders.set(item.id, item);
    cursor = result.pagination.next_cursor;
    hasMoreReminders = result.pagination.has_more;
    if (!result.pagination.has_more || !cursor) break;
  }
  return {
    items: accepted.filter(item => reminders.get(item.reminder_id!)?.status === "scheduled"),
    incomplete: hasMoreRequests || (hasMoreReminders && reminders.size < wanted.size),
  };
}

export function PrivacyScreen() {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  const hydrated = useHydrated();
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) window.location.replace("/login");
  }, [profile.error]);
  if (!hydrated || profile.isPending) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" />{t("privacy.loading")}</main></Shell>;
  if (!profile.data) return <Shell account><main className="auth-main"><h1>{t("privacy.title")}</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />{t("privacy.retry")}</button></main></Shell>;
  return <PrivacyDetails key={profile.data.data.id} user={profile.data.data} />;
}

function PrivacyDetails({ user }: { user: Account }) {
  const t = useText();
  const { language } = useLanguage();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<TakeBack | null>(null);
  const [notice, setNotice] = useState("");
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const requests = useQuery({ queryKey: ["privacy", "requests", user.id], queryFn: ({ signal }) => standingRequests(user.id, signal) });
  const requestResult = requests.isError ? undefined : requests.data;
  const requestReviewIsStale = confirm?.kind === "request"
    && !requestResult?.items.some(item => item.reminder_id === confirm.reminderId && item.task_title === confirm.name);
  const review = requestReviewIsStale ? null : confirm;
  useEffect(() => { if (review) { confirmRef.current?.scrollIntoView({ block: "nearest" }); confirmRef.current?.focus(); } }, [review]);
  useEffect(() => {
    if (requestReviewIsStale) setConfirm(item => item?.kind === "request" ? null : item);
  }, [requestReviewIsStale]);
  const preferences = useQuery({ queryKey: ["notificationPreferences", user.id], queryFn: ({ signal }) => api("me/notification-preferences", notificationPreferencesSchema, { accountId: user.id, signal }) });
  const memories = useQuery({ queryKey: ["privacy", "memories", user.id], queryFn: ({ signal }) => readMemories(user.id, signal) });
  const interests = useQuery({ queryKey: ["privacy", "interests", user.id], queryFn: async ({ signal }) => readInterests(user.id, signal) });
  const activity = useQuery({ queryKey: ["events", user.id], queryFn: ({ signal }) => api("me/security-events", z.array(eventSchema), { accountId: user.id, signal }) });

  const takeBack = useMutation({
    mutationFn: async (item: TakeBack) => {
      if (item.kind === "request") {
        const cancelledReminder = reminderSchema.refine(record => record.id.toLowerCase() === item.reminderId.toLowerCase()
          && record.status === "cancelled");
        await api(`reminders/${item.reminderId}/cancel`, cancelledReminder, { method: "POST", accountId: user.id, body: {} });
      }
      else if (item.kind === "inApp") {
        await api("me/notification-preferences", notificationPreferencesSchema, { method: "PATCH", accountId: user.id, headers: { "If-Match": item.etag }, body: { in_app_reminders_enabled: false } });
      } else if (item.kind === "memory") await forgetMemory(user.id, item.memoryId);
      else await saveInterests(user.id, { etag: item.etag }, { topics: [], interests: [], languages: [], places: [] });
    },
    onSuccess: async () => { setConfirm(null); setNotice(t("privacy.done")); },
    onSettled: async () => {
      // Every list is read again, so the page shows what is kept now, also after a refusal.
      await Promise.all([
        client.invalidateQueries({ queryKey: ["privacy"] }), client.invalidateQueries({ queryKey: ["notificationPreferences", user.id] }),
        client.invalidateQueries({ queryKey: ["reminders", user.id] }), client.invalidateQueries({ queryKey: ["events", user.id] }),
      ]);
    },
    onError: error => {
      // The open confirmation holds the version it was opened with; a retry starts again from the reloaded list.
      setConfirm(null);
      if (error instanceof ApiError && error.status === 401) window.location.replace("/login");
    },
  });

  const date = (value: string) => formatDate(value, user.timezone, language);
  const interestCount = interests.data ? interests.data.topics.length + interests.data.interests.length + interests.data.languages.length + interests.data.places.length : 0;
  const problem = (query: { isError: boolean; error: Error | null; refetch: () => unknown }) => query.isError
    ? <div className="message error" role="alert">{query.error?.message}<button className="text-button" onClick={() => query.refetch()}>{t("privacy.retry")}</button></div> : null;
  const takeBackButton = (item: TakeBack) => <button className="secondary-button" aria-label={t("privacy.takeBackNamed", { name: item.name })}
    disabled={takeBack.isPending} onClick={() => { setNotice(""); takeBack.reset(); setConfirm(item); }}><Undo2 size={16} aria-hidden />{t("privacy.takeBack")}</button>;

  return <Shell account><main className={`account-main ${styles.main}`}>
    <nav className={`workspace-nav ${styles.nav}`} aria-label={t("account.profile")}><Link className="text-button" href="/app/settings/account">{t("account.account")}</Link><span className="nav-active"><ShieldCheck size={18} aria-hidden />{t("privacy.title")}</span><Link className="text-button" href="/app/settings/data"><Download size={18} aria-hidden />{t("account.yourData")}</Link></nav>
    <header className={styles.heading}><h1>{t("privacy.title")}</h1><p>{t("privacy.subtitle")}</p><p className={styles.note}>{t("privacy.notStored")}</p><p><Link href="/privacy">{t("about.privacyLink")}</Link></p></header>
    {notice && <div className="message success" role="status">{notice}</div>}
    {takeBack.isError && !review && <div className="message error" role="alert">{takeBack.error.message}</div>}
    {review && <div ref={confirmRef} tabIndex={-1} className={styles.confirm} role="group" aria-labelledby="privacy-confirm-title" aria-describedby="privacy-confirm-name">
      <h2 id="privacy-confirm-title">{t("privacy.confirmTitle")}</h2>
      <p id="privacy-confirm-name">{review.name}</p>
      <div className="dialog-actions">
        <button className="secondary-button" disabled={takeBack.isPending} onClick={() => setConfirm(null)}>{t("privacy.keep")}</button>
        <button className="primary-button" disabled={takeBack.isPending} onClick={() => takeBack.mutate(review)}>{takeBack.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Undo2 size={17} aria-hidden />}{t("privacy.confirm")}</button>
      </div>
    </div>}

    <section className={styles.section} aria-labelledby="privacy-requests">
      <h2 id="privacy-requests"><BellRing size={19} aria-hidden />{t("privacy.requests")}</h2>
      {requests.isPending && <p role="status">{t("privacy.loading")}</p>}
      {problem(requests)}
      {requestResult?.incomplete && <>
        <p className="message" role="status">{t("privacy.requestsIncomplete")}</p>
        <Link className="text-button" href="/app/reminders"><BellRing size={17} aria-hidden />{t("privacy.manageReminders")}</Link>
      </>}
      {requestResult?.items.length === 0 && !requestResult.incomplete && <p className={styles.empty}>{t("privacy.none")}</p>}
      <ul className={styles.list}>{requestResult?.items.map(item => <li key={item.id}>
        <div><strong>{t("privacy.requestPurpose", { name: item.requested_by.display_name, task: item.task_title, date: date(item.scheduled_at) })}</strong>
          <span>{t("privacy.requestUses")}</span>{item.resolved_at && <time dateTime={item.resolved_at}>{t("privacy.since", { date: date(item.resolved_at) })}</time>}</div>
        {takeBackButton({ kind: "request", name: item.task_title, reminderId: item.reminder_id! })}
      </li>)}</ul>
    </section>

    <section className={styles.section} aria-labelledby="privacy-in-app">
      <h2 id="privacy-in-app"><BellRing size={19} aria-hidden />{t("privacy.inApp")}</h2>
      {preferences.isPending && <p role="status">{t("privacy.loading")}</p>}
      {problem(preferences)}
      {preferences.data && <ul className={styles.list}><li>
        <div><strong>{t(preferences.data.data.in_app_reminders_enabled ? "privacy.inAppOn" : "privacy.inAppOff")}</strong>{preferences.data.data.in_app_reminders_enabled && <span>{t("privacy.inAppUses")}</span>}</div>
        {preferences.data.data.in_app_reminders_enabled && preferences.data.etag && takeBackButton({ kind: "inApp", name: t("privacy.inApp"), etag: preferences.data.etag })}
      </li></ul>}
    </section>

    <section className={styles.section} aria-labelledby="privacy-memories">
      <h2 id="privacy-memories"><Brain size={19} aria-hidden />{t("privacy.memories")}</h2>
      {memories.isPending && <p role="status">{t("privacy.loading")}</p>}
      {problem(memories)}
      {memories.data?.length === 0 && <p className={styles.empty}>{t("privacy.none")}</p>}
      {Boolean(memories.data?.length) && <p className={styles.note}>{t("privacy.memoryUses")}</p>}
      <ul className={styles.list}>{memories.data?.map(item => <li key={item.id}>
        <div><strong>{item.content}</strong><time dateTime={item.created_at}>{t("privacy.since", { date: date(item.created_at) })}</time></div>
        {takeBackButton({ kind: "memory", name: item.content, memoryId: item.id })}
      </li>)}</ul>
    </section>

    <section className={styles.section} aria-labelledby="privacy-interests">
      <h2 id="privacy-interests"><ListFilter size={19} aria-hidden />{t("privacy.interests")}</h2>
      {interests.isPending && <p role="status">{t("privacy.loading")}</p>}
      {problem(interests)}
      {interests.data && interestCount === 0 && <p className={styles.empty}>{t("privacy.none")}</p>}
      {interests.data && interestCount > 0 && <ul className={styles.list}><li>
        <div><strong>{t("privacy.interestsCount", { count: interestCount })}</strong><span>{t("privacy.interestsUses")}</span><Link href="/app/settings/interests">{t("privacy.manageInterests")}</Link></div>
        {takeBackButton({ kind: "interests", name: t("privacy.interests"), etag: interests.data.etag })}
      </li></ul>}
    </section>

    <section className={styles.section} aria-labelledby="privacy-activity">
      <h2 id="privacy-activity"><Clock3 size={19} aria-hidden />{t("privacy.activity")}</h2>
      <p className={styles.note}>{t("privacy.activityNote")}</p>
      {activity.isPending && <p role="status">{t("privacy.loading")}</p>}
      {problem(activity)}
      <ul className={styles.activity}>{activity.data?.data.slice(0, 20).map(event => <li key={event.id}><span>{t(eventLabel(event.action))}</span><time dateTime={event.created_at}>{date(event.created_at)}</time></li>)}</ul>
      <Link className="text-button" href="/app/settings/data"><Download size={17} aria-hidden />{t("privacy.yourData")}</Link>
    </section>
  </main></Shell>;
}

function formatDate(value: string, timezone: string, language: Language) {
  return new Intl.DateTimeFormat(language === "en" ? "en" : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
