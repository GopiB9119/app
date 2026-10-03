"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, CalendarPlus, LoaderCircle, MapPin, Pencil, RefreshCw, UsersRound, X } from "lucide-react";
import { z } from "zod";

import { ApiError, api, characters } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { TimezoneListProblem } from "@/features/identity/timezone-list-problem";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId, MessageValues } from "@/features/i18n/messages";
import { spacesSchema } from "@/features/spaces/client";
import { eventAlert, eventLeads, setEventAlert } from "@/features/notifications/alerts-client";
import type { EventLead } from "@/features/notifications/alerts-client";
import {
  MAX_CAPACITY, MAX_DESCRIPTION, MAX_LOCATION, MAX_TITLE, RESPONSES, browserZone, cancelEvent, createEvent, eventBody, eventFormProblems, eventTimezone,
  formFromEvent, formatWhen, listEvents, readEvent, respondToEvent, sameBody, updateEvent,
} from "./client";
import type { CreateIntent, EventForm, EventFormProblems, EventResponse, SpaceEvent } from "./client";
import { EventBudget } from "./budget-panel";
import styles from "./events.module.css";

type When = "upcoming" | "past";
type EditorGuard = { busy: boolean; message: string | null };
type GuardChange = (guard: EditorGuard | null) => void;

function mayLeaveEditor(guard: EditorGuard | null) {
  return !guard?.busy && (!guard?.message || window.confirm(guard.message));
}

const responseLabels: Record<EventResponse, MessageId> = { going: "events.response.going", maybe: "events.response.maybe", not_going: "events.response.notGoing" };
// formProblem answers in English; each of its sentences has its own text.
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
  ["Check this value.", ["events.problem.serverField"]],
  ["Choose a start time in the future.", ["events.problem.future"]],
  ["Choose a start within the next two years.", ["events.problem.twoYears"]],
  ["An event can last at most 14 days.", ["events.problem.duration"]],
  [`Enter a whole number from 1 to ${MAX_CAPACITY}, or leave it empty.`, ["events.problem.capacity", { limit: MAX_CAPACITY }]],
  ["More people are already going. Choose a larger number.", ["events.problem.capacityBelow"]],
]);
const eventFields = ["title", "local_start", "local_end", "timezone", "location", "description", "capacity"] as const;

function serverFormProblems(error: unknown): EventFormProblems {
  if (!(error instanceof ApiError)) return {};
  if (error.code === "EVENT_IN_PAST") return { local_start: "Choose a start time in the future." };
  if (error.code === "EVENT_TOO_FAR") return { local_start: "Choose a start within the next two years." };
  if (error.code === "EVENT_END_BEFORE_START") return { local_end: "The end must be after the start." };
  if (error.code === "EVENT_TOO_LONG") return { local_end: "An event can last at most 14 days." };
  if (error.code === "CAPACITY_BELOW_GOING") return { capacity: "More people are already going. Choose a larger number." };
  const problems: EventFormProblems = {};
  if (error.code === "VALIDATION_ERROR") {
    for (const field of eventFields) if (error.details[`body.${field}`]) problems[field] = "Check this value.";
  }
  return problems;
}

export function EventsScreen({ initialSpaceId }: { initialSpaceId: string }) {
  const t = useText();
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("events.loading")}</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>{t("events.unavailable")}</h1><p role="alert">{problemText(viewer.error, t("events.loadProblem"), t)}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />{t("events.retry")}</button></main></Shell>;
  }
  return <Events key={viewer.account.id} user={viewer.account} initialSpaceId={initialSpaceId} />;
}

function Events({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const zone = useMemo(browserZone, []);
  const [chosenSpace, setChosenSpace] = useState(initialSpaceId);
  const [when, setWhen] = useState<When>("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editorGuard, setEditorGuard] = useState<EditorGuard | null>(null);
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  const spaceList = spaces.data?.data ?? [];
  const firstSpaceId = spaceList[0]?.id ?? "";
  const spaceId = chosenSpace ? spaceList.find(space => space.id === chosenSpace)?.id ?? "" : firstSpaceId;
  useEffect(() => { if (!chosenSpace && firstSpaceId) setChosenSpace(firstSpaceId); }, [chosenSpace, firstSpaceId]);
  const list = useInfiniteQuery({
    queryKey: ["events", user.id, spaceId, when],
    queryFn: ({ pageParam, signal }) => listEvents(user.id, spaceId, when, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.pagination.next_cursor,
    enabled: Boolean(spaceId),
  });
  const problem = spaces.error ?? list.error;
  useEffect(() => {
    if (sessionLost(problem)) {
      queryClient.clear();
      window.location.replace("/login");
    }
  }, [problem, queryClient]);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["events", user.id, spaceId] }); };
  const events = list.data?.pages.flatMap(page => page.data) ?? [];
  const chooseSpace = (value: string) => { if (value === spaceId || !mayLeaveEditor(editorGuard)) return; setChosenSpace(value); setSelectedId(null); setCreating(false); };
  useEffect(() => {
    if (!editorGuard?.busy && !editorGuard?.message) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (destination.origin === current.origin && destination.pathname === current.pathname && destination.search === current.search) return;
      if (!mayLeaveEditor(editorGuard)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [editorGuard]);

  return <Shell account>
    <main className={styles.main}>
      <header className={styles.header}>
        <div><h1>{t("events.title")}</h1><p>{t("events.intro")}</p></div>
        <div className={styles.actions}>
          <button className="icon-button" aria-label={t("events.refresh")} title={t("events.refresh")} disabled={editorGuard?.busy || spaces.isFetching || list.isFetching} onClick={() => {
            void spaces.refetch(); refresh();
            if (selectedId) {
              void queryClient.invalidateQueries({ queryKey: ["event", user.id, selectedId] });
              void queryClient.invalidateQueries({ queryKey: ["eventBudget", user.id, selectedId] });
            }
          }}><RefreshCw size={18} className={spaces.isFetching || list.isFetching ? "spin" : ""} aria-hidden /></button>
          {spaceId && !creating && <button className="primary-button" disabled={editorGuard?.busy} onClick={() => { if (!mayLeaveEditor(editorGuard)) return; setCreating(true); setSelectedId(null); }}><CalendarPlus size={18} aria-hidden />{t("events.new")}</button>}
        </div>
      </header>
      {spaces.isPending && <p aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("events.loadingSpaces")}</p>}
      {spaces.isError && <div className="message error" role="alert">{problemText(spaces.error, t("events.spacesProblem"), t)}<button className="text-button" onClick={() => spaces.refetch()}><RefreshCw size={16} aria-hidden />{t("events.retry")}</button></div>}
      {spaces.isSuccess && spaceList.length === 0 && <p className={styles.empty}>{t("events.noSpaces")} <Link href="/app/spaces">{t("events.goToSpaces")}</Link></p>}
      {spaceList.length > 0 && <div className={styles.controls}>
        <label className={styles.field}>{t("events.space")}<select aria-label={t("events.space")} value={spaceId} disabled={editorGuard?.busy} onChange={event => chooseSpace(event.target.value)}>
          {!spaceId && <option value="" disabled>{t("events.chooseSpace")}</option>}
          {spaceList.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
        </select></label>
        <div className={styles.tabs} role="group" aria-label={t("events.show")}>
          {(["upcoming", "past"] as const).map(value => <button key={value} className={styles.tab} aria-pressed={when === value} disabled={editorGuard?.busy} onClick={() => { if (when === value || !mayLeaveEditor(editorGuard)) return; setWhen(value); setSelectedId(null); setCreating(false); }}>{value === "upcoming" ? t("events.upcoming") : t("events.past")}</button>)}
        </div>
      </div>}
      {creating && spaceId && <EventEditor user={user} spaceId={spaceId} zone={zone} onGuard={setEditorGuard} onClose={() => { setCreating(false); refresh(); }} onSaved={event => { setCreating(false); setWhen("upcoming"); setSelectedId(event.id); refresh(); }} />}
      {selectedId && spaceId && <EventPanel key={selectedId} user={user} eventId={selectedId} zone={zone} onGuard={setEditorGuard} onClose={() => setSelectedId(null)} onChanged={refresh} />}
      {spaceId && <section aria-labelledby="event-list-title">
        <h2 id="event-list-title" className={styles.listTitle}>{when === "upcoming" ? t("events.upcomingTitle") : t("events.pastTitle")}</h2>
        {list.isPending && <p aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("events.loading")}</p>}
        {list.isError && <div className="message error" role="alert">{problemText(list.error, t("events.loadProblem"), t)}<button className="text-button" onClick={() => list.refetch()}><RefreshCw size={16} aria-hidden />{t("events.retry")}</button></div>}
        {list.isSuccess && events.length === 0 && <p className={styles.empty}>{when === "upcoming" ? t("events.emptyUpcoming") : t("events.emptyPast")}</p>}
        <ul className={styles.list}>{events.map(event => {
          const whenText = formatWhen(event, zone, {
            locale: language, range: (start, end) => t("events.timeRange", { start, end }), own: time => t("events.yourTime", { time, zone }),
          });
          const counts = { going: event.going, maybe: event.maybe, notGoing: event.not_going };
          return <li key={event.id} className={styles.card}>
            <button className={styles.cardButton} aria-pressed={selectedId === event.id} disabled={editorGuard?.busy} onClick={() => { if ((selectedId === event.id && !creating) || !mayLeaveEditor(editorGuard)) return; setSelectedId(event.id); setCreating(false); }}>
              <span className={styles.cardTitle}>{event.title}</span>
              {event.status === "cancelled" && <span className={styles.badge}>{t("events.cancelled")}</span>}
            </button>
            <p className={styles.meta}><CalendarClock size={15} aria-hidden />{whenText.main}</p>
            {whenText.yours && <p className={styles.meta}>{whenText.yours}</p>}
            {event.location && <p className={styles.meta}><MapPin size={15} aria-hidden />{event.location}</p>}
            <p className={styles.meta}><UsersRound size={15} aria-hidden />{event.my_response && !event.my_response_outdated
              ? t("events.countsYou", { ...counts, response: t(event.my_waitlist_position !== null ? "events.response.waiting" : responseLabels[event.my_response]) }) : t("events.counts", counts)}</p>
            <Places event={event} />
            {event.my_response && event.my_response_outdated && <p className={styles.notice} role="status">{t("events.yourResponseIsOutdated", { response: t(responseLabels[event.my_response]) })}</p>}
          </li>;
        })}</ul>
        {list.hasNextPage && <button className="secondary-button" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? t("events.loadingMore") : t("events.more")}</button>}
      </section>}
    </main>
  </Shell>;
}

function EventPanel({ user, eventId, zone, onClose, onChanged, onGuard }: { user: Account; eventId: string; zone: string; onClose: () => void; onChanged: () => void; onGuard: GuardChange }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const titleId = useId();
  const [editing, setEditing] = useState<SpaceEvent | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const detail = useQuery({ queryKey: ["event", user.id, eventId], queryFn: ({ signal }) => readEvent(user.id, eventId, signal) });
  // A read that started before the change would otherwise land afterwards and show the old event again.
  const store = async (event: SpaceEvent) => {
    await queryClient.cancelQueries({ queryKey: ["event", user.id, eventId] });
    queryClient.setQueryData(["event", user.id, eventId], event);
    onChanged();
  };
  const respond = useMutation({ mutationFn: (response: EventResponse) => respondToEvent(user.id, eventId, response), onSuccess: store });
  const cancel = useMutation({ mutationFn: (event: SpaceEvent) => cancelEvent(user.id, event), onSuccess: event => {
    setConfirmCancel(false);
    void queryClient.invalidateQueries({ queryKey: ["eventBudget", user.id, eventId] });
    return store(event);
  } });
  useEffect(() => {
    const problem = detail.error ?? respond.error ?? cancel.error;
    if (sessionLost(problem)) { queryClient.clear(); window.location.replace("/login"); }
  }, [detail.error, respond.error, cancel.error, queryClient]);
  if (editing && (!detail.isError || isUnknown(detail.error))) {
    return <EventEditor user={user} spaceId={editing.space_id} zone={zone} existing={editing} onGuard={onGuard} readError={detail.error}
      onClose={() => setEditing(null)} onReload={() => { setEditing(null); void detail.refetch(); }}
      onSaved={saved => { setEditing(null); void store(saved); }} />;
  }
  if (detail.isPending) return <section className={styles.panel} aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("events.loadingEvent")}</section>;
  if (detail.isError) {
    return <section className={styles.panel}><p role="alert">{problemText(detail.error, t("events.eventProblem"), t)}</p>
      <button className="secondary-button" onClick={() => detail.refetch()}><RefreshCw size={16} aria-hidden />{t("events.retry")}</button>
      <button className="text-button" onClick={onClose}>{t("events.close")}</button></section>;
  }
  const event = detail.data;
  const whenText = formatWhen(event, zone, {
    locale: language, range: (start, end) => t("events.timeRange", { start, end }), own: time => t("events.yourTime", { time, zone }),
  });
  const counts = { going: event.going, maybe: event.maybe, notGoing: event.not_going };
  return <section className={styles.panel} aria-labelledby={titleId}>
    <div className={styles.panelHeader}>
      <h2 id={titleId}>{event.title}</h2>
      <button className="icon-button" aria-label={t("events.closeEvent")} title={t("events.closeEvent")} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    {event.status === "cancelled" && <p className={styles.notice} role="status">{t("events.cancelledNotice")}</p>}
    {event.status === "scheduled" && event.ended && <p className={styles.notice}>{t("events.ended")}</p>}
    <p className={styles.meta}><CalendarClock size={15} aria-hidden />{whenText.main}</p>
    {whenText.yours && <p className={styles.meta}>{whenText.yours}</p>}
    {event.location && <p className={styles.meta}><MapPin size={15} aria-hidden />{event.location}</p>}
    {event.description && <p className={styles.description}>{event.description}</p>}
    <p className={styles.meta}>{t(event.schedule_changed_at ? "events.organizedChanged" : "events.organized", { space: event.space_name, organizer: event.created_by_name || t("events.formerMember") })}</p>
    {event.can_respond && <div className={styles.rsvp}>
      <h3>{t("events.yourResponse")}</h3>
      {event.my_response_outdated && <p className={styles.notice} role="status">{t("events.outdated")}</p>}
      <div className={styles.tabs} role="group" aria-label={t("events.yourResponse")}>
        {RESPONSES.map(value => <button key={value} className={styles.tab} aria-pressed={event.my_response === value && !event.my_response_outdated}
          disabled={respond.isPending} onClick={() => respond.mutate(value)}>{t(responseLabels[value])}</button>)}
      </div>
      {respond.isPending && <p role="status">{t("events.savingResponse")}</p>}
      {respond.isError && <p role="alert">{problemText(respond.error, t("events.responseProblem"), t)}{isUnknown(respond.error) ? ` ${t("events.chooseAgain")}` : ""}</p>}
    </div>}
    {!event.can_respond && event.my_response && <p className={styles.meta}>{t(event.my_response_outdated ? "events.yourResponseIsOutdated" : "events.yourResponseIs", { response: t(responseLabels[event.my_response]) })}</p>}
    {event.status === "scheduled" && !event.ended && <EventAlertChoice user={user} eventId={event.id} />}
    <h3>{t("events.responses")}</h3>
    <p className={styles.meta}>{t("events.counts", counts)}</p>
    <Places event={event} />
    {event.attendees && event.attendees.length > 0 ? <ul className={styles.attendees}>{event.attendees.map((person, index) => {
      const name = person.mine ? t("events.you") : person.name;
      return <li key={`${person.name}-${index}`}>{person.waitlist_position !== null
        ? t("events.attendeeWaiting", { name, place: person.waitlist_position })
        : t(person.outdated ? "events.attendeeOutdated" : "events.attendee", { name, response: t(responseLabels[person.response]) })}</li>;
    })}</ul>
      : <p className={styles.meta}>{t("events.noResponses")}</p>}
    {event.can_manage && <div className={styles.actions}>
      <button className="secondary-button" onClick={() => setEditing(event)}><Pencil size={16} aria-hidden />{t("events.edit")}</button>
      {!confirmCancel && <button className="secondary-button" onClick={() => setConfirmCancel(true)}><Ban size={16} aria-hidden />{t("events.cancel")}</button>}
    </div>}
    {confirmCancel && <div className={styles.confirm} role="group" aria-label={t("events.confirmCancellation")}>
      <p>{t("events.cancelText", { title: event.title, space: event.space_name })}</p>
      <button className="primary-button" disabled={cancel.isPending} onClick={() => cancel.mutate(event)}>{cancel.isPending ? t("events.cancelling") : t("events.cancelConfirm")}</button>
      <button className="secondary-button" disabled={cancel.isPending} onClick={() => { setConfirmCancel(false); cancel.reset(); }}>{t("events.keep")}</button>
      {cancel.isError && <p role="alert">{problemText(cancel.error, t("events.cancelProblem"), t)}{cancel.error && "code" in cancel.error && cancel.error.code === "EVENT_CHANGED" ? ` ${t("events.reviewLatest")}` : ""}</p>}
      {cancel.isError && <button className="text-button" onClick={() => { setConfirmCancel(false); cancel.reset(); void detail.refetch(); }}>{t("events.reload")}</button>}
    </div>}
    <EventBudget user={user} eventId={event.id} />
  </section>;
}

const blank = (zone: string): EventForm => ({ title: "", description: "", location: "", timezone: zone, local_start: "", local_end: "", capacity: "" });

// Places taken and the line when the event has a capacity, and the viewer's own place in that line (DEC-032).
function Places({ event }: { event: SpaceEvent }) {
  const t = useText();
  if (event.capacity === null) return null;
  return <>
    <p className={styles.meta}>{t("events.places", { going: event.going, capacity: event.capacity })}{event.waitlisted > 0 ? ` · ${t("events.waitlist", { count: event.waitlisted })}` : ""}</p>
    {event.my_waitlist_position !== null && <p className={styles.notice}>{t("events.yourPlace", { place: event.my_waitlist_position })}</p>}
  </>;
}

// The person's own alert before this event, in the app only. It follows the event if its time changes.
function EventAlertChoice({ user, eventId }: { user: Account; eventId: string }) {
  const queryClient = useQueryClient();
  const fieldId = useId();
  const current = useQuery({ queryKey: ["eventAlert", user.id, eventId], queryFn: ({ signal }) => eventAlert(user.id, eventId, signal) });
  const save = useMutation({
    mutationFn: (minutes: EventLead | null) => setEventAlert(user.id, eventId, minutes),
    onSuccess: minutes => { queryClient.setQueryData(["eventAlert", user.id, eventId], minutes); void queryClient.invalidateQueries({ queryKey: ["alerts", user.id] }); },
  });
  return <div className={styles.rsvp}>
    <h3 id={fieldId}>Remind me</h3>
    <select aria-labelledby={fieldId} name="event_alert" value={current.data ?? ""} disabled={current.isPending || save.isPending} onChange={change => save.mutate(change.target.value ? Number(change.target.value) as EventLead : null)}>
      <option value="">No alert</option>{eventLeads.map(lead => <option key={lead.minutes} value={lead.minutes}>{lead.label}</option>)}
    </select>
    <p className={styles.meta}>An alert in this app before it starts. Only you see it, and it follows the event if the time changes.</p>
    {save.isPending && <p role="status">Saving alert...</p>}
    {(current.isError || save.isError) && <p role="alert">{problemText(save.error ?? current.error, "The alert could not be saved.")}</p>}
  </div>;
}

function EventEditor({ user, spaceId, zone, existing: shown, onClose, onSaved, onReload, onGuard, readError }: {
  user: Account; spaceId: string; zone: string; existing?: SpaceEvent;
  onClose: () => void; onSaved: (event: SpaceEvent) => void; onReload?: () => void; onGuard: GuardChange; readError?: Error | null;
}) {
  const t = useText();
  // An edit is saved against the version the form was filled from, so a newer version is refused instead of overwritten.
  const [existing] = useState(shown);
  const formId = useId();
  const formElement = useRef<HTMLFormElement>(null);
  const [initialForm] = useState<EventForm>(() => existing ? formFromEvent(existing) : blank(""));
  const [form, setForm] = useState(initialForm);
  const [intent, setIntent] = useState<CreateIntent | null>(null);
  const [local, setLocal] = useState<EventFormProblems>({});
  const [focusField, setFocusField] = useState<keyof EventForm | null>(null);
  function showProblems(problems: EventFormProblems) {
    setLocal(problems);
    setFocusField(eventFields.find(field => problems[field]) ?? null);
  }
  const zoneList = useQuery({
    queryKey: ["timezones"],
    queryFn: ({ signal }) => api("timezones", z.array(z.string().min(1).max(64)).min(1), { signal }),
  });
  const zones = zoneList.data?.data;
  const selectedZone = useMemo(() => {
    if (!zones) return "";
    return eventTimezone(form.timezone || zone, zones) || (!form.timezone && zones.includes("UTC") ? "UTC" : "");
  }, [form.timezone, zone, zones]);
  const save = useMutation({
    mutationFn: (next: CreateIntent) => existing ? updateEvent(user.id, existing, next.body) : createEvent(next),
    onSuccess: event => { setIntent(null); onSaved(event); },
    onError: error => {
      const problems = serverFormProblems(error);
      if (Object.keys(problems).length) showProblems(problems);
    },
  });
  const set = (name: keyof EventForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const next = { ...form, [name]: event.target.value };
    setForm(next);
    if (Object.keys(local).length) setLocal(eventFormProblems({ ...next, timezone: name === "timezone" ? next.timezone : selectedZone }));
    if (save.isError && !isUnknown(save.error)) save.reset();
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    if (pendingSame && intent) { save.mutate(intent); return; }
    if (!zoneList.isSuccess) return;
    const submitted = { ...form, timezone: selectedZone };
    const problems = eventFormProblems(submitted);
    showProblems(problems);
    if (Object.keys(problems).length) return;
    const body = eventBody(submitted);
    // An unconfirmed create is retried with the same key and body so it cannot be created twice.
    const next = intent && sameBody(intent.body, body) ? intent : { accountId: user.id, spaceId, key: crypto.randomUUID(), body };
    setIntent(next);
    save.mutate(next);
  };
  const unknown = save.isError && isUnknown(save.error);
  const changed = save.error && "code" in save.error && save.error.code === "EVENT_CHANGED";
  const pendingSame = Boolean(intent && unknown && !existing);
  const dirty = !sameBody(eventBody(form), eventBody(initialForm));
  const leaveMessage = unknown ? t(existing ? "events.leaveEditConfirm" : "events.leaveConfirm") : dirty ? t("events.unsavedLeave") : null;
  const guard = { busy: save.isPending, message: leaveMessage };
  const hasProblems = Object.keys(local).length > 0;
  const fieldProblem = (name: keyof EventForm) => {
    const problem = local[name];
    const message = problem ? formProblems.get(problem) : undefined;
    return problem ? <p id={`${formId}-error-${name}`} className="field-error">{message ? t(message[0], message[1]) : problem}</p> : null;
  };
  const attributes = (name: keyof EventForm) => ({
    id: `${formId}-field-${name}`, name, "aria-invalid": Boolean(local[name]),
    "aria-describedby": [
      ["title", "location", "description"].includes(name) ? `${formId}-count-${name}` : "",
      name === "capacity" ? `${formId}-hint-capacity` : "",
      local[name] ? `${formId}-error-${name}` : "",
    ].filter(Boolean).join(" ") || undefined,
  });
  const counter = (name: "title" | "location" | "description", limit: number) => <p id={`${formId}-count-${name}`} className="field-hint">
    {t("events.characters", { count: characters(eventBody(form)[name]), limit })}
  </p>;
  useEffect(() => {
    if (!focusField || save.isPending) return;
    const field = formElement.current?.elements.namedItem(focusField);
    if (field instanceof HTMLElement) field.focus();
    setFocusField(null);
  }, [focusField, save.isPending]);
  useEffect(() => { onGuard({ busy: save.isPending, message: leaveMessage }); }, [save.isPending, leaveMessage, onGuard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  return <form ref={formElement} className={styles.panel} onSubmit={submit} aria-labelledby={`${formId}-title`} noValidate>
    <div className={styles.panelHeader}>
      <h2 id={`${formId}-title`}>{existing ? t("events.edit") : t("events.new")}</h2>
      <button type="button" className="icon-button" aria-label={t("events.closeForm")} title={t("events.closeForm")} disabled={save.isPending} onClick={() => { if (mayLeaveEditor(guard)) onClose(); }}><X size={18} aria-hidden /></button>
    </div>
    {readError && <p className="message error" role="alert">{t("events.draftRefreshProblem")}</p>}
    {hasProblems && <p className="message error" role="alert">{t("events.problem.summary")}</p>}
    <div className={styles.field}>
      <label htmlFor={`${formId}-field-title`}>{t("events.field.title")}</label>
      <input {...attributes("title")} value={form.title} maxLength={MAX_TITLE * 2} onChange={set("title")} disabled={save.isPending || pendingSame} required />
      {counter("title", MAX_TITLE)}{fieldProblem("title")}
    </div>
    <div className={styles.row}>
      <div className={styles.field}>
        <label htmlFor={`${formId}-field-local_start`}>{t("events.field.starts")}</label>
        <input {...attributes("local_start")} type="datetime-local" value={form.local_start} onChange={set("local_start")} disabled={save.isPending || pendingSame} required />
        {fieldProblem("local_start")}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${formId}-field-local_end`}>{t("events.field.ends")}</label>
        <input {...attributes("local_end")} type="datetime-local" value={form.local_end} onChange={set("local_end")} disabled={save.isPending || pendingSame} />
        {fieldProblem("local_end")}
      </div>
    </div>
    <div className={styles.field}>
      <label htmlFor={`${formId}-field-timezone`}>{t("events.field.zone")}</label>
      <select {...attributes("timezone")} value={pendingSame && intent ? intent.body.timezone : selectedZone} onChange={set("timezone")} aria-busy={zoneList.isPending} disabled={save.isPending || pendingSame || !zoneList.isSuccess}>
        {!selectedZone && !pendingSame && <option value="" disabled>{t("events.problem.zone")}</option>}
        {pendingSame && intent && !zones?.includes(intent.body.timezone) && <option value={intent.body.timezone}>{intent.body.timezone}</option>}
        {zones?.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      {fieldProblem("timezone")}
    </div>
    {zoneList.isError && <TimezoneListProblem retry={() => { void zoneList.refetch(); }} message={t("auth.timezoneProblem")} retryLabel={t("events.retry")} />}
    <div className={styles.field}>
      <label htmlFor={`${formId}-field-location`}>{t("events.field.location")}</label>
      <input {...attributes("location")} value={form.location} maxLength={MAX_LOCATION * 2} onChange={set("location")} disabled={save.isPending || pendingSame} />
      {counter("location", MAX_LOCATION)}{fieldProblem("location")}
    </div>
    <div className={styles.field}>
      <label htmlFor={`${formId}-field-description`}>{t("events.field.details")}</label>
      <textarea {...attributes("description")} value={form.description} rows={3} maxLength={MAX_DESCRIPTION * 2} onChange={set("description")} disabled={save.isPending || pendingSame} />
      {counter("description", MAX_DESCRIPTION)}{fieldProblem("description")}
    </div>
    <div className={styles.field}>
      <label htmlFor={`${formId}-field-capacity`}>{t("events.field.capacity")}</label>
      <input {...attributes("capacity")} inputMode="numeric" value={form.capacity} maxLength={6} onChange={set("capacity")} disabled={save.isPending || pendingSame} />
      <p id={`${formId}-hint-capacity`} className="field-hint">{t("events.capacityHint")}</p>
      {fieldProblem("capacity")}
    </div>
    <p className={styles.meta}>{t("events.visibility")}</p>
    {save.isError && !hasProblems && <p role="alert">{problemText(save.error, t("events.saveProblem"), t)}{pendingSame ? ` ${t("events.retrySame")}` : ""}</p>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={save.isPending || (!pendingSame && (!zoneList.isSuccess || !selectedZone))}>{save.isPending ? t("events.saving") : pendingSame ? t("events.retry") : existing ? t("events.saveChanges") : t("events.create")}</button>
      {pendingSame && <button type="button" className="secondary-button" onClick={() => { if (!mayLeaveEditor(guard)) return; setIntent(null); save.reset(); onClose(); }}>{t("events.closeAndCheck")}</button>}
      {changed && onReload && <button type="button" className="secondary-button" onClick={() => { if (mayLeaveEditor(guard)) onReload(); }}>{t("events.reload")}</button>}
    </div>
  </form>;
}
