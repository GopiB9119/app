"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Bell, CalendarDays, ClipboardList, LoaderCircle, RefreshCw, UsersRound } from "lucide-react";

import { api, ApiError, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { spacesSchema } from "@/features/spaces/client";
import { adjacentMonth, calendarPage, calendarRange, compareCalendarEntries, dateInZone } from "./calendar-client";
import type { CalendarEntry } from "./calendar-client";
import styles from "./calendar.module.css";

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
  const account = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useCalendarAccountGuard(account.error);
  if (account.isPending) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading calendar</main></Shell>;
  if (account.isError) return <Shell account><main className={styles.main}><h1>Calendar unavailable</h1><p className="message error" role="alert">{account.error.message}</p><button className="secondary-button" onClick={() => account.refetch()}><RefreshCw size={18} aria-hidden />Retry</button></main></Shell>;
  return <CalendarWorkspace key={account.data.data.id} user={account.data.data} initialSpaceId={initialSpaceId} />;
}

function CalendarWorkspace({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [timezone, setTimezone] = useState(user.timezone);
  const [month, setMonth] = useState(() => dateInZone(new Date(), user.timezone).slice(0, 7));
  const [selectedDate, setSelectedDate] = useState("");
  const spaces = useQuery({ queryKey: ["spaces", user.id], queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }) });
  useCalendarAccountGuard(spaces.error);
  const selectedSpace = spaces.data?.data.find(space => space.id === spaceId) ?? (!spaceId ? spaces.data?.data[0] : undefined);
  function changeMonth(value: string) {
    try { calendarRange(value); setMonth(value); setSelectedDate(""); } catch { return; }
  }
  return <Shell account><main className={styles.main}>
    <nav className={styles.navigation} aria-label="Workspace"><Link href="/app/spaces"><UsersRound size={18} aria-hidden />Spaces</Link><Link href="/app/tasks"><ClipboardList size={18} aria-hidden />Tasks</Link><span aria-current="page"><CalendarDays size={18} aria-hidden />Calendar</span></nav>
    <header className={styles.heading}><h1>Calendar</h1><span>Private</span></header>
    {spaces.isPending && <p role="status">Loading Spaces...</p>}
    {spaces.isError && <p className="message error" role="alert">{spaces.error.message}<button className="text-button" onClick={() => spaces.refetch()}>Retry</button></p>}
    {!spaces.isPending && !spaces.isError && <>
      {spaces.data?.data.length === 0 ? <div className={styles.empty}><CalendarDays size={34} aria-hidden /><h2>No family Spaces yet</h2><Link href="/app/spaces">Open Spaces</Link></div> : <>
        <div className={styles.filters}>
          <label><span id="calendar-space-label">Family Space</span><select aria-labelledby="calendar-space-label" value={selectedSpace?.id ?? spaceId} onChange={event => { setSpaceId(event.target.value); setSelectedDate(""); }}>{!selectedSpace && <option value={spaceId}>Space unavailable</option>}{spaces.data?.data.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label>
          <label><span id="calendar-zone-label">Display timezone</span><select aria-labelledby="calendar-zone-label" value={timezone} onChange={event => setTimezone(event.target.value)}>{[...new Set([user.timezone, "UTC"])].map(zone => <option key={zone}>{zone}</option>)}</select></label>
        </div>
        <div className={styles.toolbar}>
          <button className="icon-button" aria-label="Previous month" title="Previous month" disabled={month === "1900-01"} onClick={() => changeMonth(adjacentMonth(month, -1))}><ArrowLeft size={18} aria-hidden /></button>
          <label className={styles.month}><span className={styles.srOnly}>Month</span><input aria-label="Month" type="month" min="1900-01" max="2100-12" value={month} onChange={event => changeMonth(event.target.value)} /></label>
          <button className="icon-button" aria-label="Next month" title="Next month" disabled={month === "2100-12"} onClick={() => changeMonth(adjacentMonth(month, 1))}><ArrowRight size={18} aria-hidden /></button>
          <button className="secondary-button" onClick={() => { changeMonth(dateInZone(new Date(), timezone).slice(0, 7)); setSelectedDate(dateInZone(new Date(), timezone)); }}>Today</button>
        </div>
        {selectedSpace ? <CalendarAgenda key={`${selectedSpace.id}:${month}:${timezone}`} accountId={user.id} spaceId={selectedSpace.id} month={month} timezone={timezone} selectedDate={selectedDate} onDate={setSelectedDate} /> : <p className="message error" role="alert">This Space is unavailable.</p>}
      </>}
    </>}
  </main></Shell>;
}

function CalendarAgenda({ accountId, spaceId, month, timezone, selectedDate, onDate }: {
  accountId: string; spaceId: string; month: string; timezone: string; selectedDate: string; onDate: (value: string) => void;
}) {
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
  return <div className={styles.workspace}>
    <section className={styles.monthGrid} aria-label="Calendar dates">
      <div className={styles.weekdays} aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div>
      <div className={styles.dates}>
        {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = `${month}-${String(index + 1).padStart(2, "0")}`;
          return <button key={day} type="button" aria-label={formatDay(day)} aria-pressed={selectedDate === day} aria-current={day === today ? "date" : undefined} onClick={() => onDate(selectedDate === day ? "" : day)}>{index + 1}</button>;
        })}
      </div>
      <button className="text-button" disabled={!selectedDate} onClick={() => onDate("")}>All dates</button>
    </section>
    <section className={styles.agenda} aria-labelledby="agenda-title">
      <div className={styles.agendaHeading}><h2 id="agenda-title">{selectedDate ? formatDay(selectedDate) : "Month agenda"}</h2><button className="icon-button" title="Refresh calendar" aria-label="Refresh calendar" disabled={calendar.isFetching} onClick={() => calendar.refetch()}><RefreshCw size={18} className={calendar.isFetching ? "spin" : ""} aria-hidden /></button></div>
      {loading && <p role="status" aria-busy="true">Loading calendar...</p>}
      {calendar.isError && <div className="message error" role="alert">{calendar.error.message}{unavailable ? <Link href="/app/spaces">Return to Spaces</Link> : <button className="text-button" onClick={() => calendar.refetch()}>Retry</button>}</div>}
      {!loading && !calendar.isError && <>
        {visible.length === 0 && <p className={styles.empty}>{calendar.hasNextPage ? "No entries in the loaded dates." : "No tasks or reminders for these dates."}</p>}
        <ul className={styles.entries}>{visible.map(entry => <CalendarRow key={`${entry.kind}:${entry.id}`} entry={entry} timezone={timezone} />)}</ul>
        {calendar.hasNextPage && <button className="secondary-button" disabled={calendar.isFetching} onClick={() => calendar.fetchNextPage()}>{calendar.isFetchingNextPage ? <LoaderCircle size={17} className="spin" aria-hidden /> : <CalendarDays size={17} aria-hidden />}Load more entries</button>}
      </>}
    </section>
  </div>;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

function CalendarRow({ entry, timezone }: { entry: CalendarEntry; timezone: string }) {
  const isTask = entry.kind === "task";
  const Icon = isTask ? ClipboardList : Bell;
  return <li className={styles.entry} data-kind={entry.kind}>
    <div className={styles.entryTitle}><Icon size={19} aria-hidden /><h3>{entry.title}</h3><span className={styles.status}>{entry.status === "available" ? "In inbox" : entry.status.replaceAll("_", " ")}</span></div>
    <p className={styles.date}>{formatDay(entry.date)} <span>{isTask ? "Due date" : new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(entry.scheduled_at))}</span></p>
    {!isTask && <p className={styles.sourceZone}>Scheduled in {entry.timezone}{entry.source_changed ? " / Task changed" : ""}</p>}
    <Link className={styles.sourceLink} href={isTask ? `/app/tasks?space_id=${entry.space_id}` : `/app/reminders?task_id=${entry.task_id}`}><Icon size={16} aria-hidden />{isTask ? "Space tasks" : "My reminders"}</Link>
  </li>;
}