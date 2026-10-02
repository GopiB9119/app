"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CalendarClock, Check, LoaderCircle, Pause, Pencil, Play, RefreshCw, Repeat, SkipForward, X } from "lucide-react";
import { api, ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { TimezoneListProblem } from "@/features/identity/timezone-list-problem";
import { formatDateTime, useLanguage, useText } from "@/features/i18n/i18n";
import { translate, type Language, type MessageId, type MessageValues } from "@/features/i18n/messages";
import { en as reminderMessages } from "@/features/i18n/areas/reminders";
import { dateInZone } from "@/features/planning/calendar-client";
import { commandSeries, describeRule, moveSeries, offsetLabel, previewSeries, replaceSeries, saveSeries, seriesPage, weekdayNames } from "./client";
import type { ReminderSeries, ReminderSeriesPreview, SeriesCommandIntent, SeriesIntent, SeriesMoveIntent, SeriesOperation, SeriesRule, Weekday } from "./client";
import { displayInstant, displayReminderTime, protectedReminderError, ReminderDialog } from "./reminder-common";
import styles from "./reminders.module.css";

function addDays(day: string, days: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatLocalDate(day: string, language: Language = "en") {
  return formatDateTime(language, new Date(`${day}T12:00:00Z`), { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function displayRule(rule: SeriesRule, language: Language) {
  if (language === "en") return describeRule(rule);
  const values = { count: rule.repeat_every, time: rule.local_time, days: rule.weekdays.map(day => translate(language, `reminders.series.day.${day}`)).join(", ") };
  return translate(language, rule.frequency === "daily"
    ? rule.repeat_every === 1 ? "reminders.series.rule.daily.one" : "reminders.series.rule.daily.other"
    : rule.repeat_every === 1 ? "reminders.series.rule.weekly.one" : "reminders.series.rule.weekly.other", values);
}

function displayReason(reason: string, language: Language) {
  const id = `reminders.series.reason.${reason}`;
  return translate(language, Object.hasOwn(reminderMessages, id) ? id as keyof typeof reminderMessages : "reminders.series.reason.stopped");
}

function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}

export function SeriesForm({ user, taskId, frequency, zones, disabled, onLocked, onDenied, onSaved, replacing, onCancel }: {
  user: Account; taskId: string; frequency: "daily" | "weekly"; zones: string[]; disabled: boolean;
  onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onSaved: (result: ReminderSeries) => Promise<void>;
  replacing?: ReminderSeries; onCancel?: () => void;
}) {
  const { language: selectedLanguage } = useLanguage();
  const language = replacing ? "en" : selectedLanguage;
  const t = (id: MessageId, values?: MessageValues) => translate(language, id, values);
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
      <h3 id={`${fieldId}-review`}>{replacing ? "Review the change" : t("reminders.series.review")}</h3>
      <dl className={styles.facts}>
        <dt>{t("reminders.task")}</dt><dd>{result.task_title}</dd><dt>{t("reminders.recipient")}</dt><dd>{t("reminders.you", { name: result.recipient.display_name })}</dd>
        <dt>{t("reminders.series.repeats")}</dt><dd>{displayRule(result, language)}</dd><dt>{t("reminders.from")}</dt><dd>{formatLocalDate(result.start_date, language)}</dd>
        <dt>{t("reminders.series.until")}</dt><dd>{formatLocalDate(result.end_date, language)}</dd><dt>{t("reminders.timezone")}</dt><dd>{result.timezone}</dd>
        <dt>{t("reminders.series.count")}</dt><dd>{result.occurrence_count}</dd><dt>{t("reminders.channel")}</dt><dd>{t("reminders.inApp")}</dd>
      </dl>
      <h4 className={styles.subheading}>{t("reminders.series.firstTimes")}</h4>
      <ol className={styles.occurrences}>{result.occurrences.map(item => <li key={item.local_date}>
        <strong>{formatLocalDate(item.local_date, language)}, {item.display_time}</strong>
        <small>{offsetLabel(item.utc_offset_minutes)} / {displayReminderTime(item.scheduled_at, language)}</small>
        {item.adjustment !== "none" && <small>{item.adjustment === "moved" ? "You moved this time." : t(item.adjustment === "shifted_forward" ? "reminders.series.shifted" : "reminders.series.repeated")}</small>}
      </li>)}</ol>
      {result.clock_changes.length > 0 && <p className={styles.disclosure}>{t("reminders.series.clockChanges", { changes: result.clock_changes.map(change => t(`reminders.series.change.${change.change}`, { date: formatLocalDate(change.local_date, language) })).join("; ") })}</p>}
      {skips && <fieldset className={styles.options} disabled={locked}><legend>{t("reminders.series.policyTitle", { time: result.local_time })}</legend>
        <label className={styles.option}><input type="radio" name={`${fieldId}-policy`} checked={result.clock_change_policy === "shift_forward"} onChange={() => preview.mutate({ ...review.rule, clock_change_policy: "shift_forward" })} /><span><strong>{t("reminders.series.policyShift")}</strong><small>{t("reminders.series.policyExample")}</small></span></label>
        <label className={styles.option}><input type="radio" name={`${fieldId}-policy`} checked={result.clock_change_policy === "skip"} onChange={() => preview.mutate({ ...review.rule, clock_change_policy: "skip" })} /><span><strong>{t("reminders.series.policySkip")}</strong><small>{t("reminders.series.policySkipDisclosure")}</small></span></label>
      </fieldset>}
      <p className={styles.disclosure}>{t("reminders.series.disclosure")}</p>
      {replacing && <p className={styles.disclosure}>Saving stops the current repeating reminder, including its next reminder and any waiting snooze, and starts this one. Reminders already in your inbox stay.</p>}
      <div className={styles.actions}>
        <button className="secondary-button" disabled={locked} onClick={() => setReview(null)}>{t("reminders.series.change")}</button>
        <button className="primary-button" disabled={save.isPending || preview.isPending || disabled} onClick={() => {
          const command = intent ?? { accountId: user.id, taskId, key: crypto.randomUUID(), previewToken: result.preview_token, rule: review.rule };
          setIntent(command); setError(""); save.mutate(command);
        }}>{save.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : <Check size={17} />}{intent && !save.isPending ? t("reminders.retrySave") : replacing ? "Save change" : t("reminders.series.save")}</button>
      </div>
      {error && <p className="message error" role="alert">{error}</p>}
    </section>;
  }
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!valid) return; setError(""); preview.mutate(rule("shift_forward")); }}>
    <div className={styles.fieldRow}>
      <label>{t("reminders.series.time")}<input name="series_local_time" type="time" required step={60} value={time} disabled={locked} onChange={event => { setTime(event.target.value); setError(""); }} /></label>
      <label>{t(frequency === "weekly" ? "reminders.series.everyWeeks" : "reminders.series.everyDays")}<input name="series_repeat_every" type="number" inputMode="numeric" min={1} max={most} required value={every} disabled={locked} onChange={event => { setEvery(event.target.value); setError(""); }} /></label>
    </div>
    {frequency === "weekly" && <fieldset className={styles.weekdays} disabled={locked}><legend>{t("reminders.series.weekdays")}</legend>{weekdayNames.map(day => <label key={day}>
      <input type="checkbox" name={`series_weekday_${day}`} checked={days.includes(day)} onChange={event => { const checked = event.target.checked; setDays(current => checked ? [...current, day] : current.filter(item => item !== day)); setError(""); }} />{t(`reminders.series.day.${day}`)}
    </label>)}</fieldset>}
    <div className={styles.fieldRow}>
      <label>{t("reminders.series.firstDay")}<input name="series_start_date" type="date" required min={today} value={start} disabled={locked} onChange={event => { setStart(event.target.value); setError(""); }} /></label>
      <label>{t("reminders.series.lastDay")}<input name="series_end_date" type="date" required min={start} max={latestEnd} value={end} disabled={locked} onChange={event => { setEnd(event.target.value); setError(""); }} /></label>
    </div>
    <label><span id={`${fieldId}-zone`}>{t("reminders.timezone")}</span><select aria-labelledby={`${fieldId}-zone`} name="series_timezone" value={timezone} disabled={locked} onChange={event => { setTimezone(event.target.value); setError(""); }}>{zones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>
    <p className={styles.disclosure}>{t("reminders.series.limit")}</p>
    <div className={styles.actions}>
      {onCancel && <button type="button" className="secondary-button" disabled={locked} onClick={onCancel}>{t("reminders.series.keep")}</button>}
      <button className="primary-button" type="submit" disabled={locked || !valid}>{preview.isPending ? <LoaderCircle size={17} className="spin" /> : <Repeat size={17} />}{replacing ? "Review change" : t("reminders.series.review")}</button>
    </div>
    {error && <p className="message error" role="alert">{error}</p>}
  </form>;
}

function outcome(result: ReminderSeries, operation: SeriesOperation) {
  return result.status === "ended" ? "reminders.series.outcome.ended" : `reminders.series.outcome.${operation}`;
}

export function SeriesList({ user, taskId, disabled, onLocked, onDenied, onNotice }: {
  user: Account; taskId: string; disabled: boolean; onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onNotice: (message: string) => void;
}) {
  const t = useText();
  const { language } = useLanguage();
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
    <div className={styles.sectionHeading}><h2 id={titleId}>{t("reminders.series.heading")}</h2><button className="icon-button" aria-label={t("reminders.series.refresh")} title={t("reminders.series.refresh")} disabled={busy || records.isFetching} onClick={() => records.refetch()}><RefreshCw size={18} className={records.isFetching ? "spin" : ""} /></button></div>
    {records.isPending && <p role="status">{t("reminders.series.loading")}</p>}
    {(records.error || (error && !selection && !moving)) && <p className="message error" role="alert">{records.error?.message ?? error}</p>}
    {!records.isPending && !records.isError && rows.length === 0 && <p className={styles.empty}>{t(taskId ? "reminders.series.emptyTask" : "reminders.series.empty")}</p>}
    {!records.isError && <ul className={styles.list}>{rows.map(item => <li key={item.id}>
      <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{t(`reminders.series.status.${item.status}`)}</span></div>
      <span>{displayRule(item, language)}</span>
      <span className={styles.zone}>{t("reminders.series.range", { start: formatLocalDate(item.start_date, language), end: formatLocalDate(item.end_date, language), zone: item.timezone })}</span>
      {item.next_occurrence && <p className={styles.next}>{item.next_occurrence.adjustment === "moved" ? "Next (moved): " : t("reminders.series.next")}<time dateTime={item.next_occurrence.scheduled_at}>{displayInstant(item.next_occurrence.scheduled_at, item.timezone, item.next_occurrence.adjustment === "moved" ? "en" : language)}</time></p>}
      {item.replaced_by && <p className={styles.reason}>Replaced by a changed repeating reminder.</p>}
      {item.reason && <p className={styles.reason}>{displayReason(item.reason, language)}</p>}
      {item.status === "active" && item.source_changed && <p className={styles.reason}>{t("reminders.series.sourceChanged")}</p>}
      <div className={styles.actions}><Link href={`/app/reminders?task_id=${item.task_id}`}>{t("reminders.series.taskReminders")}</Link>
        {item.status === "active" && item.next_occurrence && <button className="secondary-button" aria-label={`Move next reminder: ${item.task_title}`} disabled={busy} onClick={() => openMove(item)}><CalendarClock size={17} />Move next</button>}
        {item.status === "active" && item.next_occurrence && <button className="secondary-button" aria-label={t("reminders.series.skipLabel", { title: item.task_title })} disabled={busy} onClick={() => open(item, "skip")}><SkipForward size={17} />{t("reminders.series.skip")}</button>}
        {(item.status === "active" || item.status === "paused") && <button className="secondary-button" aria-label={`Change repeating reminder: ${item.task_title}`} disabled={busy} onClick={() => { setError(""); setEditFrequency(item.frequency); setEditing(item); }}><Pencil size={17} />Change</button>}
        {item.status === "active" && <button className="secondary-button" aria-label={t("reminders.series.pauseLabel", { title: item.task_title })} disabled={busy} onClick={() => open(item, "pause")}><Pause size={17} />{t("reminders.series.confirm.pause")}</button>}
        {item.status === "paused" && <button className="secondary-button" aria-label={t("reminders.series.resumeLabel", { title: item.task_title })} disabled={busy} onClick={() => open(item, "resume")}><Play size={17} />{t("reminders.series.confirm.resume")}</button>}
        {(item.status === "active" || item.status === "paused") && <button className="secondary-button" aria-label={t("reminders.series.cancelLabel", { title: item.task_title })} disabled={busy} onClick={() => open(item, "cancel")}><X size={17} />{t("reminders.series.cancel")}</button>}
      </div>
    </li>)}</ul>}
    {records.hasNextPage && <button className="text-button" disabled={busy || records.isFetching} onClick={() => records.fetchNextPage()}>{t("reminders.series.more")}</button>}
    {selection && <ReminderDialog title={t(`reminders.series.title.${selection.operation}`)} closeLabel={t("reminders.closeDialog")} locked={locked} onClose={close}>
      <p className={styles.reviewTitle}>{selection.series.task_title}</p>
      <dl className={styles.facts}>
        <dt>{t("reminders.series.repeats")}</dt><dd>{displayRule(selection.series, language)}</dd><dt>{t("reminders.timezone")}</dt><dd>{selection.series.timezone}</dd>
        {selection.series.next_occurrence && <><dt>{t("reminders.series.nextLabel")}</dt><dd>{displayInstant(selection.series.next_occurrence.scheduled_at, selection.series.timezone, language)}</dd></>}
        <dt>{t("reminders.series.until")}</dt><dd>{formatLocalDate(selection.series.end_date, language)}</dd>
      </dl>
      <p className={styles.disclosure}>{t(`reminders.series.effect.${selection.operation}`)}</p>
      {error && <p className="message error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={locked} onClick={close}>{t("reminders.series.keep")}</button>
        <button className="primary-button" disabled={command.isPending} onClick={() => {
          const next = intent ?? { accountId: user.id, series: selection.series, operation: selection.operation, key: crypto.randomUUID() };
          setIntent(next); setError(""); command.mutate(next);
        }}>{command.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : <Check size={17} />}{t(intent && !command.isPending ? "reminders.series.retryChange" : `reminders.series.confirm.${selection.operation}`)}</button>
      </div>
    </ReminderDialog>}
    {editing && <ReminderDialog title="Change repeating reminder" locked={editLocked} onClose={() => setEditing(null)}>
      <p className={styles.reviewTitle}>{editing.task_title}</p>
      <p className={styles.disclosure}>Now: {describeRule(editing)} in {editing.timezone}, until {formatLocalDate(editing.end_date)}.</p>
      <label><span id={`${titleId}-repeat`}>Repeat</span><select aria-labelledby={`${titleId}-repeat`} name="series_change_repeat" value={editFrequency} disabled={editLocked} onChange={event => setEditFrequency(event.target.value === "weekly" ? "weekly" : "daily")}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
      {zones.isError && <TimezoneListProblem retry={() => zones.refetch()} />}
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
