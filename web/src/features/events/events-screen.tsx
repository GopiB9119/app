"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, CalendarPlus, LoaderCircle, MapPin, Pencil, RefreshCw, UsersRound, X } from "lucide-react";

import { api } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { spacesSchema } from "@/features/spaces/client";
import { eventAlert, eventLeads, setEventAlert } from "@/features/notifications/alerts-client";
import type { EventLead } from "@/features/notifications/alerts-client";
import {
  MAX_DESCRIPTION, MAX_LOCATION, MAX_TITLE, RESPONSES, RESPONSE_LABELS, browserZone, cancelEvent, createEvent, eventBody,
  formFromEvent, formProblem, formatWhen, listEvents, readEvent, respondToEvent, sameBody, updateEvent, zoneOptions,
} from "./client";
import type { CreateIntent, EventForm, EventResponse, SpaceEvent } from "./client";
import styles from "./events.module.css";

type When = "upcoming" | "past";

export function EventsScreen({ initialSpaceId }: { initialSpaceId: string }) {
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading events</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>Events unavailable</h1><p role="alert">{problemText(viewer.error, "Events could not load.")}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />Retry</button></main></Shell>;
  }
  return <Events key={viewer.account.id} user={viewer.account} initialSpaceId={initialSpaceId} />;
}

function Events({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const queryClient = useQueryClient();
  const zone = useMemo(browserZone, []);
  const [chosenSpace, setChosenSpace] = useState(initialSpaceId);
  const [when, setWhen] = useState<When>("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // True while a new event is being saved or its save is unconfirmed: leaving the form then loses its retry key.
  const [held, setHeld] = useState(false);
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  const spaceList = spaces.data?.data ?? [];
  const spaceId = spaceList.some(space => space.id === chosenSpace) ? chosenSpace : spaceList[0]?.id ?? "";
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
  const mayLeave = () => !held || window.confirm("This event may already be saved. Leaving the form loses its Retry, and creating it again could make a duplicate. Leave anyway?");
  const chooseSpace = (value: string) => { if (!mayLeave()) return; setChosenSpace(value); setSelectedId(null); setCreating(false); };

  return <Shell account>
    <main className={styles.main}>
      <header className={styles.header}>
        <div><h1>Events</h1><p>Plans shared with the current members of a Space. A response says what you intend; it is not a check-in.</p></div>
        {spaceId && !creating && <button className="primary-button" onClick={() => { setCreating(true); setSelectedId(null); }}><CalendarPlus size={18} aria-hidden />New event</button>}
      </header>
      {spaces.isPending && <p aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading your Spaces</p>}
      {spaces.isError && <div className="message error" role="alert">{problemText(spaces.error, "Your Spaces could not load.")}<button className="text-button" onClick={() => spaces.refetch()}><RefreshCw size={16} aria-hidden />Retry</button></div>}
      {spaces.isSuccess && spaceList.length === 0 && <p className={styles.empty}>Create or join a Space first. <Link href="/app/spaces">Go to your Spaces</Link></p>}
      {spaceList.length > 0 && <div className={styles.controls}>
        <label className={styles.field}>Space<select aria-label="Space" value={spaceId} onChange={event => chooseSpace(event.target.value)}>
          {spaceList.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
        </select></label>
        <div className={styles.tabs} role="group" aria-label="Show events">
          {(["upcoming", "past"] as const).map(value => <button key={value} className={styles.tab} aria-pressed={when === value} onClick={() => { setWhen(value); setSelectedId(null); }}>{value === "upcoming" ? "Upcoming" : "Past"}</button>)}
        </div>
      </div>}
      {creating && spaceId && <EventEditor user={user} spaceId={spaceId} zone={zone} onHold={setHeld} onClose={() => { setCreating(false); refresh(); }} onSaved={event => { setCreating(false); setWhen("upcoming"); setSelectedId(event.id); refresh(); }} />}
      {selectedId && <EventPanel key={selectedId} user={user} eventId={selectedId} zone={zone} onClose={() => setSelectedId(null)} onChanged={refresh} />}
      {spaceId && <section aria-labelledby="event-list-title">
        <h2 id="event-list-title" className={styles.listTitle}>{when === "upcoming" ? "Upcoming events" : "Past events"}</h2>
        {list.isPending && <p aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading events</p>}
        {list.isError && <div className="message error" role="alert">{problemText(list.error, "Events could not load.")}<button className="text-button" onClick={() => list.refetch()}><RefreshCw size={16} aria-hidden />Retry</button></div>}
        {list.isSuccess && events.length === 0 && <p className={styles.empty}>{when === "upcoming" ? "No upcoming events. Events created before you joined this Space are not shown." : "No past events."}</p>}
        <ul className={styles.list}>{events.map(event => {
          const whenText = formatWhen(event, zone);
          return <li key={event.id} className={styles.card}>
            <button className={styles.cardButton} aria-pressed={selectedId === event.id} onClick={() => { if (creating && !mayLeave()) return; setSelectedId(event.id); setCreating(false); }}>
              <span className={styles.cardTitle}>{event.title}</span>
              {event.status === "cancelled" && <span className={styles.badge}>Cancelled</span>}
            </button>
            <p className={styles.meta}><CalendarClock size={15} aria-hidden />{whenText.main}</p>
            {event.location && <p className={styles.meta}><MapPin size={15} aria-hidden />{event.location}</p>}
            <p className={styles.meta}><UsersRound size={15} aria-hidden />Going {event.going} · Maybe {event.maybe} · Not going {event.not_going}{event.my_response ? ` · You: ${RESPONSE_LABELS[event.my_response]}` : ""}</p>
          </li>;
        })}</ul>
        {list.hasNextPage && <button className="secondary-button" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading..." : "Show more"}</button>}
      </section>}
    </main>
  </Shell>;
}

function EventPanel({ user, eventId, zone, onClose, onChanged }: { user: Account; eventId: string; zone: string; onClose: () => void; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const detail = useQuery({ queryKey: ["event", user.id, eventId], queryFn: ({ signal }) => readEvent(user.id, eventId, signal) });
  // A read that started before the change would otherwise land afterwards and show the old event again.
  const store = async (event: SpaceEvent) => {
    await queryClient.cancelQueries({ queryKey: ["event", user.id, eventId] });
    queryClient.setQueryData(["event", user.id, eventId], event);
    onChanged();
  };
  const respond = useMutation({ mutationFn: (response: EventResponse) => respondToEvent(user.id, eventId, response), onSuccess: store });
  const cancel = useMutation({ mutationFn: (event: SpaceEvent) => cancelEvent(user.id, event), onSuccess: event => { setConfirmCancel(false); return store(event); } });
  useEffect(() => {
    const problem = detail.error ?? respond.error ?? cancel.error;
    if (sessionLost(problem)) { queryClient.clear(); window.location.replace("/login"); }
  }, [detail.error, respond.error, cancel.error, queryClient]);
  if (detail.isPending) return <section className={styles.panel} aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading event</section>;
  if (detail.isError) {
    return <section className={styles.panel}><p role="alert">{problemText(detail.error, "This event could not load.")}</p>
      <button className="secondary-button" onClick={() => detail.refetch()}><RefreshCw size={16} aria-hidden />Retry</button>
      <button className="text-button" onClick={onClose}>Close</button></section>;
  }
  const event = detail.data;
  const whenText = formatWhen(event, zone);
  if (editing) {
    return <EventEditor user={user} spaceId={event.space_id} zone={zone} existing={event}
      onClose={() => setEditing(false)} onReload={() => { setEditing(false); void detail.refetch(); }}
      onSaved={saved => { setEditing(false); void store(saved); }} />;
  }
  return <section className={styles.panel} aria-labelledby={titleId}>
    <div className={styles.panelHeader}>
      <h2 id={titleId}>{event.title}</h2>
      <button className="icon-button" aria-label="Close event" title="Close event" onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    {event.status === "cancelled" && <p className={styles.notice} role="status">This event was cancelled. Responses can no longer change.</p>}
    {event.status === "scheduled" && event.ended && <p className={styles.notice}>This event has ended.</p>}
    <p className={styles.meta}><CalendarClock size={15} aria-hidden />{whenText.main}</p>
    {whenText.yours && <p className={styles.meta}>{whenText.yours}</p>}
    {event.location && <p className={styles.meta}><MapPin size={15} aria-hidden />{event.location}</p>}
    {event.description && <p className={styles.description}>{event.description}</p>}
    <p className={styles.meta}>In {event.space_name}. Organized by {event.created_by_name || "a former member"}.{event.schedule_changed_at ? " The time was changed after creation." : ""}</p>
    {event.can_respond && <div className={styles.rsvp}>
      <h3>Your response</h3>
      {event.my_response_outdated && <p className={styles.notice} role="status">The time changed after you responded. Choose your response again to confirm it.</p>}
      <div className={styles.tabs} role="group" aria-label="Your response">
        {RESPONSES.map(value => <button key={value} className={styles.tab} aria-pressed={event.my_response === value && !event.my_response_outdated}
          disabled={respond.isPending} onClick={() => respond.mutate(value)}>{RESPONSE_LABELS[value]}</button>)}
      </div>
      {respond.isPending && <p role="status">Saving your response...</p>}
      {respond.isError && <p role="alert">{problemText(respond.error, "Your response was not saved.")}{isUnknown(respond.error) ? " Choose again to retry." : ""}</p>}
    </div>}
    {!event.can_respond && event.my_response && <p className={styles.meta}>Your response: {RESPONSE_LABELS[event.my_response]}{event.my_response_outdated ? " (before the time changed)" : ""}</p>}
    {event.status === "scheduled" && !event.ended && <EventAlertChoice user={user} eventId={event.id} />}
    <h3>Responses</h3>
    <p className={styles.meta}>Going {event.going} · Maybe {event.maybe} · Not going {event.not_going}</p>
    {event.attendees && event.attendees.length > 0 ? <ul className={styles.attendees}>{event.attendees.map((person, index) =>
      <li key={`${person.name}-${index}`}>{person.mine ? "You" : person.name}: {RESPONSE_LABELS[person.response]}{person.outdated ? " (before the time changed)" : ""}</li>)}</ul>
      : <p className={styles.meta}>No responses yet.</p>}
    {event.can_manage && <div className={styles.actions}>
      <button className="secondary-button" onClick={() => setEditing(true)}><Pencil size={16} aria-hidden />Edit event</button>
      {!confirmCancel && <button className="secondary-button" onClick={() => setConfirmCancel(true)}><Ban size={16} aria-hidden />Cancel event</button>}
    </div>}
    {confirmCancel && <div className={styles.confirm} role="group" aria-label="Confirm cancellation">
      <p>Cancel &quot;{event.title}&quot; for everyone in {event.space_name}? Responses will stop and this cannot be undone.</p>
      <button className="primary-button" disabled={cancel.isPending} onClick={() => cancel.mutate(event)}>{cancel.isPending ? "Cancelling..." : "Yes, cancel event"}</button>
      <button className="secondary-button" disabled={cancel.isPending} onClick={() => { setConfirmCancel(false); cancel.reset(); }}>Keep event</button>
      {cancel.isError && <p role="alert">{problemText(cancel.error, "The event was not cancelled.")}{cancel.error && "code" in cancel.error && cancel.error.code === "EVENT_CHANGED" ? " Reload to review the latest version." : ""}</p>}
      {cancel.isError && <button className="text-button" onClick={() => { setConfirmCancel(false); cancel.reset(); void detail.refetch(); }}>Reload event</button>}
    </div>}
  </section>;
}

const blank = (zone: string): EventForm => ({ title: "", description: "", location: "", timezone: zone, local_start: "", local_end: "" });

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

function EventEditor({ user, spaceId, zone, existing: shown, onClose, onSaved, onReload, onHold }: {
  user: Account; spaceId: string; zone: string; existing?: SpaceEvent;
  onClose: () => void; onSaved: (event: SpaceEvent) => void; onReload?: () => void; onHold?: (held: boolean) => void;
}) {
  // An edit is saved against the version the form was filled from, so a newer version is refused instead of overwritten.
  const [existing] = useState(shown);
  const formId = useId();
  const [form, setForm] = useState<EventForm>(() => existing ? formFromEvent(existing) : blank(zone));
  const [intent, setIntent] = useState<CreateIntent | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const zones = useMemo(() => zoneOptions(form.timezone), [form.timezone]);
  const save = useMutation({
    mutationFn: (next: CreateIntent) => existing ? updateEvent(user.id, existing, next.body) : createEvent(next),
    onSuccess: event => { setIntent(null); onSaved(event); },
  });
  const set = (name: keyof EventForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(current => ({ ...current, [name]: event.target.value }));
    setLocal(null);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = formProblem(form);
    setLocal(problem);
    if (problem || save.isPending) return;
    const body = eventBody(form);
    // An unconfirmed create is retried with the same key and body so it cannot be created twice.
    const next = intent && sameBody(intent.body, body) ? intent : { accountId: user.id, spaceId, key: crypto.randomUUID(), body };
    setIntent(next);
    save.mutate(next);
  };
  const unknown = save.isError && isUnknown(save.error);
  const changed = save.error && "code" in save.error && save.error.code === "EVENT_CHANGED";
  const pendingSame = Boolean(intent && unknown && !existing);
  const holding = save.isPending || pendingSame;
  useEffect(() => { onHold?.(holding); }, [holding, onHold]);
  useEffect(() => () => onHold?.(false), [onHold]);
  return <form className={styles.panel} onSubmit={submit} aria-labelledby={`${formId}-title`} noValidate>
    <div className={styles.panelHeader}>
      <h2 id={`${formId}-title`}>{existing ? "Edit event" : "New event"}</h2>
      <button type="button" className="icon-button" aria-label="Close form" title="Close form" disabled={save.isPending} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    <label className={styles.field}>Title<input value={form.title} maxLength={MAX_TITLE * 2} onChange={set("title")} disabled={save.isPending || pendingSame} required /></label>
    <div className={styles.row}>
      <label className={styles.field}>Starts<input type="datetime-local" value={form.local_start} onChange={set("local_start")} disabled={save.isPending || pendingSame} required /></label>
      <label className={styles.field}>Ends (optional)<input type="datetime-local" value={form.local_end} onChange={set("local_end")} disabled={save.isPending || pendingSame} /></label>
    </div>
    <label className={styles.field}>Time zone<select aria-label="Time zone" value={form.timezone} onChange={set("timezone")} disabled={save.isPending || pendingSame}>
      {zones.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <label className={styles.field}>Location (optional)<input value={form.location} maxLength={MAX_LOCATION * 2} onChange={set("location")} disabled={save.isPending || pendingSame} /></label>
    <label className={styles.field}>Details (optional)<textarea value={form.description} rows={3} maxLength={MAX_DESCRIPTION * 2} onChange={set("description")} disabled={save.isPending || pendingSame} /></label>
    <p className={styles.meta}>Visible to current members of this Space. People who join later will not see it.</p>
    {local && <p role="alert">{local}</p>}
    {save.isError && <p role="alert">{problemText(save.error, "The event was not saved.")}{pendingSame ? " Retry sends the same event; it will not be created twice." : ""}</p>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : pendingSame ? "Retry" : existing ? "Save changes" : "Create event"}</button>
      {pendingSame && <button type="button" className="secondary-button" onClick={() => { setIntent(null); save.reset(); onClose(); }}>Close and check the list</button>}
      {changed && onReload && <button type="button" className="secondary-button" onClick={onReload}>Reload event</button>}
    </div>
  </form>;
}
