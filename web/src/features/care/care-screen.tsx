"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronLeft, ChevronRight, LoaderCircle, Pill, Plus, RefreshCw, X } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId } from "@/features/i18n/messages";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { careAlerts, setCareAlert } from "@/features/notifications/alerts-client";
import {
  MAX_TIMES, OUTCOMES, SOURCES, blankForm, browserZone, careBody, careDay, createInstruction,
  formProblem, formatDay, listInstructions, reportDose, sameBody, shiftDate, stopInstruction, todayIn, zoneOptions,
} from "./client";
import type { CareForm, CareInstruction, CreateIntent, DoseOutcome, Occurrence, ReportIntent } from "./client";
import styles from "./care.module.css";

type View = "day" | "medicines";

const validationIds: Record<string, MessageId> = {
  "Enter the medicine name exactly as written on your instructions.": "care.problem.name",
  "Medicine names can have up to 120 characters.": "care.problem.nameLong",
  "Strength and form can have up to 60 characters.": "care.problem.detailLong",
  "Enter the dose exactly as written on your instructions.": "care.problem.dose",
  "Doses can have up to 120 characters.": "care.problem.doseLong",
  "Extra instructions can have up to 500 characters.": "care.problem.instructionsLong",
  "Remove control characters.": "care.problem.control",
  "Choose where these instructions came from.": "care.problem.source",
  "Fill in or remove each empty daily time.": "care.problem.emptyTime",
  "Add at least one daily time.": "care.problem.time",
  "List each daily time once.": "care.problem.duplicateTime",
  [`Use at most ${MAX_TIMES} daily times.`]: "care.problem.manyTimes",
  "Choose the first day.": "care.problem.firstDay",
  "The last day cannot be before the first day.": "care.problem.lastDay",
  "Choose a time zone.": "care.problem.timezone",
  "Confirm that these details match your instructions.": "care.problem.confirm",
};

export function CareScreen() {
  const t = useText();
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("care.loadingMedicines")}</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>{t("care.unavailable")}</h1><p role="alert">{problemText(viewer.error, t("care.loadError"))}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />{t("care.retry")}</button></main></Shell>;
  }
  return <Care key={viewer.account.id} user={viewer.account} />;
}

function Care({ user }: { user: Account }) {
  const t = useText();
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
        <h1>{t("care.medicines")}</h1>
        <p>{t("care.intro")}</p>
      </header>
      <div className={styles.tabs} role="group" aria-label={t("care.view")}>
        <button className={styles.tab} aria-pressed={view === "day"} onClick={() => setView("day")}>{t("care.dayPlan")}</button>
        <button className={styles.tab} aria-pressed={view === "medicines"} onClick={() => setView("medicines")}>{t("care.myMedicines")}</button>
      </div>
      {view === "day" ? <DayPlan user={user} date={date} today={today} setDate={setDate} onChanged={refresh} /> : <Medicines user={user} zone={zone} today={today} onChanged={refresh} />}
    </main>
  </Shell>;
}

function DayPlan({ user, date, today, setDate, onChanged }: { user: Account; date: string; today: string; setDate: (value: string) => void; onChanged: () => void }) {
  const t = useText();
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
      <button className="icon-button" aria-label={t("care.previousDay")} title={t("care.previousDay")} disabled={date <= earliest} onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden /></button>
      <h2 id="day-title">{formatDay(date)}{date === today ? t("care.todaySuffix") : ""}</h2>
      <button className="icon-button" aria-label={t("care.nextDay")} title={t("care.nextDay")} disabled={date >= latest} onClick={() => move(1)}><ChevronRight size={18} aria-hidden /></button>
    </div>
    <div className={styles.dayTools}>
      <label className={styles.field}>{t("care.goToDate")}<input type="date" value={date} min={earliest} max={latest} onChange={event => { const value = event.target.value; if (value >= earliest && value <= latest) setDate(value); }} /></label>
      {date !== today && <button className="secondary-button" onClick={() => setDate(today)}>{t("care.today")}</button>}
    </div>
    {plan.isPending && plan.fetchStatus !== "idle" && <p aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("care.loadingDay")}</p>}
    {plan.isError && <div className="message error" role="alert">{problemText(plan.error, t("care.dayError"))}<button className="text-button" onClick={() => plan.refetch()}><RefreshCw size={16} aria-hidden />{t("care.retry")}</button></div>}
    {plan.isSuccess && plan.data.occurrences.length === 0 && <p className={styles.empty}>{t("care.emptyDay")}</p>}
    {plan.isSuccess && <ul className={styles.list}>{plan.data.occurrences.map(item => {
      const medicine = names.get(item.instruction_id);
      return <OccurrenceRow key={`${item.instruction_id}-${item.local_time}`} user={user} occurrence={item} label={medicine ? `${medicine.medicine_name}${medicine.strength ? ` ${medicine.strength}` : ""}${medicine.form ? ` (${medicine.form})` : ""}` : t("care.medicine")} dose={medicine?.dose ?? ""} stopped={medicine?.status === "stopped"} onChanged={() => { onChanged(); void plan.refetch(); }} />;
    })}</ul>}
    {plan.isSuccess && plan.data.omitted.length > 0 && <ul className={styles.notes}>{plan.data.omitted.map(item => {
      const medicine = names.get(item.instruction_id);
      return <li key={`${item.instruction_id}-${item.local_time}`}>{t("care.omitted", { name: medicine?.medicine_name ?? t("care.aMedicine"), time: item.local_time, other: item.same_moment_as })}</li>;
    })}</ul>}
    <p className={styles.fine}>{t("care.finePrint")}</p>
  </section>;
}

function OccurrenceRow({ user, occurrence, label, dose, stopped, onChanged }: { user: Account; occurrence: Occurrence; label: string; dose: string; stopped: boolean; onChanged: () => void }) {
  const t = useText();
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
    <p className={styles.status} role="status">{current ? t("care.noted", { outcome: t(`care.outcome.${current}`) }) : t("care.notNoted")}{stopped ? t("care.stoppedSuffix") : ""}</p>
    {occurrence.clock_change === "shifted_forward" && <p className={styles.note}>{t("care.shifted", { time: occurrence.local_time, display: occurrence.display_time })}</p>}
    {occurrence.clock_change === "repeated_time_first" && <p className={styles.note}>{t("care.repeated", { time: occurrence.local_time })}</p>}
    {occurrence.can_report ? <div className={styles.actions} role="group" aria-label={t("care.noteFor", { name: label, time: occurrence.display_time })}>
      {OUTCOMES.map(value => <button key={value} className={styles.tab} disabled={mutation.isPending || current === value}
        aria-pressed={current === value} onClick={() => choose(value)}>{current && current !== value ? t("care.changeTo", { outcome: t(`care.outcome.${value}`) }) : t(`care.outcome.${value}`)}</button>)}
      </div> : <p className={styles.note}>{early ? t("care.early") : t("care.closed")}</p>}
      {mutation.isPending && <p role="status">{t("care.savingNote")}</p>}
      {mutation.isError && <p role="alert">{problemText(mutation.error, t("care.noteError"))}{pendingOutcome ? t("care.retryNote", { outcome: t(`care.outcome.${pendingOutcome}`) }) : ""}</p>}
  </li>;
}

function Medicines({ user, zone, today, onChanged }: { user: Account; zone: string; today: string; onChanged: () => void }) {
  const t = useText();
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
      <h2 id="medicines-title">{status === "active" ? t("care.currentMedicines") : t("care.stoppedMedicines")}</h2>
      {!adding && <button className="primary-button" onClick={() => { setAdding(true); setStatus("active"); }}><Plus size={18} aria-hidden />{t("care.addMedicine")}</button>}
    </div>
    <div className={styles.tabs} role="group" aria-label={t("care.showMedicines")}>
      {(["active", "stopped"] as const).map(value => <button key={value} className={styles.tab} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "active" ? t("care.current") : t("care.stopped")}</button>)}
    </div>
    {adding && <InstructionEditor user={user} zone={zone} today={today} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged(); void list.refetch(); }} />}
    {list.isPending && <p aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("care.loadingMedicines")}</p>}
    {list.isError && <div className="message error" role="alert">{problemText(list.error, t("care.loadError"))}<button className="text-button" onClick={() => list.refetch()}><RefreshCw size={16} aria-hidden />{t("care.retry")}</button></div>}
    {list.isSuccess && list.data.length === 0 && <p className={styles.empty}>{status === "active" ? t("care.emptyCurrent") : t("care.emptyStopped")}</p>}
    {list.isSuccess && <ul className={styles.list}>{list.data.map(item => <InstructionCard key={item.id} user={user} item={item} alertOn={alerts.data?.has(item.id) ?? null} onChanged={() => { onChanged(); void list.refetch(); }} />)}</ul>}
    {list.isSuccess && status === "stopped" && <p className={styles.fine}>{t("care.stoppedLimit")}</p>}
  </section>;
}

function InstructionCard({ user, item, alertOn, onChanged }: { user: Account; item: CareInstruction; alertOn: boolean | null; onChanged: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const dates = new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium" });
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
    <p className={styles.note}>{t("care.schedule", { times: item.times.join(", "), zone: item.timezone, start: item.start_date, end: item.end_date ? t("care.scheduleEnd", { date: item.end_date }) : "" })}</p>
    {item.instructions && <p className={styles.description}>{item.instructions}</p>}
    <p className={styles.note}>{t("care.sourceLine", { source: t(`care.source.${item.source}`), date: dates.format(new Date(item.confirmed_at)), stopped: item.stopped_at ? t("care.stoppedOn", { date: dates.format(new Date(item.stopped_at)) }) : "" })}</p>
    {item.status === "active" && alertOn !== null && <div className={styles.note}>
      <label><input type="checkbox" name="care_dose_alert" checked={alertOn} disabled={alert.isPending} onChange={event => alert.mutate(event.target.checked)} /> Alert me in this app at these times</label>
      <p className={styles.fine}>Each alert shows until you note the dose, the next time arrives, or four hours pass. It only repeats the times you entered; it is not advice.</p>
      {alert.isError && <p role="alert">{problemText(alert.error, "The alert setting was not saved.")}</p>}
    </div>}
    {item.status === "active" && !confirm && <div className={styles.actions}><button className="secondary-button" onClick={() => setConfirm(true)}><Ban size={16} aria-hidden />{t("care.stopTracking")}</button></div>}
    {confirm && <div className={styles.confirm} role="group" aria-label={t("care.confirmStop")}>
      <p className={styles.description}>{t("care.stopWarning", { name: item.medicine_name })}</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={stop.isPending} onClick={submit}>{stop.isPending ? t("care.stopping") : stop.isError && isUnknown(stop.error) ? t("care.retryStop") : t("care.yesStop")}</button>
        <button className="secondary-button" disabled={stop.isPending} onClick={() => { setConfirm(false); setKey(null); stop.reset(); }}>{t("care.keep")}</button>
      </div>
      {stop.isError && <p role="alert">{problemText(stop.error, t("care.stopError"))}{changed ? t("care.reloadHint") : ""}</p>}
      {changed && <button className="text-button" onClick={() => { setConfirm(false); setKey(null); stop.reset(); onChanged(); }}>{t("care.reloadList")}</button>}
    </div>}
  </li>;
}

function InstructionEditor({ user, zone, today, onClose, onSaved }: { user: Account; zone: string; today: string; onClose: () => void; onSaved: () => void }) {
  const t = useText();
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
  const localId = local ? validationIds[local] : undefined;
  return <form className={styles.panel} onSubmit={submit} aria-labelledby={`${formId}-title`} noValidate>
    <div className={styles.panelHead}>
      <h2 id={`${formId}-title`}>{t("care.addTitle")}</h2>
      <button type="button" className="icon-button" aria-label={t("care.closeForm")} title={t("care.closeForm")} disabled={save.isPending} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    <p className={styles.note}>{t("care.addIntro")}</p>
    <label className={styles.field}>{t("care.name")}<input value={form.medicine_name} maxLength={240} onChange={set("medicine_name")} disabled={locked} required /></label>
    <div className={styles.row}>
      <label className={styles.field}>{t("care.strength")}<input value={form.strength} maxLength={120} onChange={set("strength")} disabled={locked} /></label>
      <label className={styles.field}>{t("care.form")}<input value={form.form} maxLength={120} onChange={set("form")} disabled={locked} /></label>
    </div>
    <label className={styles.field}>{t("care.dose")}<input value={form.dose} maxLength={240} onChange={set("dose")} disabled={locked} required /></label>
    <label className={styles.field}>{t("care.instructions")}<textarea value={form.instructions} rows={3} maxLength={1000} onChange={set("instructions")} disabled={locked} /></label>
    <label className={styles.field}>{t("care.sourceQuestion")}<select aria-label={t("care.source")} value={form.source} onChange={set("source")} disabled={locked}>
      <option value="">{t("care.chooseOne")}</option>{SOURCES.map(value => <option key={value} value={value}>{t(`care.source.${value}`)}</option>)}
    </select></label>
    <fieldset className={styles.fieldset} disabled={locked}>
      <legend>{t("care.dailyTimes")}</legend>
      {form.times.map((time, index) => <div key={index} className={styles.timeRow}>
        <label className={styles.field}>{t("care.time", { number: index + 1 })}<input type="time" value={time} onChange={event => setTime(index, event.target.value)} /></label>
        {form.times.length > 1 && <button type="button" className="icon-button" aria-label={t("care.removeTimeNumber", { number: index + 1 })} title={t("care.removeTime")} onClick={() => setForm(current => ({ ...current, times: current.times.filter((_, at) => at !== index) }))}><X size={16} aria-hidden /></button>}
      </div>)}
      {form.times.length < MAX_TIMES && <button type="button" className="secondary-button" onClick={() => setForm(current => ({ ...current, times: [...current.times, ""] }))}><Plus size={16} aria-hidden />{t("care.addTime")}</button>}
    </fieldset>
    <label className={styles.field}>{t("care.timezone")}<select aria-label={t("care.timezone")} value={form.timezone} onChange={set("timezone")} disabled={locked}>
      {zones.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <div className={styles.row}>
      <label className={styles.field}>{t("care.firstDay")}<input type="date" value={form.start_date} onChange={set("start_date")} disabled={locked} required /></label>
      <label className={styles.field}>{t("care.lastDay")}<input type="date" value={form.end_date} onChange={set("end_date")} disabled={locked} /></label>
    </div>
    <label className={styles.check}><input type="checkbox" checked={form.confirmed} disabled={locked} onChange={event => { setForm(current => ({ ...current, confirmed: event.target.checked })); setLocal(null); }} />{t("care.confirm")}</label>
    {local && <p role="alert">{localId ? t(localId, { limit: MAX_TIMES }) : local}</p>}
    {save.isError && <p role="alert">{problemText(save.error, t("care.saveError"))}{locked ? t("care.retrySaveHint") : ""}</p>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? t("care.saving") : locked ? t("care.retry") : t("care.saveMedicine")}</button>
      {locked && !save.isPending && <button type="button" className="secondary-button" onClick={() => { setIntent(null); save.reset(); onClose(); }}>{t("care.closeAndCheck")}</button>}
    </div>
  </form>;
}
