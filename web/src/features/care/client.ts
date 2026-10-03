import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const etag = z.string().min(3).max(200);
export const SOURCES = ["prescriber", "pharmacist", "package_label", "self"] as const;
export type CareSource = (typeof SOURCES)[number];
export const SOURCE_LABELS: Record<CareSource, string> = {
  prescriber: "My prescriber", pharmacist: "My pharmacist", package_label: "The package label", self: "I entered this myself",
};
export const OUTCOMES = ["taken", "skipped"] as const;
export type DoseOutcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABELS: Record<DoseOutcome, string> = { taken: "Taken", skipped: "Skipped" };
export const MAX_TIMES = 6;

export const instructionSchema = z.object({
  id: uuid, medicine_name: z.string().min(1).max(240), strength: z.string().max(120), form: z.string().max(120),
  dose: z.string().min(1).max(240), instructions: z.string().max(1000), source: z.enum(SOURCES), timezone: z.string().min(1).max(64),
  times: z.array(clock).min(1).max(MAX_TIMES), start_date: calendarDate, end_date: calendarDate.nullable(),
  status: z.enum(["active", "stopped"]), version: z.number().int().positive(), confirmed_by_account_id: uuid,
  confirmed_at: timestamp, created_at: timestamp, stopped_at: timestamp.nullable(), etag,
}).superRefine((value, context) => {
  if ((value.status === "stopped") !== (value.stopped_at !== null) || (value.end_date !== null && value.end_date < value.start_date)
    || new Set(value.times).size !== value.times.length) {
    context.addIssue({ code: "custom", message: "Inconsistent instruction." });
  }
});
export type CareInstruction = z.infer<typeof instructionSchema>;

// DEC-030: answers a correction replaced, newest first.
const earlierSchema = z.object({ outcome: z.enum(OUTCOMES), revision: z.number().int().positive(), recorded_at: timestamp, replaced_at: timestamp });
const reportSchema = z.object({
  outcome: z.enum(OUTCOMES), revision: z.number().int().positive(), reported_at: timestamp, updated_at: timestamp,
  earlier: z.array(earlierSchema).max(10).default([]),
});
export const occurrenceSchema = z.object({
  instruction_id: uuid, local_date: calendarDate, local_time: clock, display_time: clock, timezone: z.string().min(1).max(64),
  scheduled_at: timestamp, clock_change: z.enum(["none", "shifted_forward", "repeated_time_first"]),
  report: reportSchema.nullable(), can_report: z.boolean(), etag,
});
export type Occurrence = z.infer<typeof occurrenceSchema>;
export const daySchema = z.object({
  local_date: calendarDate,
  instructions: z.array(z.object({
    id: uuid, medicine_name: z.string().min(1).max(240), strength: z.string().max(120), form: z.string().max(120),
    dose: z.string().min(1).max(240), status: z.enum(["active", "stopped"]),
  })).max(60),
  occurrences: z.array(occurrenceSchema).max(400),
  omitted: z.array(z.object({ instruction_id: uuid, local_time: clock, same_moment_as: clock })).max(400),
});
export type CareDay = z.infer<typeof daySchema>;

export type CareForm = {
  medicine_name: string; strength: string; form: string; dose: string; instructions: string; source: CareSource | "";
  timezone: string; times: string[]; start_date: string; end_date: string; confirmed: boolean;
};
export type CareBody = {
  medicine_name: string; strength: string; form: string; dose: string; instructions: string; source: CareSource;
  timezone: string; times: string[]; start_date: string; end_date: string | null; confirmed: true;
};
export type CreateIntent = { accountId: string; key: string; body: CareBody };

const controls = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const oneLine = (value: string) => value.trim().replace(/\s+/g, " ");

export function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function zoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  return [...new Set([current, ...zones, "UTC"])].filter(Boolean).sort();
}

export function todayIn(zone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const pick = (type: string) => parts.find(part => part.type === type)?.value ?? "";
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function blankForm(zone: string, today: string): CareForm {
  return { medicine_name: "", strength: "", form: "", dose: "", instructions: "", source: "", timezone: zone, times: [""], start_date: today, end_date: "", confirmed: false };
}

export function careBody(form: CareForm): CareBody {
  return {
    medicine_name: oneLine(form.medicine_name), strength: oneLine(form.strength), form: oneLine(form.form), dose: oneLine(form.dose),
    instructions: form.instructions.replace(/\r\n/g, "\n").trim(), source: form.source as CareSource, timezone: form.timezone,
    times: [...new Set(form.times.filter(Boolean))].sort(), start_date: form.start_date, end_date: form.end_date || null, confirmed: true,
  };
}

export function formProblem(form: CareForm) {
  const body = careBody(form);
  if (!body.medicine_name) return "Enter the medicine name exactly as written on your instructions.";
  if ([...body.medicine_name].length > 120) return "Medicine names can have up to 120 characters.";
  if ([...body.strength].length > 60 || [...body.form].length > 60) return "Strength and form can have up to 60 characters.";
  if (!body.dose) return "Enter the dose exactly as written on your instructions.";
  if ([...body.dose].length > 120) return "Doses can have up to 120 characters.";
  if ([...body.instructions].length > 500) return "Extra instructions can have up to 500 characters.";
  if ([body.medicine_name, body.strength, body.form, body.dose, body.instructions].some(text => controls.test(text))) return "Remove control characters.";
  if (!form.source) return "Choose where these instructions came from.";
  if (form.times.some(time => time === "") && form.times.length > 1) return "Fill in or remove each empty daily time.";
  if (body.times.length === 0) return "Add at least one daily time.";
  if (new Set(form.times.filter(Boolean)).size !== form.times.filter(Boolean).length) return "List each daily time once.";
  if (body.times.length > MAX_TIMES) return `Use at most ${MAX_TIMES} daily times.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) return "Choose the first day.";
  if (body.end_date && body.end_date < body.start_date) return "The last day cannot be before the first day.";
  if (!body.timezone) return "Choose a time zone.";
  if (!form.confirmed) return "Confirm that these details match your instructions.";
  return null;
}

export function sameBody(left: CareBody, right: CareBody) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function checkOccurrenceList(day: CareDay, date: string) {
  const known = new Set(day.instructions.map(item => item.id));
  const seen = new Set<string>();
  for (const item of day.occurrences) {
    const key = `${item.instruction_id}|${item.local_time}`;
    if (day.local_date !== date || item.local_date !== date || !known.has(item.instruction_id) || seen.has(key)) {
      throw new ApiError(502, "INVALID_RESPONSE", "The day plan does not match your request.");
    }
    seen.add(key);
  }
  return day;
}

export async function listInstructions(accountId: string, status: "active" | "stopped", signal?: AbortSignal) {
  const result = await api(`care/instructions?status=${status}`, z.array(instructionSchema).max(30), { accountId, signal });
  if (new Set(result.data.map(item => item.id)).size !== result.data.length || result.data.some(item => item.status !== status)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The medicine list is incomplete.");
  }
  return result.data;
}

export async function createInstruction(intent: CreateIntent) {
  const result = await api("care/instructions", instructionSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  });
  const item = result.data;
  const same = item.medicine_name === intent.body.medicine_name && item.dose === intent.body.dose && item.timezone === intent.body.timezone
    && item.start_date === intent.body.start_date && JSON.stringify(item.times) === JSON.stringify(intent.body.times)
    && item.end_date === intent.body.end_date && item.source === intent.body.source && item.status === "active";
  if (!same) throw new ApiError(502, "INVALID_RESPONSE", "The saved instruction does not match what you confirmed.");
  return item;
}

export async function stopInstruction(accountId: string, item: CareInstruction, key: string) {
  const result = await api(`care/instructions/${item.id}/stop`, instructionSchema, {
    method: "POST", accountId, body: {}, headers: { "Idempotency-Key": key, "If-Match": item.etag },
  });
  if (result.data.id !== item.id || result.data.status !== "stopped") throw new ApiError(502, "INVALID_RESPONSE", "The stop could not be confirmed.");
  return result.data;
}

export async function careDay(accountId: string, date: string, signal?: AbortSignal) {
  const result = await api(`care/day?date=${date}`, daySchema, { accountId, signal });
  return checkOccurrenceList(result.data, date);
}

export type ReportIntent = { accountId: string; key: string; occurrence: Occurrence; outcome: DoseOutcome };

export async function reportDose(intent: ReportIntent) {
  const { occurrence, outcome } = intent;
  const result = await api(`care/instructions/${occurrence.instruction_id}/reports`, occurrenceSchema, {
    method: "POST", accountId: intent.accountId, body: { local_date: occurrence.local_date, local_time: occurrence.local_time, outcome },
    headers: { "Idempotency-Key": intent.key, "If-Match": occurrence.etag },
  });
  const item = result.data;
  if (item.instruction_id !== occurrence.instruction_id || item.local_date !== occurrence.local_date
    || item.local_time !== occurrence.local_time || item.report?.outcome !== outcome) {
    throw new ApiError(502, "INVALID_RESPONSE", "Your note could not be confirmed.");
  }
  return item;
}

export function formatDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}
