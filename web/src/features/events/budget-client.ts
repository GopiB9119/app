import { z } from "zod";
import { ApiError, api, chars } from "@/features/identity/client";

// Event budgets (DEC-039): whole paise or cents from the server, never payments.
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const MAX_MINOR = 100_000_000_000;
export const MAX_CATEGORIES = 30;
export const MAX_CATEGORY_NAME = 60;
export const MAX_NOTE = 120;
// Contributions (DEC-041): what a person says they promised or gave; only they change it.
export const CONTRIBUTION_STATES = ["promised", "given"] as const;
export type ContributionState = (typeof CONTRIBUTION_STATES)[number];
export const MAX_CONTRIBUTIONS = 200;
// Splits (DEC-042): a plan for dividing the cost, never a bill. Percentages are hundredths of a percent.
export const SPLIT_METHODS = ["equal", "percentages", "amounts"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];
export const SPLIT_BASES = ["planned", "recorded"] as const;
export type SplitBase = (typeof SPLIT_BASES)[number];
export const MAX_SPLIT_PEOPLE = 100;
export const WHOLE_PERCENT = 10_000;

const uuid = z.string().uuid();
const minor = z.number().int().safe();
const categorySchema = z.object({
  id: uuid, name: chars(1, MAX_CATEGORY_NAME), estimate_minor: minor.min(0).max(MAX_MINOR),
  recorded_minor: minor.min(0), remaining_minor: minor,
});
const expenseSchema = z.object({
  id: uuid, amount_minor: minor.min(1).max(MAX_MINOR), category_id: uuid.nullable(), note: chars(0, MAX_NOTE),
  recorded_by_name: chars(1, 80).nullable(), recorded_at: z.string().datetime({ offset: true }), mine: z.boolean(), can_delete: z.boolean(),
});
const contributionSchema = z.object({
  id: uuid, amount_minor: minor.min(1).max(MAX_MINOR), state: z.enum(CONTRIBUTION_STATES), note: chars(1, MAX_NOTE).nullable(),
  contributor_name: chars(1, 80).nullable(), recorded_at: z.string().datetime({ offset: true }), mine: z.boolean(), can_change: z.boolean(),
});
const shareSchema = z.object({
  account_id: uuid.nullable(), name: chars(1, 80).nullable(), mine: z.boolean(), value: minor.min(0).max(MAX_MINOR).nullable(),
  share_minor: minor.min(0), rounded_up: z.boolean(),
});
const splitSchema = z.object({
  method: z.enum(SPLIT_METHODS), base: z.enum(SPLIT_BASES), base_minor: minor.min(0), people_count: z.number().int().min(1).max(MAX_SPLIT_PEOPLE),
  shares: z.array(shareSchema).max(MAX_SPLIT_PEOPLE), all_shares: z.boolean(), allocated_minor: minor.min(0), difference_minor: minor,
  rounding_count: z.number().int().min(0).max(MAX_SPLIT_PEOPLE),
});
const candidateSchema = z.object({ account_id: uuid, name: chars(1, 80) });
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
export const budgetSchema = z.object({
  event_id: uuid, currency: z.enum(CURRENCIES).nullable(),
  categories: z.array(categorySchema).max(MAX_CATEGORIES), expenses: z.array(expenseSchema).max(200),
  estimate_minor: minor.min(0), recorded_minor: minor.min(0), uncategorized_minor: minor.min(0), remaining_minor: minor,
  contributions: z.array(contributionSchema).max(MAX_CONTRIBUTIONS), all_contributions: z.boolean(),
  given_minor: minor.min(0), promised_minor: minor.min(0), contribution_count: z.number().int().min(0).max(MAX_CONTRIBUTIONS),
  split: splitSchema.nullable(), split_candidates: z.array(candidateSchema).max(1000),
  can_manage: z.boolean(), can_record: z.boolean(), etag: z.string().min(3).max(200).nullable(),
}).superRefine((value, context) => {
  const categories = new Set(value.categories.map(item => item.id));
  const recordedIn = (id: string | null) => total(value.expenses.filter(item => item.category_id === id).map(item => item.amount_minor));
  const contributed = (state: ContributionState) => total(value.contributions.filter(item => item.state === state).map(item => item.amount_minor));
  // Someone who does not manage the budget sees only their own contributions, so theirs can only be part of the totals.
  const contributions = value.all_contributions
    ? value.given_minor === contributed("given") && value.promised_minor === contributed("promised") && value.contribution_count === value.contributions.length
    : value.contributions.every(item => item.mine) && contributed("given") <= value.given_minor && contributed("promised") <= value.promised_minor
      && value.contributions.length <= value.contribution_count;
  const split = value.split;
  const sharesOf = (pick: (item: z.infer<typeof shareSchema>) => number) => split ? total(split.shares.map(pick)) : 0;
  // A split divides the current planned total or recorded spending; only set amounts may differ from it, and every
  // rounded share is counted, so the screen can say how the shares were made to add up.
  const splits = split === null || (
    split.base_minor === (split.base === "planned" ? value.estimate_minor : value.recorded_minor)
    && split.difference_minor === split.base_minor - split.allocated_minor
    && (split.method === "amounts" ? split.rounding_count === 0 : split.difference_minor === 0)
    && split.shares.every(item => split.method === "amounts" ? item.value === item.share_minor && !item.rounded_up
      : split.method === "equal" ? item.value === null : item.value !== null && item.value <= WHOLE_PERCENT)
    && (split.all_shares
      ? split.shares.length === split.people_count && sharesOf(item => item.share_minor) === split.allocated_minor
        && split.shares.filter(item => item.rounded_up).length === split.rounding_count
        && (split.method !== "percentages" || sharesOf(item => item.value ?? 0) === WHOLE_PERCENT)
        && (split.method !== "equal" || split.shares.every(item => item.share_minor - split.shares[split.shares.length - 1].share_minor <= 1))
      : split.shares.length <= 1 && split.shares.every(item => item.mine)));
  // Every total is a sum of the amounts shown, so a page that does not add up is refused rather than shown.
  if (categories.size !== value.categories.length || new Set(value.expenses.map(item => item.id)).size !== value.expenses.length
    || value.expenses.some(item => item.category_id !== null && !categories.has(item.category_id))
    || value.categories.some(item => item.recorded_minor !== recordedIn(item.id) || item.remaining_minor !== item.estimate_minor - item.recorded_minor)
    || value.estimate_minor !== total(value.categories.map(item => item.estimate_minor))
    || value.recorded_minor !== total(value.expenses.map(item => item.amount_minor))
    || value.uncategorized_minor !== recordedIn(null) || value.remaining_minor !== value.estimate_minor - value.recorded_minor
    || !contributions || new Set(value.contributions.map(item => item.id)).size !== value.contributions.length
    || value.contributions.some(item => item.can_change && !item.mine) || !splits
    || (value.split_candidates.length > 0 && !value.can_manage)
    || (value.currency === null && (value.categories.length > 0 || value.expenses.length > 0 || value.contribution_count > 0 || value.split !== null || value.can_record))
    || (value.can_manage && value.etag === null)) {
    context.addIssue({ code: "custom", message: "Inconsistent budget." });
  }
});
export type Budget = z.infer<typeof budgetSchema>;
export type BudgetCategory = Budget["categories"][number];
export type Expense = Budget["expenses"][number];
export type Contribution = Budget["contributions"][number];
export type PlanRow = { id: string | null; name: string; estimate: string };
export type ExpenseForm = { amount: string; categoryId: string; note: string };
export type ExpenseBody = { amount_minor: number; note: string; category_id?: string };
export type ExpenseIntent = { accountId: string; eventId: string; key: string; body: ExpenseBody };
export type ContributionForm = { amount: string; state: ContributionState | ""; note: string };
export type ContributionBody = { amount_minor: number; state: ContributionState; note?: string };
export type ContributionIntent = { accountId: string; eventId: string; key: string; body: ContributionBody };
export type SplitDraft = { method: SplitMethod; base: SplitBase; people: { accountId: string; value: string }[] };

const controls = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

/** Typed money to whole paise or cents, with no floating point: "1,234.5" is 123450. */
export function parseMinor(text: string) {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/[,\s]/g, ""));
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return value <= MAX_MINOR ? value : null;
}

/** Whole paise or cents as an exact decimal, for an input field: 123450 is "1234.50". */
export function minorText(value: number) {
  const size = Math.abs(value);
  const cents = size % 100;
  return `${value < 0 ? "-" : ""}${(size - cents) / 100}.${String(cents).padStart(2, "0")}`;
}

export function formatMoney(value: number, currency: Currency, locale?: string) {
  // Every listed currency has two decimal places, and the largest total stays well inside exact double precision.
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function planProblem(currency: string, rows: PlanRow[]) {
  if (!CURRENCIES.some(item => item === currency)) return "Choose a currency.";
  if (rows.length > MAX_CATEGORIES) return `A budget can have up to ${MAX_CATEGORIES} categories.`;
  const names = new Set<string>();
  for (const row of rows) {
    const name = clean(row.name);
    if (!name) return "Name each category.";
    if ([...name].length > MAX_CATEGORY_NAME) return `Category names can have up to ${MAX_CATEGORY_NAME} characters.`;
    if (controls.test(name)) return "Remove control characters.";
    if (names.has(name.toLocaleLowerCase())) return "Give each category a different name.";
    names.add(name.toLocaleLowerCase());
    if (parseMinor(row.estimate || "0") === null) return "Enter each planned amount as a number, such as 1500 or 1500.50.";
  }
  return null;
}

export function planBody(currency: Currency, rows: PlanRow[]) {
  return {
    currency,
    categories: rows.map(row => ({ ...(row.id ? { id: row.id } : {}), name: clean(row.name), estimate_minor: parseMinor(row.estimate || "0") ?? 0 })),
  };
}

export function expenseProblem(form: ExpenseForm) {
  const amount = parseMinor(form.amount);
  if (amount === null || amount < 1) return "Enter an amount, such as 250 or 250.75.";
  const note = clean(form.note);
  if (!note) return "Add a short note about what it was for.";
  if ([...note].length > MAX_NOTE) return `Notes can have up to ${MAX_NOTE} characters.`;
  if (controls.test(note)) return "Remove control characters.";
  return null;
}

export function expenseBody(form: ExpenseForm): ExpenseBody {
  return { amount_minor: parseMinor(form.amount) ?? 0, note: clean(form.note), ...(form.categoryId ? { category_id: form.categoryId } : {}) };
}

export function contributionProblem(form: ContributionForm) {
  const amount = parseMinor(form.amount);
  if (amount === null || amount < 1) return "Enter an amount, such as 250 or 250.75.";
  if (!CONTRIBUTION_STATES.some(item => item === form.state)) return "Choose promised or given.";
  const note = clean(form.note);
  if ([...note].length > MAX_NOTE) return `Notes can have up to ${MAX_NOTE} characters.`;
  if (controls.test(note)) return "Remove control characters.";
  return null;
}

export function contributionBody(form: ContributionForm): ContributionBody {
  const note = clean(form.note);
  return { amount_minor: parseMinor(form.amount) ?? 0, state: form.state as ContributionState, ...(note ? { note } : {}) };
}

/** A typed percentage to hundredths of a percent, with no floating point: "33.33" is 3333. */
export function parsePercent(text: string) {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return value <= WHOLE_PERCENT ? value : null;
}

/** Hundredths of a percent as an exact decimal: 3333 is "33.33". */
export function percentText(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function splitProblem(draft: SplitDraft) {
  if (draft.people.length === 0) return "Choose at least one person.";
  if (draft.people.length > MAX_SPLIT_PEOPLE) return `A split can include up to ${MAX_SPLIT_PEOPLE} people.`;
  if (draft.method === "percentages") {
    const values = draft.people.map(person => parsePercent(person.value));
    if (values.some(value => value === null)) return "Enter each percentage as a number from 0 to 100, such as 33.33.";
    if (total(values as number[]) !== WHOLE_PERCENT) return "The percentages must add up to 100.";
  }
  if (draft.method === "amounts" && draft.people.some(person => parseMinor(person.value) === null)) {
    return "Enter each amount as a number, such as 1500 or 1500.50.";
  }
  return null;
}

export function splitBody(draft: SplitDraft) {
  return {
    method: draft.method, base: draft.base,
    people: draft.people.map(person => ({
      account_id: person.accountId,
      ...(draft.method === "percentages" ? { value: parsePercent(person.value) ?? 0 } : draft.method === "amounts" ? { value: parseMinor(person.value) ?? 0 } : {}),
    })),
  };
}

function checked(budget: Budget, eventId: string) {
  if (budget.event_id !== eventId) throw new ApiError(502, "INVALID_RESPONSE", "The budget does not match this event.");
  return budget;
}

export async function readBudget(accountId: string, eventId: string, signal?: AbortSignal) {
  return checked((await api(`events/${eventId}/budget`, budgetSchema, { accountId, signal })).data, eventId);
}

export async function saveBudget(accountId: string, eventId: string, etag: string, body: ReturnType<typeof planBody>) {
  const saved = checked((await api(`events/${eventId}/budget`, budgetSchema, {
    method: "PUT", accountId, body, headers: { "If-Match": etag },
  })).data, eventId);
  if (saved.currency !== body.currency || saved.categories.map(item => item.name).join("\n") !== body.categories.map(item => item.name).join("\n")) {
    throw new ApiError(502, "INVALID_RESPONSE", "The saved budget does not match your changes.");
  }
  return saved;
}

export async function recordExpense(intent: ExpenseIntent) {
  const saved = checked((await api(`events/${intent.eventId}/expenses`, budgetSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  })).data, intent.eventId);
  if (!saved.expenses.some(item => item.mine && item.amount_minor === intent.body.amount_minor && item.note === intent.body.note
    && item.category_id === (intent.body.category_id ?? null))) {
    throw new ApiError(502, "INVALID_RESPONSE", "The expense could not be confirmed.");
  }
  return saved;
}

export async function deleteExpense(accountId: string, eventId: string, expenseId: string) {
  const saved = checked((await api(`events/${eventId}/expenses/${expenseId}`, budgetSchema, { method: "DELETE", accountId, body: {} })).data, eventId);
  if (saved.expenses.some(item => item.id === expenseId)) throw new ApiError(502, "INVALID_RESPONSE", "The deletion could not be confirmed.");
  return saved;
}

export async function recordContribution(intent: ContributionIntent) {
  const saved = checked((await api(`events/${intent.eventId}/contributions`, budgetSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  })).data, intent.eventId);
  if (!saved.contributions.some(item => item.mine && item.amount_minor === intent.body.amount_minor && item.state === intent.body.state
    && item.note === (intent.body.note ?? null))) {
    throw new ApiError(502, "INVALID_RESPONSE", "The contribution could not be confirmed.");
  }
  return saved;
}

export async function changeContribution(accountId: string, eventId: string, contributionId: string, state: ContributionState) {
  const saved = checked((await api(`events/${eventId}/contributions/${contributionId}`, budgetSchema, {
    method: "PUT", accountId, body: { state },
  })).data, eventId);
  if (!saved.contributions.some(item => item.id === contributionId && item.mine && item.state === state)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The change could not be confirmed.");
  }
  return saved;
}

export async function withdrawContribution(accountId: string, eventId: string, contributionId: string) {
  const saved = checked((await api(`events/${eventId}/contributions/${contributionId}`, budgetSchema, { method: "DELETE", accountId, body: {} })).data, eventId);
  if (saved.contributions.some(item => item.id === contributionId)) throw new ApiError(502, "INVALID_RESPONSE", "The withdrawal could not be confirmed.");
  return saved;
}

export async function saveSplit(accountId: string, eventId: string, etag: string, body: ReturnType<typeof splitBody>) {
  const saved = checked((await api(`events/${eventId}/budget/split`, budgetSchema, {
    method: "PUT", accountId, body, headers: { "If-Match": etag },
  })).data, eventId);
  if (saved.split === null || saved.split.method !== body.method || saved.split.base !== body.base || saved.split.people_count !== body.people.length) {
    throw new ApiError(502, "INVALID_RESPONSE", "The split could not be confirmed.");
  }
  return saved;
}

export async function removeSplit(accountId: string, eventId: string, etag: string) {
  const saved = checked((await api(`events/${eventId}/budget/split`, budgetSchema, {
    method: "DELETE", accountId, body: {}, headers: { "If-Match": etag },
  })).data, eventId);
  if (saved.split !== null) throw new ApiError(502, "INVALID_RESPONSE", "The removal could not be confirmed.");
  return saved;
}
