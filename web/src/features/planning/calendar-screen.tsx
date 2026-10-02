"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Bell, CalendarClock, CalendarDays, ClipboardList, Download, LoaderCircle, RefreshCw, Repeat, UsersRound } from "lucide-react";

import { api, ApiError, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { spacesSchema } from "@/features/spaces/client";
import { adjacentMonth, calendarFile, calendarPage, calendarRange, compareCalendarEntries, dateInZone } from "./calendar-client";
import type { CalendarEntry } from "./calendar-client";
import styles from "./calendar.module.css";

const calendarStatusTexts = {
  open: "tasks.calendarStatusOpen", in_progress: "tasks.calendarStatusInProgress", completed: "tasks.calendarStatusCompleted", cancelled: "tasks.calendarStatusCancelled",
  scheduled: "tasks.calendarStatusScheduled", available: "tasks.calendarInbox", planned: "tasks.calendarPlanned", suppressed: "tasks.calendarStatusSuppressed", expired: "tasks.calendarStatusExpired", failed: "tasks.calendarStatusFailed",
} as const;

function useCalendarAccountGuard(error: Error | null) {
  const cache = useQueryClient();
  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED")) {
      cache.clear();
      window.location.replace(error.status === 401 ? "/login" : "/app/calendar");
    }
  }, [error, cache]);
}

export function CalendarScreen({ initialSpaceId = "" }: { initialSpaceId?: string }) {
  const t = useText();
  const account = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useCalendarAccountGuard(account.error);
  if (account.isPending) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("tasks.calendarLoadingScreen")}</main></Shell>;
  if (account.isError) return <Shell account><main className={styles.main}><h1>{t("tasks.calendarUnavailable")}</h1><p className="message error" role="alert">{account.error.message}</p><button className="secondary-button" onClick={() => account.refetch()}><RefreshCw size={18} aria-hidden />{t("tasks.retry")}</button></main></Shell>;
  return <CalendarWorkspace key={account.data.data.id} user={account.data.data} initialSpaceId={initialSpaceId} />;
}

function CalendarWorkspace({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const t = useText();
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [timezone, setTimezone] = useState(user.timezone);
  const [month, setMonth] = useState(() => dateInZone(new Date(), user.timezone).slice(0, 7));
  const [selectedDate, setSelectedDate] = useState("");
  const spaces = useQuery({ queryKey: ["spaces", user.id], queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }) });
  useCalendarAccountGuard(spaces.error);
  useEffect(() => {
    if (!spaceId && spaces.data?.data[0]) setSpaceId(spaces.data.data[0].id);
  }, [spaceId, spaces.data]);
  const selectedSpace = spaces.data?.data.find(space => space.id === spaceId) ?? (!spaceId ? spaces.data?.data[0] : undefined);
  function changeMonth(value: string) {
    try { calendarRange(value); setMonth(value); setSelectedDate(""); } catch { return; }
  }
  return <Shell account><main className={styles.main}>
    <nav className={styles.navigation} aria-label={t("tasks.workspace")}><Link href="/app/spaces"><UsersRound size={18} aria-hidden />{t("tasks.spaces")}</Link><Link href="/app/tasks"><ClipboardList size={18} aria-hidden />{t("tasks.title")}</Link><span aria-current="page"><CalendarDays size={18} aria-hidden />{t("tasks.calendarTitle")}</span></nav>
    <header className={styles.heading}><h1>{t("tasks.calendarTitle")}</h1><span>{t("tasks.private")}</span></header>
    {spaces.isPending && <p role="status">{t("tasks.calendarLoadingSpaces")}</p>}
    {spaces.isError && <p className="message error" role="alert">{spaces.error.message}<button className="text-button" onClick={() => spaces.refetch()}>{t("tasks.retry")}</button></p>}
    {!spaces.isPending && !spaces.isError && <>
      {spaces.data?.data.length === 0 ? <div className={styles.empty}><CalendarDays size={34} aria-hidden /><h2>{t("tasks.noSpaces")}</h2><Link href="/app/spaces">{t("tasks.openSpaces")}</Link></div> : <>
        <div className={styles.filters}>
          <label><span id="calendar-space-label">{t(selectedSpace?.space_type === "solo" ? "tasks.soloSpace" : "tasks.familySpace")}</span><select aria-labelledby="calendar-space-label" value={selectedSpace?.id ?? spaceId} onChange={event => { setSpaceId(event.target.value); setSelectedDate(""); }}>{!selectedSpace && <option value={spaceId}>{t("tasks.calendarSpaceUnavailable")}</option>}{spaces.data?.data.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
          <label><span id="calendar-zone-label">{t("tasks.calendarTimezone")}</span><select aria-labelledby="calendar-zone-label" value={timezone} onChange={event => setTimezone(event.target.value)}>{[...new Set([timezone, user.timezone, "UTC"])].map(zone => <option key={zone}>{zone}</option>)}</select></label>
        </div>
        <div className={styles.toolbar}>
          <button className="icon-button" aria-label={t("tasks.calendarPrevious")} title={t("tasks.calendarPrevious")} disabled={month === "1900-01"} onClick={() => changeMonth(adjacentMonth(month, -1))}><ArrowLeft size={18} aria-hidden /></button>
          <label className={styles.month}><span className={styles.srOnly}>{t("tasks.calendarMonth")}</span><input aria-label={t("tasks.calendarMonth")} type="month" min="1900-01" max="2100-12" value={month} onChange={event => changeMonth(event.target.value)} /></label>
          <button className="icon-button" aria-label={t("tasks.calendarNext")} title={t("tasks.calendarNext")} disabled={month === "2100-12"} onClick={() => changeMonth(adjacentMonth(month, 1))}><ArrowRight size={18} aria-hidden /></button>
          <button className="secondary-button" onClick={() => { changeMonth(dateInZone(new Date(), timezone).slice(0, 7)); setSelectedDate(dateInZone(new Date(), timezone)); }}>{t("tasks.calendarToday")}</button>
        </div>
        {selectedSpace ? <CalendarAgenda key={`${selectedSpace.id}:${month}:${timezone}`} accountId={user.id} spaceId={selectedSpace.id} month={month} timezone={timezone} selectedDate={selectedDate} onDate={setSelectedDate} /> : <p className="message error" role="alert">{t("tasks.spaceUnavailable")}</p>}
      </>}
    </>}
  </main></Shell>;
}

function CalendarAgenda({ accountId, spaceId, month, timezone, selectedDate, onDate }: {
  accountId: string; spaceId: string; month: string; timezone: string; selectedDate: string; onDate: (value: string) => void;
}) {
  const t = useText();
  const { language } = useLanguage();
  const calendar = useInfiniteQuery({
    queryKey: ["calendar", accountId, spaceId, month, timezone], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => calendarPage(accountId, spaceId, month, timezone, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
    retry: false, networkMode: "always", refetchOnMount: "always", gcTime: 0,
  });
  useCalendarAccountGuard(calendar.error);
  const days = Number(calendarRange(month).end.slice(-2));
  const firstDay = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const today = dateInZone(new Date(), timezone);
  const entries = [...new Map(calendar.data?.pages.flatMap(page => page.data).map(entry => [`${entry.kind}:${entry.id}`, entry] as const) ?? []).values()].sort(compareCalendarEntries);
  const visible = entries.filter(entry => !selectedDate || entry.date === selectedDate);
  const loading = calendar.isFetching && !calendar.isFetchingNextPage;
  const unavailable = calendar.error instanceof ApiError && [401, 403, 404].includes(calendar.error.status);
  function download() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([calendarFile(entries)], { type: "text/calendar;charset=utf-8" }));
    link.download = `calendar-${month}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }
  return <div className={styles.workspace}>
    <section className={styles.monthGrid} aria-label={t("tasks.calendarDates")}>
      <div className={styles.weekdays} aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <span key={day}>{language === "en" ? day : new Intl.DateTimeFormat(`${language}-IN`, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 8, 20 + index)))}</span>)}</div>
      <div className={styles.dates}>
        {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = `${month}-${String(index + 1).padStart(2, "0")}`;
          return <button key={day} type="button" aria-label={formatDay(day, language)} aria-pressed={selectedDate === day} aria-current={day === today ? "date" : undefined} onClick={() => onDate(selectedDate === day ? "" : day)}>{index + 1}</button>;
        })}
      </div>
      <button className="text-button" disabled={!selectedDate} onClick={() => onDate("")}>{t("tasks.calendarAllDates")}</button>
    </section>
    <section className={styles.agenda} aria-labelledby="agenda-title">
      <div className={styles.agendaHeading}><h2 id="agenda-title">{selectedDate ? formatDay(selectedDate, language) : t("tasks.calendarAgenda")}</h2><button className="icon-button" title={t("tasks.calendarRefresh")} aria-label={t("tasks.calendarRefresh")} disabled={calendar.isFetching} onClick={() => calendar.refetch()}><RefreshCw size={18} className={calendar.isFetching ? "spin" : ""} aria-hidden /></button></div>
      {loading && <p role="status" aria-busy="true">{t("tasks.calendarLoadingList")}</p>}
      {calendar.isError && <div className="message error" role="alert">{calendar.error.message}{unavailable ? <Link href="/app/spaces">{t("tasks.returnSpaces")}</Link> : <button className="text-button" onClick={() => calendar.refetch()}>{t("tasks.retry")}</button>}</div>}
      {!loading && !calendar.isError && <>
        {visible.length === 0 && <p className={styles.empty}>{t(calendar.hasNextPage ? "tasks.calendarNoLoadedDates" : "tasks.calendarEmpty")}</p>}
        <ul className={styles.entries}>{visible.map(entry => <CalendarRow key={`${entry.kind}:${entry.id}`} entry={entry} timezone={timezone} />)}</ul>
        {calendar.hasNextPage && <button className="secondary-button" disabled={calendar.isFetching} onClick={() => calendar.fetchNextPage()}>{calendar.isFetchingNextPage ? <LoaderCircle size={17} className="spin" aria-hidden /> : <CalendarDays size={17} aria-hidden />}{t("tasks.calendarMore")}</button>}
        {entries.length > 0 && <div className={styles.fileCopy}>
          <button className="secondary-button" onClick={download}><Download size={17} aria-hidden />Download calendar file</button>
          <p>{calendar.hasNextPage ? "A copy of the entries loaded so far" : "A copy of this month's entries"}, for another calendar app. It does not update when things change here.</p>
        </div>}
      </>}
    </section>
  </div>;
}

function formatDay(date: string, language: "en" | "te" | "hi" = "en") {
  return new Intl.DateTimeFormat(language === "en" ? "en" : `${language}-IN`, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

function CalendarRow({ entry, timezone }: { entry: CalendarEntry; timezone: string }) {
  const t = useText();
  const { language } = useLanguage();
  const rowLanguage = entry.kind === "event" ? "en" : language;
  const isTask = entry.kind === "task";
  const Icon = isTask ? ClipboardList : entry.kind === "planned" ? Repeat : entry.kind === "event" ? CalendarClock : Bell;
  const status = entry.kind === "event" ? entry.status.replaceAll("_", " ") : t(calendarStatusTexts[entry.status]);
  const source = entry.kind === "event" ? `Event in ${entry.timezone}` : isTask ? "" : t(entry.series_id
    ? entry.source_changed ? "tasks.calendarRepeatingChangedZone" : "tasks.calendarRepeatingZone"
    : entry.source_changed ? "tasks.calendarScheduledChangedZone" : "tasks.calendarScheduledZone", { timezone: entry.timezone });
  const link = isTask ? { href: `/app/tasks?space_id=${entry.space_id}`, label: t("tasks.calendarTasks") }
    : entry.kind === "event" ? { href: `/app/events?space_id=${entry.space_id}`, label: "Space events" }
    : { href: `/app/reminders?task_id=${entry.task_id}`, label: t("tasks.calendarReminders") };
  return <li className={styles.entry} data-kind={entry.kind}>
    <div className={styles.entryTitle}><Icon size={19} aria-hidden /><h3>{entry.title}</h3><span className={styles.status}>{status}</span></div>
    <p className={styles.date}>{formatDay(entry.date, rowLanguage)} <span>{isTask ? t("tasks.dueDate") : new Intl.DateTimeFormat(rowLanguage === "en" ? "en" : `${rowLanguage}-IN`, { timeZone: timezone, hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(entry.scheduled_at))}</span></p>
    {!isTask && <p className={styles.sourceZone}>{source}</p>}
    <Link className={styles.sourceLink} href={link.href}><Icon size={16} aria-hidden />{link.label}</Link>
  </li>;
}