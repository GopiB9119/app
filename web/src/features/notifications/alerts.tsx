"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarClock, Check, LoaderCircle, Moon, Pill, RefreshCw, UserRoundCheck, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { displayInstant, protectedReminderError } from "@/features/scheduling/reminder-common";
import styles from "@/features/scheduling/reminders.module.css";
import { alertFeed, alertLine, dismissAlert, quietHours, saveQuietHours } from "./alerts-client";
import type { AlertItem } from "./alerts-client";

const icons = { backup: UserRoundCheck, dose: Pill, event: CalendarClock, reminder: BellRing };

function itemLink(item: AlertItem) {
  if (item.kind === "dose") return { href: "/app/care", label: "Open care" };
  if (item.kind === "event") return { href: `/app/events?space_id=${item.space_id}`, label: "Open events" };
  return { href: `/app/reminders?task_id=${item.task_id}`, label: "Open task reminders" };
}

/** Alerts that are due now besides the reminders listed below: a backup person's alerts, dose times and events. */
export function DueNowPanel({ user, onDenied }: { user: Account; onDenied: (error: Error) => void }) {
  const client = useQueryClient();
  const titleId = useId();
  const feed = useQuery({
    queryKey: ["alerts", user.id], queryFn: ({ signal }) => alertFeed(user.id, signal),
    refetchInterval: 60_000, refetchIntervalInBackground: false,
  });
  const dismiss = useMutation({
    mutationFn: (item: AlertItem) => dismissAlert(user.id, item),
    onSuccess: () => client.invalidateQueries({ queryKey: ["alerts", user.id] }),
    onError: problem => { if (protectedReminderError(problem)) onDenied(problem); },
  });
  useEffect(() => { if (feed.error && protectedReminderError(feed.error)) onDenied(feed.error); }, [feed.error, onDenied]);
  const items = feed.data?.items.filter(item => item.kind !== "reminder") ?? [];
  return <section className={styles.requests} aria-labelledby={titleId}>
    <div className={styles.sectionHeading}><h2 id={titleId}>Due now</h2><button className="icon-button" aria-label="Refresh alerts" title="Refresh alerts" disabled={feed.isFetching} onClick={() => feed.refetch()}><RefreshCw size={18} className={feed.isFetching ? "spin" : ""} /></button></div>
    {feed.data?.quiet.active && feed.data.quiet.until && <p className={styles.reason}><Moon size={15} aria-hidden /> Quiet hours until {displayInstant(feed.data.quiet.until, user.timezone)}. Phone alerts wait; this list does not.</p>}
    {feed.isPending && <p role="status">Loading alerts...</p>}
    {feed.isError && <p className="message error" role="alert">{feed.error.message}</p>}
    {dismiss.isError && <p className="message error" role="alert">{dismiss.error.message}</p>}
    {feed.data && items.length === 0 && <p className={styles.empty}>Nothing else is due right now.</p>}
    <ul className={styles.list}>{items.map(item => {
      const Icon = icons[item.kind];
      const link = itemLink(item);
      return <li key={item.id} data-alert-kind={item.kind}>
        <div className={styles.rowHeading}><h3><Icon size={17} aria-hidden /> {item.title}</h3><span className={styles.status}>{item.kind === "backup" ? "Backup" : item.kind === "dose" ? "Dose time" : "Event"}</span></div>
        <p>{alertLine(item)}</p>
        <p className={styles.reason}>Due {displayInstant(item.due_at, user.timezone)}</p>
        <div className={styles.actions}><Link href={link.href}>{link.label}</Link>
          <button className="text-button" aria-label={`Dismiss alert: ${item.title}`} disabled={dismiss.isPending} onClick={() => dismiss.mutate(item)}><X size={16} />Dismiss</button>
        </div>
      </li>;
    })}</ul>
    <p className={styles.disclosure}>Alerts stay inside this app. Nothing is sent by text, email or a phone call.</p>
  </section>;
}

export function QuietHoursSettings({ user, onDenied }: { user: Account; onDenied: (error: Error) => void }) {
  const client = useQueryClient();
  const fieldId = useId();
  const settings = useQuery({ queryKey: ["quietHours", user.id], queryFn: ({ signal }) => quietHours(user.id, signal) });
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: { start: string | null; end: string | null; etag: string }) => saveQuietHours(user.id, value.start, value.end, value.etag),
    onSuccess: result => { client.setQueryData(["quietHours", user.id], result); setStart(null); setEnd(null); void client.invalidateQueries({ queryKey: ["alerts", user.id] }); },
    onError: problem => {
      if (protectedReminderError(problem)) onDenied(problem);
      if (problem instanceof ApiError && problem.status === 412) void settings.refetch();
    },
  });
  useEffect(() => { if (settings.error && protectedReminderError(settings.error)) onDenied(settings.error); }, [settings.error, onDenied]);
  const current = settings.data?.data;
  const shownStart = start ?? current?.start ?? "";
  const shownEnd = end ?? current?.end ?? "";
  const valid = /^\d{2}:\d{2}/.test(shownStart) && /^\d{2}:\d{2}/.test(shownEnd) && shownStart.slice(0, 5) !== shownEnd.slice(0, 5);
  return <div className={styles.quiet} aria-labelledby={`${fieldId}-title`} role="group">
    <h3 id={`${fieldId}-title`}><Moon size={17} aria-hidden /> Quiet hours</h3>
    {settings.isPending && <p role="status">Loading quiet hours...</p>}
    {settings.isError && <p className="message error" role="alert">{settings.error.message}</p>}
    {current && settings.data && <>
      <p className={styles.disclosure}>{current.start ? `On, ${current.start} to ${current.end} (${current.timezone}).` : "Off."} Phone alerts wait until quiet hours end. The inbox and this page still show everything.</p>
      <div className={styles.fieldRow}>
        <label>From<input name="quiet_start" type="time" step={60} value={shownStart} disabled={save.isPending} onChange={event => setStart(event.target.value)} /></label>
        <label>Until<input name="quiet_end" type="time" step={60} value={shownEnd} disabled={save.isPending} onChange={event => setEnd(event.target.value)} /></label>
      </div>
      <div className={styles.actions}>
        <button className="secondary-button" disabled={save.isPending || !valid} onClick={() => save.mutate({ start: shownStart.slice(0, 5), end: shownEnd.slice(0, 5), etag: settings.data.etag })}>{save.isPending ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}Save quiet hours</button>
        {current.start && <button className="text-button" disabled={save.isPending} onClick={() => save.mutate({ start: null, end: null, etag: settings.data.etag })}>Turn off</button>}
      </div>
    </>}
    {save.isError && <p className="message error" role="alert">{save.error.message}</p>}
  </div>;
}
