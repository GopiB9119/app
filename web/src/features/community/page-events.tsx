"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CalendarDays, LoaderCircle } from "lucide-react";
import { api } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId, MessageValues } from "@/features/i18n/messages";
import { MAX_CAPACITY, MAX_DESCRIPTION, MAX_LOCATION, MAX_TITLE, browserZone, eventBody, eventFormProblems, eventTimezone, formatWhen } from "@/features/events/client";
import type { EventForm, EventFormProblems } from "@/features/events/client";
import type { PublicPage } from "./client";
import { cancelPageEvent, createPageEvent, discoverEvents, myPageEvents, pageEventAttendees, pageEvents, setGoing, updatePageEvent } from "./page-events-client";
import type { PageEvent } from "./page-events-client";
import { problemText, sessionLost } from "./shared";
import styles from "./community.module.css";

// eventFormProblems answers in English; each sentence has its own translated text in the events area.
const formProblems = new Map<string, [MessageId, MessageValues?]>([
  ["Enter a title.", ["events.problem.title"]],
  [`Titles can have up to ${MAX_TITLE} characters.`, ["events.problem.titleLength", { limit: MAX_TITLE }]],
  [`Locations can have up to ${MAX_LOCATION} characters.`, ["events.problem.locationLength", { limit: MAX_LOCATION }]],
  [`Details can have up to ${MAX_DESCRIPTION} characters.`, ["events.problem.detailsLength", { limit: MAX_DESCRIPTION }]],
  ["Remove control characters.", ["events.problem.control"]],
  ["Choose a start date and time.", ["events.problem.start"]],
  ["Choose a valid start date and time.", ["events.problem.validStart"]],
  ["Choose a valid end date and time.", ["events.problem.validEnd"]],
  ["The end must be after the start.", ["events.problem.end"]],
  ["Choose a time zone.", ["events.problem.zone"]],
  [`Enter a whole number from 1 to ${MAX_CAPACITY}, or leave it empty.`, ["events.problem.capacity", { limit: MAX_CAPACITY }]],
]);

/** Events a public page publishes (D4): the managers publish them, signed-in people say they are going. */
export function PageEvents({ viewer, page }: { viewer: Account | null; page: PublicPage }) {
  const t = useText();
  const queryClient = useQueryClient();
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const [editing, setEditing] = useState<PageEvent | "new" | null>(null);
  const events = useQuery({
    queryKey: ["page-events", page.id, viewer?.id ?? null, when],
    queryFn: ({ signal }) => pageEvents(page.id, viewer?.id, when, signal),
    enabled: !page.blocked && page.status !== "deleted", networkMode: "always",
  });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["page-events", page.id] }); };
  const active = page.status === "active";
  const items = events.data ?? [];
  if (page.blocked || page.status === "deleted" || (!page.can_manage && when === "upcoming" && events.isSuccess && items.length === 0)) return null;
  return <section className={styles.stack} aria-labelledby="page-events-heading">
    <h2 id="page-events-heading">{t("community.events.heading")}</h2>
    <div className={styles.actions} role="group" aria-label={t("community.events.heading")}>
      {(["upcoming", "past"] as const).map(value => <button key={value} className={when === value ? "primary-button" : "secondary-button"} aria-pressed={when === value}
        onClick={() => setWhen(value)}>{t(`community.events.${value}`)}</button>)}
      {page.can_manage && viewer && active && editing === null &&
        <button className="secondary-button" onClick={() => setEditing("new")}><CalendarDays size={17} aria-hidden />{t("events.new")}</button>}
    </div>
    {editing !== null && viewer && <PageEventForm account={viewer} pageId={page.id} existing={editing === "new" ? null : editing}
      onDone={() => { setEditing(null); refresh(); }} onClose={() => setEditing(null)} />}
    {events.isPending && <p role="status" aria-busy="true">{t("community.events.loading")}</p>}
    {events.isError && !sessionLost(events.error) && <div className="message error" role="alert">{problemText(events.error, t("community.events.failed"), t)}</div>}
    {events.isSuccess && items.length === 0 && <p className={styles.empty}>{t(when === "upcoming" ? "community.events.empty" : "community.events.emptyPast")}</p>}
    {items.map(event => <PageEventCard key={event.id} viewer={viewer} event={event} pageActive={active} onChanged={refresh}
      onEdit={() => setEditing(event)} />)}
  </section>;
}

/** Upcoming page events the person said they are going to; nothing shows until there is one. */
export function MyPageEvents({ account }: { account: Account }) {
  const t = useText();
  const events = useQuery({
    queryKey: ["my-page-events", account.id],
    queryFn: ({ signal }) => myPageEvents(account.id, signal), networkMode: "always",
  });
  return <EventLinks heading={t("community.events.mine")} query={events} zone={account.timezone || browserZone()} />;
}

/** "What's on" on Discover: the next events on active pages, without pages the person blocked or muted. */
export function DiscoverEvents({ viewer }: { viewer: Account | null }) {
  const t = useText();
  const events = useQuery({
    queryKey: ["discover-events", viewer?.id ?? null],
    queryFn: ({ signal }) => discoverEvents(viewer?.id, signal), networkMode: "always",
  });
  return <EventLinks heading={t("community.events.whatsOn")} query={events} zone={viewer?.timezone || browserZone()} />;
}

function EventLinks({ heading, query, zone }: { heading: string; query: { data?: PageEvent[]; error: unknown; isError: boolean }; zone: string }) {
  const t = useText();
  const { language } = useLanguage();
  const id = useId();
  if (query.isError && !sessionLost(query.error)) {
    return <div className="message error" role="alert">{problemText(query.error, t("community.events.failed"), t)}</div>;
  }
  if (!query.data?.length) return null;
  return <section className={styles.stack} aria-labelledby={id}>
    <h2 id={id}>{heading}</h2>
    <ul className={styles.list}>
      {query.data.map(event => {
        const when = formatWhen(event, zone, { locale: language, range: (start, end) => t("events.timeRange", { start, end }) });
        const facts = [event.page_name, when.main];
        if (event.status === "cancelled") facts.push(t("community.events.cancelled"));
        return <li key={event.id} className={styles.row}>
          <span><Link href={`/pages/${event.page_handle}`}>{event.title}</Link>{" "}<span className={styles.meta}>{facts.join(" · ")}</span></span>
        </li>;
      })}
    </ul>
  </section>;
}

function PageEventCard({ viewer, event, pageActive, onChanged, onEdit }: {
  viewer: Account | null; event: PageEvent; pageActive: boolean; onChanged: () => void; onEdit: () => void;
}) {
  const t = useText();
  const { language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAttendees, setShowAttendees] = useState(false);
  const zone = viewer?.timezone ?? browserZone();
  const attendees = useQuery({
    queryKey: ["page-event-attendees", event.id],
    queryFn: ({ signal }) => pageEventAttendees(viewer!.id, event.id, signal),
    enabled: Boolean(viewer && event.can_manage && showAttendees), networkMode: "always",
  });
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); onChanged(); }
    catch (failure) {
      if (sessionLost(failure)) { window.location.reload(); return; }
      setError(problemText(failure, t("community.events.changeFailed"), t));
      onChanged();
    } finally { setBusy(false); }
  }
  const whenText = formatWhen(event, zone, {
    locale: language, range: (start, end) => t("events.timeRange", { start, end }), own: time => t("events.yourTime", { time, zone }),
  });
  const open = event.status === "scheduled" && !event.ended;
  const full = event.capacity !== null && event.going_count >= event.capacity;
  const heading = `page-event-${event.id}`;
  return <article className={styles.card} aria-labelledby={heading}>
    <div className={styles.actions}>
      {event.status === "cancelled" && <span className={styles.badge}>{t("community.events.cancelled")}</span>}
      {event.status === "scheduled" && event.ended && <span className={styles.badge}>{t("community.events.ended")}</span>}
      {event.schedule_changed_at && event.status === "scheduled" && <span className={styles.badge}>{t("community.events.changed")}</span>}
    </div>
    <h3 id={heading}>{event.title}</h3>
    <p className={styles.meta}>{whenText.main}</p>
    {whenText.yours && <p className={styles.meta}>{whenText.yours}</p>}
    {event.location && <p className={styles.body}>{event.location}</p>}
    {event.location_hidden && <p className={styles.meta}>{t("community.events.placeHidden")}</p>}
    {event.description && <p className={styles.body}>{event.description}</p>}
    <p className={styles.meta}>{event.capacity === null ? t("community.events.count", { count: event.going_count })
      : t("community.events.countOf", { count: event.going_count, capacity: event.capacity })}</p>
    {error && <div className="message error" role="alert">{error}</div>}
    <div className={styles.actions}>
      {!viewer && open && <span className={styles.meta}>{t("community.events.signInToGo")}</span>}
      {viewer && event.going && <span className={styles.meta}>{t("community.events.youAreGoing")}</span>}
      {viewer && event.going && <button className="secondary-button" disabled={busy} onClick={() => run(() => setGoing(viewer.id, event.id, false))}>{t("community.events.notGoing")}</button>}
      {viewer && !event.going && open && pageActive && (full ? <span className={styles.meta}>{t("community.events.full")}</span>
        : <button className="primary-button" disabled={busy} onClick={() => run(() => setGoing(viewer.id, event.id, true))}>
          {busy && <LoaderCircle size={17} className="spin" aria-hidden />}{t("community.events.going")}</button>)}
      {viewer && event.can_manage && open && pageActive && <button className="text-button" disabled={busy} onClick={onEdit}>{t("events.edit")}</button>}
      {viewer && event.can_manage && open && <button className="text-button" disabled={busy}
        onClick={() => { if (window.confirm(t("community.events.confirmCancel"))) void run(() => cancelPageEvent(viewer.id, event)); }}>{t("community.events.cancel")}</button>}
      {viewer && event.can_manage && <button className="text-button" aria-expanded={showAttendees} onClick={() => setShowAttendees(value => !value)}>
        {t(showAttendees ? "community.events.hideAttendees" : "community.events.attendees")}</button>}
    </div>
    {showAttendees && attendees.isError && !sessionLost(attendees.error) && <p className="message error" role="alert">{problemText(attendees.error, t("community.events.changeFailed"), t)}</p>}
    {showAttendees && attendees.data && (attendees.data.length === 0
      ? <p className={styles.empty}>{t("community.events.noAttendees")}</p>
      : <ul className={styles.list}>{attendees.data.map((item, index) => <li key={`${item.name}-${index}`}>{item.name}</li>)}</ul>)}
  </article>;
}

function PageEventForm({ account, pageId, existing, onDone, onClose }: {
  account: Account; pageId: string; existing: PageEvent | null; onDone: () => void; onClose: () => void;
}) {
  const t = useText();
  const [form, setForm] = useState<EventForm>(() => existing ? {
    title: existing.title, description: existing.description, location: existing.location ?? "", timezone: existing.timezone,
    local_start: existing.local_start, local_end: existing.local_end ?? "", capacity: existing.capacity === null ? "" : String(existing.capacity),
  } : { title: "", description: "", location: "", timezone: "", local_start: "", local_end: "", capacity: "" });
  const [placePublic, setPlacePublic] = useState(existing?.location_public ?? false);
  const [problems, setProblems] = useState<EventFormProblems>({});
  // One key per new event, kept across retries, so a lost answer never publishes it twice.
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const zoneList = useQuery({ queryKey: ["timezones"], queryFn: ({ signal }) => api("timezones", z.array(z.string().min(1).max(64)).min(1), { signal }) });
  const zones = zoneList.data?.data;
  const zone = useMemo(() => zones ? eventTimezone(form.timezone || account.timezone || browserZone(), zones) : "", [zones, form.timezone, account.timezone]);
  const set = (name: keyof EventForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(value => ({ ...value, [name]: event.target.value }));
  };
  const problem = (name: keyof EventForm) => {
    const text = problems[name];
    if (!text) return null;
    const message = formProblems.get(text);
    return <p className="field-error">{message ? t(message[0], message[1]) : text}</p>;
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !zone) return;
    const submitted = { ...form, timezone: zone };
    const found = eventFormProblems(submitted);
    setProblems(found);
    if (Object.keys(found).length) return;
    const body = { ...eventBody(submitted), location_public: placePublic };
    setBusy(true);
    setError("");
    try {
      if (existing) await updatePageEvent(account.id, existing, body);
      else await createPageEvent({ accountId: account.id, pageId, key, body });
      onDone();
    } catch (failure) {
      if (sessionLost(failure)) { window.location.reload(); return; }
      setError(problemText(failure, t("events.saveProblem"), t));
    } finally { setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-label={existing ? t("events.edit") : t("events.new")} noValidate>
    <h3>{existing ? t("events.edit") : t("events.new")}</h3>
    <label>{t("events.field.title")}<input value={form.title} maxLength={MAX_TITLE * 2} onChange={set("title")} disabled={busy} required /></label>
    {problem("title")}
    <label>{t("events.field.starts")}<input type="datetime-local" value={form.local_start} onChange={set("local_start")} disabled={busy} required /></label>
    {problem("local_start")}
    <label>{t("events.field.ends")}<input type="datetime-local" value={form.local_end} onChange={set("local_end")} disabled={busy} /></label>
    {problem("local_end")}
    <label>{t("events.field.zone")}<select value={zone} onChange={set("timezone")} disabled={busy || !zones}>
      {!zone && <option value="" disabled>{t("events.problem.zone")}</option>}
      {zones?.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    {problem("timezone")}
    <label>{t("events.field.location")}<input value={form.location} maxLength={MAX_LOCATION * 2} onChange={set("location")} disabled={busy} /></label>
    {problem("location")}
    <label className={styles.meta}><input type="checkbox" checked={placePublic} onChange={event => setPlacePublic(event.target.checked)} disabled={busy} />
      {t("community.events.placePublic")}</label>
    <p className={styles.meta}>{t("community.events.placeHint")}</p>
    <label>{t("events.field.details")}<textarea value={form.description} maxLength={MAX_DESCRIPTION * 2} onChange={set("description")} disabled={busy} /></label>
    {problem("description")}
    <label>{t("events.field.capacity")}<input inputMode="numeric" value={form.capacity} maxLength={6} onChange={set("capacity")} disabled={busy} /></label>
    <p className={styles.meta}>{t("community.events.capacityHint")}</p>
    {problem("capacity")}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={busy || !zone}>{busy ? t("events.saving") : existing ? t("events.saveChanges") : t("community.events.publish")}</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{t("community.cancel")}</button>
    </div>
  </form>;
}
