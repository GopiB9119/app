"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronLeft, ChevronRight, LoaderCircle, Pill, Plus, RefreshCw, X } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { careAlerts, setCareAlert } from "@/features/notifications/alerts-client";
import {
  MAX_TIMES, OUTCOMES, OUTCOME_LABELS, SOURCES, SOURCE_LABELS, blankForm, browserZone, careBody, careDay, createInstruction,
  formProblem, formatDay, listInstructions, reportDose, sameBody, shiftDate, stopInstruction, todayIn, zoneOptions,
} from "./client";
import type { CareForm, CareInstruction, CreateIntent, DoseOutcome, Occurrence, ReportIntent } from "./client";
import styles from "./care.module.css";

type View = "day" | "medicines";

export function CareScreen() {
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading medicines</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>Medicines unavailable</h1><p role="alert">{problemText(viewer.error, "Medicines could not load.")}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />Retry</button></main></Shell>;
  }
  return <Care key={viewer.account.id} user={viewer.account} />;
}

function Care({ user }: { user: Account }) {
  const queryClient = useQueryClient();
  const zone = useMemo(() => user.timezone || browserZone(), [user.timezone]);
  const today = todayIn(zone);
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(today);
  useEffect(() => () => { queryClient.removeQueries({ queryKey: ["care", user.id] }); }, [queryClient, user.id]);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["care", user.id] }); };
  return <Shell account>
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Medicines</h1>
        <p>Only you can see this page; nobody in your Spaces can. It keeps the instructions you enter and your own notes about each dose. It does not check them, give medical advice or decide when you should take anything. Follow your prescriber, pharmacist or the package label.</p>
      </header>
      <div className={styles.tabs} role="group" aria-label="Medicines view">
        <button className={styles.tab} aria-pressed={view === "day"} onClick={() => setView("day")}>Day plan</button>
        <button className={styles.tab} aria-pressed={view === "medicines"} onClick={() => setView("medicines")}>My medicines</button>
      </div>
      {view === "day" ? <DayPlan user={user} date={date} today={today} setDate={setDate} onChanged={refresh} /> : <Medicines user={user} zone={zone} today={today} onChanged={refresh} />}
    </main>
  </Shell>;
}

function DayPlan({ user, date, today, setDate, onChanged }: { user: Account; date: string; today: string; setDate: (value: string) => void; onChanged: () => void }) {
  const queryClient = useQueryClient();
  // The server allows 31 days around its UTC date; 30 local days stays inside it in every zone.
  const earliest = shiftDate(today, -30);
  const latest = shiftDate(today, 30);
  const plan = useQuery({ queryKey: ["care", user.id, "day", date], queryFn: ({ signal }) => careDay(user.id, date, signal), enabled: date >= earliest && date <= latest });
  useEffect(() => {
    if (sessionLost(plan.error)) { queryClient.clear(); window.location.replace("/login"); }
  }, [plan.error, queryClient]);
  const names = new Map(plan.data?.instructions.map(item => [item.id, item]) ?? []);
  const move = (days: number) => { const next = shiftDate(date, days); if (next >= earliest && next <= latest) setDate(next); };
  return <section aria-labelledby="day-title">
    <div className={styles.dayBar}>
      <button className="icon-button" aria-label="Previous day" title="Previous day" disabled={date <= earliest} onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden /></button>
      <h2 id="day-title">{formatDay(date)}{date === today ? " (today)" : ""}</h2>
      <button className="icon-button" aria-label="Next day" title="Next day" disabled={date >= latest} onClick={() => move(1)}><ChevronRight size={18} aria-hidden /></button>
    </div>
    <div className={styles.dayTools}>
      <label className={styles.field}>Go to date<input type="date" value={date} min={earliest} max={latest} onChange={event => { const value = event.target.value; if (value >= earliest && value <= latest) setDate(value); }} /></label>
      {date !== today && <button className="secondary-button" onClick={() => setDate(today)}>Today</button>}
    </div>
    {plan.isPending && plan.fetchStatus !== "idle" && <p aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading the day plan</p>}
    {plan.isError && <div className="message error" role="alert">{problemText(plan.error, "The day plan could not load.")}<button className="text-button" onClick={() => plan.refetch()}><RefreshCw size={16} aria-hidden />Retry</button></div>}
    {plan.isSuccess && plan.data.occurrences.length === 0 && <p className={styles.empty}>Nothing is scheduled for this day. Add a medicine under My medicines.</p>}
    {plan.isSuccess && <ul className={styles.list}>{plan.data.occurrences.map(item => {
      const medicine = names.get(item.instruction_id);
      return <OccurrenceRow key={`${item.instruction_id}-${item.local_time}`} user={user} occurrence={item} label={medicine ? `${medicine.medicine_name}${medicine.strength ? ` ${medicine.strength}` : ""}${medicine.form ? ` (${medicine.form})` : ""}` : "Medicine"} dose={medicine?.dose ?? ""} stopped={medicine?.status === "stopped"} onChanged={() => { onChanged(); void plan.refetch(); }} />;
    })}</ul>}
    {plan.isSuccess && plan.data.omitted.length > 0 && <ul className={styles.notes}>{plan.data.omitted.map(item => {
      const medicine = names.get(item.instruction_id);
      return <li key={`${item.instruction_id}-${item.local_time}`}>{medicine?.medicine_name ?? "A medicine"} at {item.local_time} is not shown separately: that day the clock puts it at the same moment as {item.same_moment_as}.</li>;
    })}</ul>}
    <p className={styles.fine}>&quot;Taken&quot; and &quot;Skipped&quot; are your own notes. They are not checked and this page does not measure whether you followed your instructions.</p>
  </section>;
}

function OccurrenceRow({ user, occurrence, label, dose, stopped, onChanged }: { user: Account; occurrence: Occurrence; label: string; dose: string; stopped: boolean; onChanged: () => void }) {
  const [intent, setIntent] = useState<ReportIntent | null>(null);
  const mutation = useMutation({
    mutationFn: reportDose,
    onSuccess: () => { setIntent(null); onChanged(); },
    onError: (error) => { if (!isUnknown(error)) setIntent(null); },
  });
  const choose = (outcome: DoseOutcome) => {
    if (mutation.isPending) return;
    // A lost response is retried with the same key, so one tap can never become two notes.
    const next = intent && intent.outcome === outcome && intent.occurrence.etag === occurrence.etag ? intent : { accountId: user.id, key: crypto.randomUUID(), occurrence, outcome };
    setIntent(next);
    mutation.mutate(next);
  };
  const current = occurrence.report?.outcome ?? null;
  const pendingOutcome = intent && mutation.isError && isUnknown(mutation.error) ? intent.outcome : null;
  const scheduled = Date.parse(occurrence.scheduled_at);
  const early = !occurrence.can_report && scheduled > Date.now();
  return <li className={styles.card}>
    <div className={styles.cardHead}>
      <span className={styles.time}>{occurrence.display_time}</span>
      <div><strong className={styles.name}>{label}</strong>{dose && <span className={styles.dose}>{dose}</span>}</div>
    </div>
    <p className={styles.status} role="status">{current ? `You noted: ${OUTCOME_LABELS[current]}` : "Not noted"}{stopped ? " (this medicine was stopped)" : ""}</p>
    {occurrence.clock_change === "shifted_forward" && <p className={styles.note}>The clock skips {occurrence.local_time} on this date, so this time is shown at {occurrence.display_time}.</p>}
    {occurrence.clock_change === "repeated_time_first" && <p className={styles.note}>{occurrence.local_time} happens twice on this date; this is the first one.</p>}
    {occurrence.can_report ? <div className={styles.actions} role="group" aria-label={`Note for ${label} at ${occurrence.display_time}`}>
      {OUTCOMES.map(value => <button key={value} className={styles.tab} disabled={mutation.isPending || current === value}
        aria-pressed={current === value} onClick={() => choose(value)}>{current && current !== value ? `Change to ${OUTCOME_LABELS[value]}` : OUTCOME_LABELS[value]}</button>)}
    </div> : <p className={styles.note}>{early ? "You can note this dose from one hour before its time." : "Notes can be added for up to seven days after the time."}</p>}
    {mutation.isPending && <p role="status">Saving your note...</p>}
    {mutation.isError && <p role="alert">{problemText(mutation.error, "Your note was not saved.")}{pendingOutcome ? ` Choose ${OUTCOME_LABELS[pendingOutcome]} again to retry; it will not be saved twice.` : ""}</p>}
  </li>;
}

function Medicines({ user, zone, today, onChanged }: { user: Account; zone: string; today: string; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"active" | "stopped">("active");
  const [adding, setAdding] = useState(false);
  const list = useQuery({ queryKey: ["care", user.id, "instructions", status], queryFn: ({ signal }) => listInstructions(user.id, status, signal) });
  const alerts = useQuery({ queryKey: ["careAlerts", user.id], queryFn: ({ signal }) => careAlerts(user.id, signal) });
  useEffect(() => {
    if (sessionLost(list.error)) { queryClient.clear(); window.location.replace("/login"); }
  }, [list.error, queryClient]);
  return <section aria-labelledby="medicines-title">
    <div className={styles.sectionHead}>
      <h2 id="medicines-title">{status === "active" ? "Current medicines" : "Stopped medicines"}</h2>
      {!adding && <button className="primary-button" onClick={() => { setAdding(true); setStatus("active"); }}><Plus size={18} aria-hidden />Add medicine</button>}
    </div>
    <div className={styles.tabs} role="group" aria-label="Show medicines">
      {(["active", "stopped"] as const).map(value => <button key={value} className={styles.tab} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "active" ? "Current" : "Stopped"}</button>)}
    </div>
    {adding && <InstructionEditor user={user} zone={zone} today={today} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged(); void list.refetch(); }} />}
    {list.isPending && <p aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading medicines</p>}
    {list.isError && <div className="message error" role="alert">{problemText(list.error, "Medicines could not load.")}<button className="text-button" onClick={() => list.refetch()}><RefreshCw size={16} aria-hidden />Retry</button></div>}
    {list.isSuccess && list.data.length === 0 && <p className={styles.empty}>{status === "active" ? "No current medicines. Add one exactly as written on your instructions." : "No stopped medicines."}</p>}
    {list.isSuccess && <ul className={styles.list}>{list.data.map(item => <InstructionCard key={item.id} user={user} item={item} alertOn={alerts.data?.has(item.id) ?? null} onChanged={() => { onChanged(); void list.refetch(); }} />)}</ul>}
    {list.isSuccess && status === "stopped" && <p className={styles.fine}>The most recent 20 stopped medicines are shown.</p>}
  </section>;
}

function InstructionCard({ user, item, alertOn, onChanged }: { user: Account; item: CareInstruction; alertOn: boolean | null; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const alert = useMutation({
    mutationFn: (enabled: boolean) => setCareAlert(user.id, item.id, enabled),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["careAlerts", user.id] }); void queryClient.invalidateQueries({ queryKey: ["alerts", user.id] }); },
  });
  const stop = useMutation({
    mutationFn: ({ target, requestKey }: { target: CareInstruction; requestKey: string }) => stopInstruction(user.id, target, requestKey),
    onSuccess: () => { setConfirm(false); setKey(null); onChanged(); },
    onError: error => { if (!isUnknown(error)) setKey(null); },
  });
  const submit = () => {
    const requestKey = key ?? crypto.randomUUID();
    setKey(requestKey);
    stop.mutate({ target: item, requestKey });
  };
  const changed = stop.error && "status" in stop.error && (stop.error.status === 412 || stop.error.status === 409);
  return <li className={styles.card}>
    <div className={styles.cardHead}>
      <Pill size={20} aria-hidden />
      <div><strong className={styles.name}>{item.medicine_name}{item.strength ? ` ${item.strength}` : ""}{item.form ? ` (${item.form})` : ""}</strong><span className={styles.dose}>{item.dose}</span></div>
    </div>
    <p className={styles.note}>Daily at {item.times.join(", ")} ({item.timezone}). From {item.start_date}{item.end_date ? ` to ${item.end_date}` : ""}.</p>
    {item.instructions && <p className={styles.description}>{item.instructions}</p>}
    <p className={styles.note}>Source: {SOURCE_LABELS[item.source]}. You confirmed these details on {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(item.confirmed_at))}.{item.stopped_at ? ` Stopped ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(item.stopped_at))}.` : ""}</p>
    {item.status === "active" && alertOn !== null && <div className={styles.note}>
      <label><input type="checkbox" name="care_dose_alert" checked={alertOn} disabled={alert.isPending} onChange={event => alert.mutate(event.target.checked)} /> Alert me in this app at these times</label>
      <p className={styles.fine}>Each alert shows until you note the dose, the next time arrives, or four hours pass. It only repeats the times you entered; it is not advice.</p>
      {alert.isError && <p role="alert">{problemText(alert.error, "The alert setting was not saved.")}</p>}
    </div>}
    {item.status === "active" && !confirm && <div className={styles.actions}><button className="secondary-button" onClick={() => setConfirm(true)}><Ban size={16} aria-hidden />Stop tracking</button></div>}
    {confirm && <div className={styles.confirm} role="group" aria-label="Confirm stop">
      <p className={styles.description}>Stop tracking {item.medicine_name}? This only ends reminders of it on this page from now on. It does not tell you to stop taking it; ask your prescriber or pharmacist about that. Notes you already made stay.</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={stop.isPending} onClick={submit}>{stop.isPending ? "Stopping..." : stop.isError && isUnknown(stop.error) ? "Retry stop" : "Yes, stop tracking"}</button>
        <button className="secondary-button" disabled={stop.isPending} onClick={() => { setConfirm(false); setKey(null); stop.reset(); }}>Keep it</button>
      </div>
      {stop.isError && <p role="alert">{problemText(stop.error, "It was not stopped.")}{changed ? " Reload the list to review the latest version." : ""}</p>}
      {changed && <button className="text-button" onClick={() => { setConfirm(false); setKey(null); stop.reset(); onChanged(); }}>Reload list</button>}
    </div>}
  </li>;
}

function InstructionEditor({ user, zone, today, onClose, onSaved }: { user: Account; zone: string; today: string; onClose: () => void; onSaved: () => void }) {
  const formId = useId();
  const [form, setForm] = useState<CareForm>(() => blankForm(zone, today));
  const [intent, setIntent] = useState<CreateIntent | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const zones = useMemo(() => zoneOptions(form.timezone), [form.timezone]);
  const save = useMutation({
    mutationFn: createInstruction,
    onSuccess: () => { setIntent(null); onSaved(); },
  });
  const set = (name: keyof CareForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(current => ({ ...current, [name]: event.target.value }));
    setLocal(null);
  };
  const setTime = (index: number, value: string) => { setForm(current => ({ ...current, times: current.times.map((time, at) => at === index ? value : time) })); setLocal(null); };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = formProblem(form);
    setLocal(problem);
    if (problem || save.isPending) return;
    const body = careBody(form);
    // An unconfirmed create is retried with the same key and body, so it cannot be recorded twice.
    const next = intent && sameBody(intent.body, body) ? intent : { accountId: user.id, key: crypto.randomUUID(), body };
    setIntent(next);
    save.mutate(next);
  };
  const unknown = save.isError && isUnknown(save.error);
  const locked = save.isPending || Boolean(intent && unknown);
  return <form className={styles.panel} onSubmit={submit} aria-labelledby={`${formId}-title`} noValidate>
    <div className={styles.panelHead}>
      <h2 id={`${formId}-title`}>Add a medicine</h2>
      <button type="button" className="icon-button" aria-label="Close form" title="Close form" disabled={save.isPending} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    <p className={styles.note}>Copy the details exactly from your prescriber, pharmacist or the package label. This page does not suggest medicines, doses or times.</p>
    <label className={styles.field}>Medicine name<input value={form.medicine_name} maxLength={240} onChange={set("medicine_name")} disabled={locked} required /></label>
    <div className={styles.row}>
      <label className={styles.field}>Strength (optional)<input value={form.strength} maxLength={120} onChange={set("strength")} disabled={locked} /></label>
      <label className={styles.field}>Form (optional)<input value={form.form} maxLength={120} onChange={set("form")} disabled={locked} /></label>
    </div>
    <label className={styles.field}>Dose<input value={form.dose} maxLength={240} onChange={set("dose")} disabled={locked} required /></label>
    <label className={styles.field}>Instructions as written (optional)<textarea value={form.instructions} rows={3} maxLength={1000} onChange={set("instructions")} disabled={locked} /></label>
    <label className={styles.field}>Where did these instructions come from?<select aria-label="Source" value={form.source} onChange={set("source")} disabled={locked}>
      <option value="">Choose one</option>{SOURCES.map(value => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}
    </select></label>
    <fieldset className={styles.fieldset} disabled={locked}>
      <legend>Daily times</legend>
      {form.times.map((time, index) => <div key={index} className={styles.timeRow}>
        <label className={styles.field}>{`Time ${index + 1}`}<input type="time" value={time} onChange={event => setTime(index, event.target.value)} /></label>
        {form.times.length > 1 && <button type="button" className="icon-button" aria-label={`Remove time ${index + 1}`} title="Remove time" onClick={() => setForm(current => ({ ...current, times: current.times.filter((_, at) => at !== index) }))}><X size={16} aria-hidden /></button>}
      </div>)}
      {form.times.length < MAX_TIMES && <button type="button" className="secondary-button" onClick={() => setForm(current => ({ ...current, times: [...current.times, ""] }))}><Plus size={16} aria-hidden />Add a time</button>}
    </fieldset>
    <label className={styles.field}>Time zone<select aria-label="Time zone" value={form.timezone} onChange={set("timezone")} disabled={locked}>
      {zones.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <div className={styles.row}>
      <label className={styles.field}>First day<input type="date" value={form.start_date} onChange={set("start_date")} disabled={locked} required /></label>
      <label className={styles.field}>Last day (optional)<input type="date" value={form.end_date} onChange={set("end_date")} disabled={locked} /></label>
    </div>
    <label className={styles.check}><input type="checkbox" checked={form.confirmed} disabled={locked} onChange={event => { setForm(current => ({ ...current, confirmed: event.target.checked })); setLocal(null); }} />I checked these details against my instructions and they are correct.</label>
    {local && <p role="alert">{local}</p>}
    {save.isError && <p role="alert">{problemText(save.error, "The medicine was not saved.")}{locked ? " Retry sends the same request; it will not be saved twice." : ""}</p>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : locked ? "Retry" : "Save medicine"}</button>
      {locked && !save.isPending && <button type="button" className="secondary-button" onClick={() => { setIntent(null); save.reset(); onClose(); }}>Close and check the list</button>}
    </div>
  </form>;
}
