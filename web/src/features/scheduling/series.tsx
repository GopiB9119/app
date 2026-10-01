"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CalendarClock, Check, LoaderCircle, Pause, Pencil, Play, RefreshCw, Repeat, SkipForward, X } from "lucide-react";
import { api, ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { dateInZone } from "@/features/planning/calendar-client";
import { commandSeries, describeRule, moveSeries, offsetLabel, previewSeries, replaceSeries, saveSeries, seriesPage, seriesReason, seriesStatusLabels, weekdayLabels, weekdayNames } from "./client";
import type { ReminderSeries, ReminderSeriesPreview, SeriesCommandIntent, SeriesIntent, SeriesMoveIntent, SeriesOperation, SeriesRule, Weekday } from "./client";
import { displayInstant, protectedReminderError, ReminderDialog } from "./reminder-common";
import styles from "./reminders.module.css";

function addDays(day: string, days: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatLocalDate(day: string) {
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${day}T12:00:00Z`));
}

function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}

const adjustmentNotes = {
  none: "", shifted_forward: "The clock skips this time, so it reminds just after the jump.",
  repeated_time_first: "The clock repeats this time, so it reminds once, the first time.",
  moved: "You moved this time.",
};
const changeNotes = { shifted_forward: "moves past the clock change", repeated_time_first: "reminds once, the first time", skipped: "no reminder" };

export function SeriesForm({ user, taskId, frequency, zones, disabled, onLocked, onDenied, onSaved, replacing, onCancel }: {
  user: Account; taskId: string; frequency: "daily" | "weekly"; zones: string[]; disabled: boolean;
  onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onSaved: (result: ReminderSeries) => Promise<void>;
  replacing?: ReminderSeries; onCancel?: () => void;
}) {
  const fieldId = useId();
  const today = dateInZone(new Date(), user.timezone);
  // A change starts from the current rule; a series that began earlier continues from today.
  const firstDay = replacing && replacing.start_date > today ? replacing.start_date : today;
  const [time, setTime] = useState(replacing?.local_time ?? "");
  const [timezone, setTimezone] = useState(replacing?.timezone ?? user.timezone);
  const [start, setStart] = useState(firstDay);
  const [end, setEnd] = useState(replacing && replacing.end_date >= firstDay && replacing.end_date <= addDays(firstDay, 365) ? replacing.end_date : addDays(firstDay, 29));
  const [every, setEvery] = useState(String(replacing?.repeat_every ?? 1));
  const [days, setDays] = useState<Weekday[]>(replacing?.weekdays ?? []);
  const [review, setReview] = useState<{ rule: SeriesRule; preview: ReminderSeriesPreview } | null>(null);
  const [intent, setIntent] = useState<SeriesIntent | null>(null);
  const [error, setError] = useState("");
  const rule = (policy: SeriesRule["clock_change_policy"]): SeriesRule => ({
    frequency, repeat_every: Number(every), weekdays: frequency === "weekly" ? weekdayNames.filter(day => days.includes(day)) : [],
    local_time: time.slice(0, 5), timezone, start_date: start, end_date: end, clock_change_policy: policy,
  });
  const preview = useMutation({
    mutationFn: (value: SeriesRule) => previewSeries(user.id, taskId, value, replacing?.id),
    onSuccess: (result, value) => { setReview({ rule: value, preview: result }); setError(""); },
    onError: problem => { setError(problem.message); if (protectedReminderError(problem)) onDenied(problem); },
  });
  const save = useMutation({
    mutationFn: (command: SeriesIntent) => replacing
      ? replaceSeries({ accountId: command.accountId, series: replacing, previewToken: command.previewToken, key: command.key, rule: command.rule })
      : saveSeries(command),
    onSuccess: async result => { setIntent(null); setReview(null); setTime(""); setError(""); await onSaved(result); },
    onError: problem => {
      setError(problem.message);
      if (protectedReminderError(problem)) onDenied(problem);
      if (problem instanceof ApiError && problem.status >= 400 && problem.status < 500 && problem.status !== 408) { setIntent(null); setReview(null); }
    },
  });
  const ownLocked = preview.isPending || save.isPending || intent !== null;
  const locked = ownLocked || disabled;
  useEffect(() => { onLocked(ownLocked || review !== null); return () => onLocked(false); }, [ownLocked, review, onLocked]);
  useLeaveWarning(intent !== null);
  const latestEnd = addDays(start || today, 365);
  const most = frequency === "weekly" ? 4 : 30;
  const valid = /^\d{2}:\d{2}/.test(time) && !!start && !!end && end >= start && end <= latestEnd
    && Number.isInteger(Number(every)) && Number(every) >= 1 && Number(every) <= most && (frequency === "daily" || days.length > 0);
  if (review) {
    const result = review.preview;
    const skips = result.clock_changes.some(change => change.change !== "repeated_time_first");
    return <section className={styles.review} aria-labelledby={`${fieldId}-review`}>
      <h3 id={`${fieldId}-review`}>{replacing ? "Review the change" : "Review repeating reminder"}</h3>
      <dl className={styles.facts}>
        <dt>Task</dt><dd>{result.task_title}</dd><dt>Recipient</dt><dd>{result.recipient.display_name} (you)</dd>
        <dt>Repeats</dt><dd>{describeRule(result)}</dd><dt>From</dt><dd>{formatLocalDate(result.start_date)}</dd>
        <dt>Until</dt><dd>{formatLocalDate(result.end_date)}</dd><dt>Timezone</dt><dd>{result.timezone}</dd>
        <dt>Reminders</dt><dd>{result.occurrence_count}</dd><dt>Channel</dt><dd>In-app only</dd>
      </dl>
      <h4 className={styles.subheading}>First times</h4>
      <ol className={styles.occurrences}>{result.occurrences.map(item => <li key={item.local_date}>
        <strong>{formatLocalDate(item.local_date)}, {item.display_time}</strong>
        <small>{offsetLabel(item.utc_offset_minutes)} / {item.scheduled_at.replace("T", " ")}</small>
        {adjustmentNotes[item.adjustment] && <small>{adjustmentNotes[item.adjustment]}</small>}
      </li>)}</ol>
      {result.clock_changes.length > 0 && <p className={styles.disclosure}>Clock changes: {result.clock_changes.map(change => `${formatLocalDate(change.local_date)} ${changeNotes[change.change]}`).join("; ")}.</p>}
      {skips && <fieldset className={styles.options} disabled={locked}><legend>When the clock skips {result.local_time}</legend>
        <label className={styles.option}><input type="radio" name={`${fieldId}-policy`} checked={result.clock_change_policy === "shift_forward"} onChange={() => preview.mutate({ ...review.rule, clock_change_policy: "shift_forward" })} /><span><strong>Remind after the jump</strong><small>For example, 02:30 becomes 03:30 that day.</small></span></label>
        <label className={styles.option}><input type="radio" name={`${fieldId}-policy`} checked={result.clock_change_policy === "skip"} onChange={() => preview.mutate({ ...review.rule, clock_change_policy: "skip" })} /><span><strong>Skip that day</strong><small>No reminder on the day the clock skips this time.</small></span></label>
      </fieldset>}
      <p className={styles.disclosure}>Only the next reminder is scheduled at any time. If the task changes or closes, the series pauses until you review and resume it. No push alert or external message.</p>
      {replacing && <p className={styles.disclosure}>Saving stops the current repeating reminder, including its next reminder and any waiting snooze, and starts this one. Reminders already in your inbox stay.</p>}
      <div className={styles.actions}>
        <button className="secondary-button" disabled={locked} onClick={() => setReview(null)}>Change</button>
        <button className="primary-button" disabled={save.isPending || preview.isPending || disabled} onClick={() => {
          const command = intent ?? { accountId: user.id, taskId, key: crypto.randomUUID(), previewToken: result.preview_token, rule: review.rule };
          setIntent(command); setError(""); save.mutate(command);
        }}>{save.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : <Check size={17} />}{intent && !save.isPending ? "Retry original save" : replacing ? "Save change" : "Save repeating reminder"}</button>
      </div>
      {error && <p className="message error" role="alert">{error}</p>}
    </section>;
  }
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!valid) return; setError(""); preview.mutate(rule("shift_forward")); }}>
    <div className={styles.fieldRow}>
      <label>Time<input name="series_local_time" type="time" required step={60} value={time} disabled={locked} onChange={event => { setTime(event.target.value); setError(""); }} /></label>
      <label>{frequency === "weekly" ? "Every (weeks)" : "Every (days)"}<input name="series_repeat_every" type="number" inputMode="numeric" min={1} max={most} required value={every} disabled={locked} onChange={event => { setEvery(event.target.value); setError(""); }} /></label>
    </div>
    {frequency === "weekly" && <fieldset className={styles.weekdays} disabled={locked}><legend>Weekdays</legend>{weekdayNames.map(day => <label key={day}>
      <input type="checkbox" name={`series_weekday_${day}`} checked={days.includes(day)} onChange={event => { const checked = event.target.checked; setDays(current => checked ? [...current, day] : current.filter(item => item !== day)); setError(""); }} />{weekdayLabels[day]}
    </label>)}</fieldset>}
    <div className={styles.fieldRow}>
      <label>First day<input name="series_start_date" type="date" required min={today} value={start} disabled={locked} onChange={event => { setStart(event.target.value); setError(""); }} /></label>
      <label>Last day<input name="series_end_date" type="date" required min={start} max={latestEnd} value={end} disabled={locked} onChange={event => { setEnd(event.target.value); setError(""); }} /></label>
    </div>
    <label><span id={`${fieldId}-zone`}>Timezone</span><select aria-labelledby={`${fieldId}-zone`} name="series_timezone" value={timezone} disabled={locked} onChange={event => { setTimezone(event.target.value); setError(""); }}>{zones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>
    <p className={styles.disclosure}>Up to one year. The last day can be at most 365 days after the first.</p>
    <div className={styles.actions}>
      {onCancel && <button type="button" className="secondary-button" disabled={locked} onClick={onCancel}>Keep as is</button>}
      <button className="primary-button" type="submit" disabled={locked || !valid}>{preview.isPending ? <LoaderCircle size={17} className="spin" /> : <Repeat size={17} />}{replacing ? "Review change" : "Review repeating reminder"}</button>
    </div>
    {error && <p className="message error" role="alert">{error}</p>}
  </form>;
}

const titles: Record<SeriesOperation, string> = {
  pause: "Pause this repeating reminder?", resume: "Resume this repeating reminder?", skip: "Skip the next reminder?", cancel: "Cancel this repeating reminder?",
};
const explanations: Record<SeriesOperation, string> = {
  pause: "No reminders until you resume it. Reminders already in your inbox stay, and a waiting snooze still arrives.",
  resume: "Reminders continue from the next time after now. Resuming confirms the task as it is now.",
  skip: "Only the next reminder is skipped. The series continues after it.",
  cancel: "Stops all future reminders of this series, including a waiting snooze. Reminders already in your inbox stay.",
};
const confirmations: Record<SeriesOperation, string> = { pause: "Pause", resume: "Resume", skip: "Skip next reminder", cancel: "Cancel repeating reminder" };

function outcome(result: ReminderSeries, operation: SeriesOperation) {
  if (result.status === "ended") return "No reminder times remain, so the repeating reminder ended.";
  return { pause: "Repeating reminder paused.", resume: "Repeating reminder resumed.", skip: "Next reminder skipped.", cancel: "Repeating reminder cancelled." }[operation];
}

export function SeriesList({ user, taskId, disabled, onLocked, onDenied, onNotice }: {
  user: Account; taskId: string; disabled: boolean; onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onNotice: (message: string) => void;
}) {
  const client = useQueryClient();
  const titleId = useId();
  const [selection, setSelection] = useState<{ series: ReminderSeries; operation: SeriesOperation } | null>(null);
  const [intent, setIntent] = useState<SeriesCommandIntent | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ReminderSeries | null>(null);
  const [editFrequency, setEditFrequency] = useState<"daily" | "weekly">("daily");
  const [editLocked, setEditLocked] = useState(false);
  const [moving, setMoving] = useState<ReminderSeries | null>(null);
  const [moveTime, setMoveTime] = useState("");
  const [moveIntent, setMoveIntent] = useState<SeriesMoveIntent | null>(null);
  const zones = useQuery({ queryKey: ["timezones"], queryFn: ({ signal }) => api("timezones", z.array(z.string()), { signal }) });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["reminderSeries", user.id] });
    await client.invalidateQueries({ queryKey: ["reminders", user.id] });
  };
  const records = useInfiniteQuery({
    queryKey: ["reminderSeries", user.id, taskId], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => seriesPage(user.id, taskId || undefined, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
  });
  const command = useMutation({
    mutationFn: commandSeries,
    onSuccess: async (result, sent) => {
      setIntent(null); setSelection(null); setError(""); onNotice(outcome(result, sent.operation));
      await client.invalidateQueries({ queryKey: ["reminderSeries", user.id] });
      await client.invalidateQueries({ queryKey: ["reminders", user.id] });
    },
    onError: problem => {
      setError(problem.message);
      if (protectedReminderError(problem)) onDenied(problem);
      if (problem instanceof ApiError && problem.status >= 400 && problem.status < 500 && problem.status !== 408) {
        setIntent(null);
        setSelection(null);
        void records.refetch();
      }
    },
  });
  const move = useMutation({
    mutationFn: moveSeries,
    onSuccess: async result => {
      setMoveIntent(null); setMoving(null); setError(""); onNotice(`Next reminder moved to ${result.next_occurrence?.display_time ?? "the new time"}.`);
      await refresh();
    },
    onError: problem => {
      setError(problem.message);
      if (protectedReminderError(problem)) onDenied(problem);
      if (problem instanceof ApiError && problem.status >= 400 && problem.status < 500 && problem.status !== 408) {
        setMoveIntent(null);
        // A time that cannot be used keeps the dialog open; a changed reminder needs a fresh look.
        if (problem.status !== 422) { setMoving(null); void records.refetch(); }
      }
    },
  });
  const locked = command.isPending || intent !== null || move.isPending || moveIntent !== null;
  useEffect(() => { onLocked(selection !== null || locked || editing !== null || moving !== null); return () => onLocked(false); }, [selection, locked, editing, moving, onLocked]);
  useEffect(() => { if (records.error && protectedReminderError(records.error)) onDenied(records.error); }, [records.error, onDenied]);
  useLeaveWarning(intent !== null || moveIntent !== null);
  const rows = [...new Map(records.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];
  const open = (series: ReminderSeries, operation: SeriesOperation) => { command.reset(); setError(""); setSelection({ series, operation }); };
  const close = () => { setSelection(null); setError(""); };
  const openMove = (series: ReminderSeries) => { move.reset(); setError(""); setMoveTime(series.next_occurrence?.display_time ?? ""); setMoving(series); };
  const closeMove = () => { setMoving(null); setError(""); };
  const busy = disabled || locked || !!selection || !!editing || !!moving;
  return <section className={styles.requests} aria-labelledby={titleId}>
    <div className={styles.sectionHeading}><h2 id={titleId}>Repeating reminders</h2><button className="icon-button" aria-label="Refresh repeating reminders" title="Refresh repeating reminders" disabled={busy || records.isFetching} onClick={() => records.refetch()}><RefreshCw size={18} className={records.isFetching ? "spin" : ""} /></button></div>
    {records.isPending && <p role="status">Loading repeating reminders...</p>}
    {(records.error || (error && !selection && !moving)) && <p className="message error" role="alert">{records.error?.message ?? error}</p>}
    {!records.isPending && !records.isError && rows.length === 0 && <p className={styles.empty}>No repeating reminders{taskId ? " for this task" : ""}.</p>}
    {!records.isError && <ul className={styles.list}>{rows.map(item => <li key={item.id}>
      <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{seriesStatusLabels[item.status]}</span></div>
      <span>{describeRule(item)}</span>
      <span className={styles.zone}>{formatLocalDate(item.start_date)} to {formatLocalDate(item.end_date)} / {item.timezone}</span>
      {item.next_occurrence && <p className={styles.next}>{item.next_occurrence.adjustment === "moved" ? "Next (moved): " : "Next: "}<time dateTime={item.next_occurrence.scheduled_at}>{displayInstant(item.next_occurrence.scheduled_at, item.timezone)}</time></p>}
      {item.replaced_by && <p className={styles.reason}>Replaced by a changed repeating reminder.</p>}
      {item.reason && <p className={styles.reason}>{seriesReason(item.reason)}</p>}
      {item.status === "active" && item.source_changed && <p className={styles.reason}>Task changed since review. The next reminder will pause this series.</p>}
      <div className={styles.actions}><Link href={`/app/reminders?task_id=${item.task_id}`}>Task reminders</Link>
        {item.status === "active" && item.next_occurrence && <button className="secondary-button" aria-label={`Move next reminder: ${item.task_title}`} disabled={busy} onClick={() => openMove(item)}><CalendarClock size={17} />Move next</button>}
        {item.status === "active" && item.next_occurrence && <button className="secondary-button" aria-label={`Skip next reminder: ${item.task_title}`} disabled={busy} onClick={() => open(item, "skip")}><SkipForward size={17} />Skip next</button>}
        {(item.status === "active" || item.status === "paused") && <button className="secondary-button" aria-label={`Change repeating reminder: ${item.task_title}`} disabled={busy} onClick={() => { setError(""); setEditFrequency(item.frequency); setEditing(item); }}><Pencil size={17} />Change</button>}
        {item.status === "active" && <button className="secondary-button" aria-label={`Pause repeating reminder: ${item.task_title}`} disabled={busy} onClick={() => open(item, "pause")}><Pause size={17} />Pause</button>}
        {item.status === "paused" && <button className="secondary-button" aria-label={`Resume repeating reminder: ${item.task_title}`} disabled={busy} onClick={() => open(item, "resume")}><Play size={17} />Resume</button>}
        {(item.status === "active" || item.status === "paused") && <button className="secondary-button" aria-label={`Cancel repeating reminder: ${item.task_title}`} disabled={busy} onClick={() => open(item, "cancel")}><X size={17} />Cancel</button>}
      </div>
    </li>)}</ul>}
    {records.hasNextPage && <button className="text-button" disabled={busy || records.isFetching} onClick={() => records.fetchNextPage()}>Load more repeating reminders</button>}
    {selection && <ReminderDialog title={titles[selection.operation]} locked={locked} onClose={close}>
      <p className={styles.reviewTitle}>{selection.series.task_title}</p>
      <dl className={styles.facts}>
        <dt>Repeats</dt><dd>{describeRule(selection.series)}</dd><dt>Timezone</dt><dd>{selection.series.timezone}</dd>
        {selection.series.next_occurrence && <><dt>Next</dt><dd>{displayInstant(selection.series.next_occurrence.scheduled_at, selection.series.timezone)}</dd></>}
        <dt>Until</dt><dd>{formatLocalDate(selection.series.end_date)}</dd>
      </dl>
      <p className={styles.disclosure}>{explanations[selection.operation]}</p>
      {error && <p className="message error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={locked} onClick={close}>Keep as is</button>
        <button className="primary-button" disabled={command.isPending} onClick={() => {
          const next = intent ?? { accountId: user.id, series: selection.series, operation: selection.operation, key: crypto.randomUUID() };
          setIntent(next); setError(""); command.mutate(next);
        }}>{command.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : <Check size={17} />}{intent && !command.isPending ? "Retry original change" : confirmations[selection.operation]}</button>
      </div>
    </ReminderDialog>}
    {editing && <ReminderDialog title="Change repeating reminder" locked={editLocked} onClose={() => setEditing(null)}>
      <p className={styles.reviewTitle}>{editing.task_title}</p>
      <p className={styles.disclosure}>Now: {describeRule(editing)} in {editing.timezone}, until {formatLocalDate(editing.end_date)}.</p>
      <label><span id={`${titleId}-repeat`}>Repeat</span><select aria-labelledby={`${titleId}-repeat`} name="series_change_repeat" value={editFrequency} disabled={editLocked} onChange={event => setEditFrequency(event.target.value === "weekly" ? "weekly" : "daily")}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
      <SeriesForm key={editFrequency} user={user} taskId={editing.task_id} frequency={editFrequency} zones={zones.data?.data ?? [user.timezone]}
        disabled={false} onLocked={setEditLocked} onDenied={onDenied} replacing={editing} onCancel={() => setEditing(null)}
        onSaved={async () => { setEditing(null); setEditLocked(false); onNotice("Repeating reminder changed."); await refresh(); }} />
    </ReminderDialog>}
    {moving?.next_occurrence && <ReminderDialog title="Move the next reminder?" locked={move.isPending || moveIntent !== null} onClose={closeMove}>
      <p className={styles.reviewTitle}>{moving.task_title}</p>
      <dl className={styles.facts}>
        <dt>Now</dt><dd>{displayInstant(moving.next_occurrence.scheduled_at, moving.timezone)}</dd>
        <dt>Day</dt><dd>{formatLocalDate(moving.next_occurrence.local_date)}</dd><dt>Timezone</dt><dd>{moving.timezone}</dd>
      </dl>
      <label>New time<input name="series_move_time" type="time" required step={60} value={moveTime} disabled={move.isPending || moveIntent !== null} onChange={event => { setMoveTime(event.target.value); setError(""); }} /></label>
      <p className={styles.disclosure}>Only this reminder moves, on the same day. Later reminders keep their usual time.</p>
      {error && <p className="message error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={move.isPending || moveIntent !== null} onClick={closeMove}>Keep as is</button>
        <button className="primary-button" disabled={move.isPending || !/^\d{2}:\d{2}/.test(moveTime)} onClick={() => {
          const next = moveIntent ?? { accountId: user.id, series: moving, localTime: `${moving.next_occurrence!.local_date}T${moveTime.slice(0, 5)}`, key: crypto.randomUUID() };
          setMoveIntent(next); setError(""); move.mutate(next);
        }}>{move.isPending ? <LoaderCircle size={17} className="spin" /> : moveIntent ? <RefreshCw size={17} /> : <Check size={17} />}{moveIntent && !move.isPending ? "Retry original move" : "Move reminder"}</button>
      </div>
    </ReminderDialog>}
  </section>;
}
