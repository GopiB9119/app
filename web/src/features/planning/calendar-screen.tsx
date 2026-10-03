"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Bell, CalendarClock, CalendarDays, ClipboardList, Download, LoaderCircle, Lock, RefreshCw, Repeat, UsersRound } from "lucide-react";

import { api, ApiError, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { spacesSchema } from "@/features/spaces/client";
import { adjacentMonth, calendarFile, calendarRange, calendarRangePage, calendarSource, calendarSources, compareCalendarEntries, dateInZone, shiftDate, viewRange } from "./calendar-client";
import type { CalendarEntry, CalendarSource, CalendarView } from "./calendar-client";
import styles from "./calendar.module.css";

const calendarStatusTexts = {
  open: "tasks.calendarStatusOpen", in_progress: "tasks.calendarStatusInProgress", completed: "tasks.calendarStatusCompleted", cancelled: "tasks.calendarStatusCancelled",
  scheduled: "tasks.calendarStatusScheduled", available: "tasks.calendarInbox", planned: "tasks.calendarPlanned", suppressed: "tasks.calendarStatusSuppressed", expired: "tasks.calendarStatusExpired", failed: "tasks.calendarStatusFailed",
} as const;
const viewTexts = { month: "tasks.calendarMonth", week: "tasks.calendarWeek", day: "tasks.calendarDay" } as const;
const stepTexts = {
  month: ["tasks.calendarPrevious", "tasks.calendarNext"], week: ["tasks.calendarPreviousWeek", "tasks.calendarNextWeek"], day: ["tasks.calendarPreviousDay", "tasks.calendarNextDay"],
} as const;
const sourceTexts = { task: "tasks.calendarShowTasks", reminder: "tasks.calendarShowReminders", event: "tasks.calendarShowEvents" } as const;

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
  const [view, setView] = useState<CalendarView>("month");
  const [date, setDate] = useState(() => dateInZone(new Date(), user.timezone));
  const [hidden, setHidden] = useState<ReadonlySet<CalendarSource>>(() => new Set());
  const spaces = useQuery({ queryKey: ["spaces", user.id], queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }) });
  useCalendarAccountGuard(spaces.error);
  useEffect(() => {
    if (!spaceId && spaces.data?.data[0]) setSpaceId(spaces.data.data[0].id);
  }, [spaceId, spaces.data]);
  const selectedSpace = spaces.data?.data.find(space => space.id === spaceId) ?? (!spaceId ? spaces.data?.data[0] : undefined);
  const range = view === "month" ? calendarRange(month) : viewRange(view, date);
  function changeMonth(value: string) {
    try { calendarRange(value); setMonth(value); setSelectedDate(""); } catch { return; }
  }
  function changeDate(value: string) {
    try { viewRange("day", value); setDate(value); } catch { return; }
  }
  function changeView(next: CalendarView) {
    if (next === view) return;
    if (next === "month") changeMonth(date.slice(0, 7));
    else if (view === "month") {
      const today = dateInZone(new Date(), timezone);
      setDate(selectedDate || (today.startsWith(month) ? today : `${month}-01`));
    }
    setView(next);
  }
  function step(offset: number) {
    if (view === "month") changeMonth(adjacentMonth(month, offset));
    else changeDate(shiftDate(date, offset * (view === "week" ? 7 : 1)));
  }
  function toggle(source: CalendarSource) {
    setHidden(current => {
      const next = new Set(current);
      if (!next.delete(source)) next.add(source);
      return next;
    });
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
        <div className={styles.views} role="group" aria-label={t("tasks.calendarView")}>
          {(["month", "week", "day"] as const).map(option => <button key={option} type="button" className="secondary-button" aria-pressed={view === option} onClick={() => changeView(option)}>{t(viewTexts[option])}</button>)}
        </div>
        <div className={styles.toolbar}>
          <button className="icon-button" aria-label={t(stepTexts[view][0])} title={t(stepTexts[view][0])} disabled={range.start <= "1900-01-01"} onClick={() => step(-1)}><ArrowLeft size={18} aria-hidden /></button>
          {view === "month"
            ? <label className={styles.month}><span className={styles.srOnly}>{t("tasks.calendarMonth")}</span><input aria-label={t("tasks.calendarMonth")} type="month" min="1900-01" max="2100-12" value={month} onChange={event => changeMonth(event.target.value)} /></label>
            : <label className={styles.month}><span className={styles.srOnly}>{t("tasks.calendarDate")}</span><input aria-label={t("tasks.calendarDate")} type="date" min="1900-01-01" max="2100-12-31" value={date} onChange={event => changeDate(event.target.value)} /></label>}
          <button className="icon-button" aria-label={t(stepTexts[view][1])} title={t(stepTexts[view][1])} disabled={range.end >= "2100-12-31"} onClick={() => step(1)}><ArrowRight size={18} aria-hidden /></button>
          <button className="secondary-button" onClick={() => {
            const today = dateInZone(new Date(), timezone);
            if (view === "month") { changeMonth(today.slice(0, 7)); setSelectedDate(today); } else changeDate(today);
          }}>{t("tasks.calendarToday")}</button>
        </div>
        <fieldset className={styles.sources}>
          <legend>{t("tasks.calendarShow")}</legend>
          {calendarSources.map(source => <label key={source}><input type="checkbox" checked={!hidden.has(source)} onChange={() => toggle(source)} />{t(sourceTexts[source])}</label>)}
        </fieldset>
        {selectedSpace ? <CalendarAgenda key={`${selectedSpace.id}:${view}:${range.start}:${range.end}:${timezone}`} accountId={user.id} spaceId={selectedSpace.id} solo={selectedSpace.space_type === "solo"} view={view} range={range} timezone={timezone} selectedDate={selectedDate} onDate={setSelectedDate} hidden={hidden} /> : <p className="message error" role="alert">{t("tasks.spaceUnavailable")}</p>}
      </>}
    </>}
  </main></Shell>;
}

function CalendarAgenda({ accountId, spaceId, solo, view, range, timezone, selectedDate, onDate, hidden }: {
  accountId: string; spaceId: string; solo: boolean; view: CalendarView; range: { start: string; end: string }; timezone: string;
  selectedDate: string; onDate: (value: string) => void; hidden: ReadonlySet<CalendarSource>;
}) {
  const t = useText();
  const { language } = useLanguage();
  const calendar = useInfiniteQuery({
    queryKey: ["calendar", accountId, spaceId, range.start, range.end, timezone], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => calendarRangePage(accountId, spaceId, range, timezone, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
    retry: false, networkMode: "always", refetchOnMount: "always", gcTime: 0,
  });
  useCalendarAccountGuard(calendar.error);
  const month = range.start.slice(0, 7);
  const days = Number(calendarRange(month).end.slice(-2));
  const firstDay = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const today = dateInZone(new Date(), timezone);
  const entries = [...new Map(calendar.data?.pages.flatMap(page => page.data).map(entry => [`${entry.kind}:${entry.id}`, entry] as const) ?? []).values()].sort(compareCalendarEntries);
  const dated = entries.filter(entry => view !== "month" || !selectedDate || entry.date === selectedDate);
  // Hiding a source is only a display choice: nothing is deleted or changed, and the request stays the same.
  const visible = dated.filter(entry => !hidden.has(calendarSource(entry)));
  const hiddenCount = dated.length - visible.length;
  const loading = calendar.isFetching && !calendar.isFetchingNextPage;
  const unavailable = calendar.error instanceof ApiError && [401, 403, 404].includes(calendar.error.status);
  const title = view === "day" ? formatDay(range.start, language)
    : view === "week" ? t("tasks.calendarWeekRange", { start: formatDay(range.start, language), end: formatDay(range.end, language) })
    : selectedDate ? formatDay(selectedDate, language) : t("tasks.calendarAgenda");
  function download() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([calendarFile(entries)], { type: "text/calendar;charset=utf-8" }));
    link.download = `calendar-${view === "month" ? month : view === "week" ? `${range.start}-to-${range.end}` : range.start}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }
  return <div className={view === "month" ? styles.workspace : styles.single}>
    {view === "month" && <section className={styles.monthGrid} aria-label={t("tasks.calendarDates")}>
      <div className={styles.weekdays} aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <span key={day}>{language === "en" ? day : new Intl.DateTimeFormat(`${language}-IN`, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 8, 20 + index)))}</span>)}</div>
      <div className={styles.dates}>
        {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = `${month}-${String(index + 1).padStart(2, "0")}`;
          return <button key={day} type="button" aria-label={formatDay(day, language)} aria-pressed={selectedDate === day} aria-current={day === today ? "date" : undefined} onClick={() => onDate(selectedDate === day ? "" : day)}>{index + 1}</button>;
        })}
      </div>
      <button className="text-button" disabled={!selectedDate} onClick={() => onDate("")}>{t("tasks.calendarAllDates")}</button>
    </section>}
    <section className={styles.agenda} aria-labelledby="agenda-title">
      <div className={styles.agendaHeading}><h2 id="agenda-title">{title}</h2><button className="icon-button" title={t("tasks.calendarRefresh")} aria-label={t("tasks.calendarRefresh")} disabled={calendar.isFetching} onClick={() => calendar.refetch()}><RefreshCw size={18} className={calendar.isFetching ? "spin" : ""} aria-hidden /></button></div>
      {loading && <p role="status" aria-busy="true">{t("tasks.calendarLoadingList")}</p>}
      {calendar.isError && <div className="message error" role="alert">{calendar.error.message}{unavailable ? <Link href="/app/spaces">{t("tasks.returnSpaces")}</Link> : <button className="text-button" onClick={() => calendar.refetch()}>{t("tasks.retry")}</button>}</div>}
      {!loading && !calendar.isError && <>
        {visible.length === 0 && hiddenCount === 0 && <p className={styles.empty}>{t(calendar.hasNextPage ? "tasks.calendarNoLoadedDates" : "tasks.calendarEmpty")}</p>}
        {hiddenCount > 0 && <p className={styles.hiddenNote}>{t("tasks.calendarHidden", { count: hiddenCount })}</p>}
        <ul className={styles.entries}>{visible.map(entry => <CalendarRow key={`${entry.kind}:${entry.id}`} entry={entry} timezone={timezone} solo={solo} />)}</ul>
        {calendar.hasNextPage && <button className="secondary-button" disabled={calendar.isFetching} onClick={() => calendar.fetchNextPage()}>{calendar.isFetchingNextPage ? <LoaderCircle size={17} className="spin" aria-hidden /> : <CalendarDays size={17} aria-hidden />}{t("tasks.calendarMore")}</button>}
        {entries.length > 0 && <div className={styles.fileCopy}>
          <button className="secondary-button" onClick={download}><Download size={17} aria-hidden />Download calendar file</button>
          <p>{calendar.hasNextPage ? "A copy of the entries loaded so far" : view === "month" ? "A copy of this month's entries" : view === "week" ? "A copy of this week's entries" : "A copy of this day's entries"}, for another calendar app. It does not update when things change here.</p>
        </div>}
      </>}
    </section>
  </div>;
}

function formatDay(date: string, language: "en" | "te" | "hi" = "en") {
  return new Intl.DateTimeFormat(language === "en" ? "en" : `${language}-IN`, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

function CalendarRow({ entry, timezone, solo }: { entry: CalendarEntry; timezone: string; solo: boolean }) {
  const t = useText();
  const { language } = useLanguage();
  const rowLanguage = entry.kind === "event" ? "en" : language;
  const isTask = entry.kind === "task";
  const Icon = isTask ? ClipboardList : entry.kind === "planned" ? Repeat : entry.kind === "event" ? CalendarClock : Bell;
  const status = entry.kind === "event" ? entry.status.replaceAll("_", " ") : t(calendarStatusTexts[entry.status]);
  const source = entry.kind === "event" ? `Event in ${entry.timezone}` : isTask ? "" : t(entry.series_id
    ? entry.source_changed ? "tasks.calendarRepeatingChangedZone" : "tasks.calendarRepeatingZone"
    : entry.source_changed ? "tasks.calendarScheduledChangedZone" : "tasks.calendarScheduledZone", { timezone: entry.timezone });
  // Who else sees this entry: reminders are always the person's own; tasks and events are the Space's, unless it is a solo Space.
  const shared = !solo && calendarSource(entry) !== "reminder";
  const audience = entry.kind === "event" ? shared ? "Shared in this Space" : "Only you" : t(shared ? "tasks.calendarShared" : "tasks.calendarOnlyYou");
  const link = isTask ? { href: `/app/tasks?space_id=${entry.space_id}`, label: t("tasks.calendarTasks") }
    : entry.kind === "event" ? { href: `/app/events?space_id=${entry.space_id}`, label: "Space events" }
    : { href: `/app/reminders?task_id=${entry.task_id}`, label: t("tasks.calendarReminders") };
  return <li className={styles.entry} data-kind={entry.kind}>
    <div className={styles.entryTitle}><Icon size={19} aria-hidden /><h3>{entry.title}</h3><span className={styles.status}>{status}</span></div>
    <p className={styles.date}>{formatDay(entry.date, rowLanguage)} <span>{isTask ? t("tasks.dueDate") : new Intl.DateTimeFormat(rowLanguage === "en" ? "en" : `${rowLanguage}-IN`, { timeZone: timezone, hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(entry.scheduled_at))}</span></p>
    <p className={styles.audience}>{shared ? <UsersRound size={15} aria-hidden /> : <Lock size={15} aria-hidden />}{audience}</p>
    {!isTask && <p className={styles.sourceZone}>{source}</p>}
    <Link className={styles.sourceLink} href={link.href}><Icon size={16} aria-hidden />{link.label}</Link>
  </li>;
}