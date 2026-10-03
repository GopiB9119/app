"use client";

import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Pencil, Plus, RefreshCw, Trash2, Undo2, X } from "lucide-react";

import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost } from "@/features/community/shared";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId, MessageValues } from "@/features/i18n/messages";
import {
  CONTRIBUTION_STATES, CURRENCIES, MAX_CATEGORIES, MAX_CATEGORY_NAME, MAX_NOTE, SPLIT_BASES, SPLIT_METHODS, changeContribution, contributionBody,
  contributionProblem, deleteExpense, expenseBody, expenseProblem, formatMoney, minorText, percentText, planBody, planProblem, readBudget,
  recordContribution, recordExpense, removeSplit, saveBudget, saveSplit, splitBody, splitProblem, withdrawContribution,
} from "./budget-client";
import type {
  Budget, ContributionForm, ContributionIntent, ContributionState, Currency, ExpenseForm, ExpenseIntent, PlanRow, SplitBase, SplitDraft, SplitMethod,
} from "./budget-client";
import styles from "./events.module.css";

type Text = ReturnType<typeof useText>;

// The checks answer in English; each of their sentences has its own text.
const localProblems = new Map<string, [MessageId, MessageValues?]>([
  ["Choose a currency.", ["events.budget.problem.currency"]],
  [`A budget can have up to ${MAX_CATEGORIES} categories.`, ["events.budget.problem.categoryCount", { limit: MAX_CATEGORIES }]],
  ["Name each category.", ["events.budget.problem.categoryName"]],
  [`Category names can have up to ${MAX_CATEGORY_NAME} characters.`, ["events.budget.problem.categoryNameLength", { limit: MAX_CATEGORY_NAME }]],
  ["Remove control characters.", ["events.problem.control"]],
  ["Give each category a different name.", ["events.budget.problem.categoryDuplicate"]],
  ["Enter each planned amount as a number, such as 1500 or 1500.50.", ["events.budget.problem.estimate"]],
  ["Enter an amount, such as 250 or 250.75.", ["events.budget.problem.amount"]],
  ["Add a short note about what it was for.", ["events.budget.problem.note"]],
  [`Notes can have up to ${MAX_NOTE} characters.`, ["events.budget.problem.noteLength", { limit: MAX_NOTE }]],
  ["Choose promised or given.", ["events.budget.problem.state"]],
  ["Choose at least one person.", ["events.budget.split.problem.people"]],
  ["Enter each percentage as a number from 0 to 100, such as 33.33.", ["events.budget.split.problem.percent"]],
  ["The percentages must add up to 100.", ["events.budget.split.problem.percentTotal"]],
  ["Enter each amount as a number, such as 1500 or 1500.50.", ["events.budget.split.problem.amount"]],
]);
const serverProblems: Record<string, MessageId> = {
  BUDGET_CHANGED: "events.budget.error.changed",
  BUDGET_CURRENCY_LOCKED: "events.budget.error.currencyLocked",
  CATEGORY_IN_USE: "events.budget.error.categoryInUse",
  CATEGORY_UNAVAILABLE: "events.budget.error.categoryGone",
  BUDGET_NOT_SET: "events.budget.error.notSet",
  EXPENSE_LIMIT_REACHED: "events.budget.error.limit",
  EVENT_CANCELLED: "events.budget.error.cancelled",
  EXPENSE_DELETE_DENIED: "events.budget.error.deleteDenied",
  EVENT_MANAGEMENT_DENIED: "events.budget.error.manageDenied",
  IDEMPOTENCY_CONFLICT: "events.budget.error.retryConflict",
  CONTRIBUTION_LIMIT_REACHED: "events.budget.error.contributionLimit",
  CONTRIBUTION_CHANGE_DENIED: "events.budget.error.changeDenied",
  CONTRIBUTION_NOT_FOUND: "events.budget.error.contributionGone",
  PERSON_UNAVAILABLE: "events.budget.error.personUnavailable",
};
const contributionProblems: Record<string, MessageId> = { ...serverProblems, IDEMPOTENCY_CONFLICT: "events.budget.error.retryConflictContribution" };

function localText(problem: string, t: Text) {
  const known = localProblems.get(problem);
  return known ? t(known[0], known[1]) : problem;
}

function budgetProblem(error: unknown, fallback: MessageId, t: Text, known = serverProblems) {
  if (error instanceof ApiError && Object.hasOwn(known, error.code)) return t(known[error.code]);
  return problemText(error, t(fallback), t);
}

let rowCount = 0;
const rowKey = () => `row-${++rowCount}`;

// An event's budget (DEC-039): planned and recorded amounts. Recording an expense never moves money.
export function EventBudget({ user, eventId }: { user: Account; eventId: string }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const titleId = useId();
  const [planning, setPlanning] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const budget = useQuery({ queryKey: ["eventBudget", user.id, eventId], queryFn: ({ signal }) => readBudget(user.id, eventId, signal) });
  // A read that started before the change would otherwise land afterwards and show the old budget again.
  const store = async (value: Budget) => {
    await queryClient.cancelQueries({ queryKey: ["eventBudget", user.id, eventId] });
    queryClient.setQueryData(["eventBudget", user.id, eventId], value);
  };
  const remove = useMutation({
    mutationFn: (expenseId: string) => deleteExpense(user.id, eventId, expenseId),
    onSuccess: value => { setConfirming(null); return store(value); },
    onError: error => { if (!isUnknown(error)) void budget.refetch(); },
  });
  const mark = useMutation({
    mutationFn: ({ id, state }: { id: string; state: ContributionState }) => changeContribution(user.id, eventId, id, state),
    onSuccess: store,
    onError: error => { if (!isUnknown(error)) void budget.refetch(); },
  });
  const withdraw = useMutation({
    mutationFn: (contributionId: string) => withdrawContribution(user.id, eventId, contributionId),
    onSuccess: value => { setWithdrawing(null); return store(value); },
    onError: error => { if (!isUnknown(error)) void budget.refetch(); },
  });
  const busy = remove.isPending || mark.isPending || withdraw.isPending;
  useEffect(() => {
    if (sessionLost(budget.error ?? remove.error ?? mark.error ?? withdraw.error)) { queryClient.clear(); window.location.replace("/login"); }
  }, [budget.error, remove.error, mark.error, withdraw.error, queryClient]);
  if (budget.isPending) return <section className={styles.budget} aria-busy="true"><p><LoaderCircle className="spin" aria-hidden />{t("events.budget.loading")}</p></section>;
  if (budget.isError) {
    return <section className={styles.budget} aria-labelledby={titleId}><h3 id={titleId}>{t("events.budget.title")}</h3>
      <p role="alert">{budgetProblem(budget.error, "events.budget.loadProblem", t)}</p>
      <div className={styles.actions}><button className="secondary-button" onClick={() => budget.refetch()}><RefreshCw size={16} aria-hidden />{t("events.retry")}</button></div>
    </section>;
  }
  const value = budget.data;
  const currency = value.currency;
  const money = (amount: number) => currency ? formatMoney(amount, currency, language) : "";
  const categoryNames = new Map(value.categories.map(item => [item.id, item.name]));
  const recordedAt = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
  return <section className={styles.budget} aria-labelledby={titleId} data-testid="event-budget">
    <h3 id={titleId}>{t("events.budget.title")}</h3>
    <p className={styles.meta}>{t("events.budget.notPayment")}</p>
    {currency === null ? <p className={styles.meta}>{t(value.can_manage ? "events.budget.noneManager" : "events.budget.none")}</p> : <>
      <dl className={styles.totals}>
        <div><dt>{t("events.budget.planned")}</dt><dd>{money(value.estimate_minor)}</dd></div>
        <div><dt>{t("events.budget.recorded")}</dt><dd>{money(value.recorded_minor)}</dd></div>
        <div className={value.remaining_minor < 0 ? styles.notice : undefined}>
          <dt>{t(value.remaining_minor < 0 ? "events.budget.over" : "events.budget.left")}</dt><dd>{money(Math.abs(value.remaining_minor))}</dd>
        </div>
      </dl>
      {value.categories.length > 0 && <ul className={styles.attendees}>{value.categories.map(category => <li key={category.id}>
        {t(category.remaining_minor < 0 ? "events.budget.categoryOver" : "events.budget.category", {
          name: category.name, planned: money(category.estimate_minor), recorded: money(category.recorded_minor), left: money(Math.abs(category.remaining_minor)),
        })}
      </li>)}</ul>}
      {value.uncategorized_minor > 0 && <p className={styles.meta}>{t("events.budget.uncategorized", { amount: money(value.uncategorized_minor) })}</p>}
    </>}
    {value.can_manage && !planning && <div className={styles.actions}>
      <button className="secondary-button" onClick={() => setPlanning(true)}><Pencil size={16} aria-hidden />{t(currency ? "events.budget.edit" : "events.budget.setUp")}</button>
    </div>}
    {planning && value.can_manage && <BudgetPlan user={user} eventId={eventId} budget={value}
      onClose={() => setPlanning(false)} onSaved={saved => { setPlanning(false); void store(saved); }}
      onReload={() => { setPlanning(false); void budget.refetch(); }} />}
    {currency !== null && <BudgetSplit user={user} eventId={eventId} budget={value} currency={currency} money={money}
      onSaved={store} onReload={() => void budget.refetch()} />}
    {value.can_record && currency && <ExpenseRecorder user={user} eventId={eventId} budget={value} currency={currency} onSaved={store} onRefresh={() => void budget.refetch()} />}
    {currency !== null && <>
      <h4>{t("events.budget.expenses")}</h4>
      {value.expenses.length === 0 ? <p className={styles.meta}>{t("events.budget.noExpenses")}</p>
        : <ul className={styles.expenses}>{value.expenses.map(expense => <li key={expense.id}>
          <p><strong>{money(expense.amount_minor)}</strong>{" · "}{expense.category_id ? categoryNames.get(expense.category_id) : t("events.budget.noCategory")}</p>
          {expense.note && <p className={styles.description}>{expense.note}</p>}
          <p className={styles.meta}>{t("events.budget.recordedBy", {
            name: expense.mine ? t("events.you") : expense.recorded_by_name ?? t("events.budget.deletedAccount"),
            when: recordedAt.format(new Date(expense.recorded_at)),
          })}</p>
          {expense.can_delete && confirming !== expense.id && <button className="text-button" disabled={busy}
            aria-label={t("events.budget.deleteNamed", { amount: money(expense.amount_minor), note: expense.note })}
            onClick={() => { remove.reset(); setConfirming(expense.id); }}><Trash2 size={16} aria-hidden />{t("events.budget.delete")}</button>}
          {expense.can_delete && confirming === expense.id && <div className={styles.confirm} role="group" aria-label={t("events.budget.confirmDelete")}>
            <p>{t("events.budget.deleteText", { amount: money(expense.amount_minor) })}</p>
            <div className={styles.actions}>
              <button className="primary-button" disabled={remove.isPending} onClick={() => remove.mutate(expense.id)}>{remove.isPending ? t("events.budget.deleting") : t("events.budget.deleteConfirm")}</button>
              <button className="secondary-button" disabled={remove.isPending} onClick={() => { setConfirming(null); remove.reset(); }}>{t("events.budget.keep")}</button>
            </div>
            {remove.isError && <p role="alert">{budgetProblem(remove.error, "events.budget.deleteProblem", t)}</p>}
          </div>}
        </li>)}</ul>}
      <h4>{t("events.budget.contributions")}</h4>
      <p className={styles.meta}>{t("events.budget.contributionsNote")}</p>
      <dl className={styles.totals}>
        <div><dt>{t("events.budget.given")}</dt><dd>{money(value.given_minor)}</dd></div>
        <div><dt>{t("events.budget.promised")}</dt><dd>{money(value.promised_minor)}</dd></div>
      </dl>
      <p className={styles.meta}>{t("events.budget.contributionCount", { count: value.contribution_count })}</p>
      {!value.all_contributions && <p className={styles.meta}>{t("events.budget.contributionsPrivate")}</p>}
      {value.can_record && <ContributionRecorder user={user} eventId={eventId} currency={currency} onSaved={store} onRefresh={() => void budget.refetch()} />}
      {value.contributions.length === 0
        ? <p className={styles.meta}>{t(value.all_contributions ? "events.budget.noContributions" : "events.budget.noOwnContributions")}</p>
        : <ul className={styles.expenses}>{value.contributions.map(contribution => {
          const other: ContributionState = contribution.state === "promised" ? "given" : "promised";
          const amount = money(contribution.amount_minor);
          return <li key={contribution.id} data-testid="budget-contribution">
            <p><strong>{amount}</strong>{" · "}{t(contribution.state === "given" ? "events.budget.stateGiven" : "events.budget.statePromised")}</p>
            {contribution.note && <p className={styles.description}>{contribution.note}</p>}
            <p className={styles.meta}>{t("events.budget.contributedBy", {
              name: contribution.mine ? t("events.you") : contribution.contributor_name ?? t("events.budget.deletedAccount"),
              when: recordedAt.format(new Date(contribution.recorded_at)),
            })}</p>
            {contribution.can_change && withdrawing !== contribution.id && <div className={styles.actions}>
              <button className="secondary-button" disabled={busy}
                aria-label={t(other === "given" ? "events.budget.markGivenNamed" : "events.budget.markPromisedNamed", { amount })}
                onClick={() => { withdraw.reset(); mark.mutate({ id: contribution.id, state: other }); }}>
                {t(other === "given" ? "events.budget.markGiven" : "events.budget.markPromised")}
              </button>
              <button className="text-button" disabled={busy} aria-label={t("events.budget.withdrawNamed", { amount })}
                onClick={() => { mark.reset(); withdraw.reset(); setWithdrawing(contribution.id); }}><Undo2 size={16} aria-hidden />{t("events.budget.withdraw")}</button>
            </div>}
            {mark.isError && mark.variables?.id === contribution.id && <p role="alert">{budgetProblem(mark.error, "events.budget.markProblem", t)}</p>}
            {contribution.can_change && withdrawing === contribution.id && <div className={styles.confirm} role="group" aria-label={t("events.budget.confirmWithdraw")}>
              <p>{t("events.budget.withdrawText", { amount })}</p>
              <div className={styles.actions}>
                <button className="primary-button" disabled={busy} onClick={() => withdraw.mutate(contribution.id)}>{withdraw.isPending ? t("events.budget.withdrawing") : t("events.budget.withdrawConfirm")}</button>
                <button className="secondary-button" disabled={busy} onClick={() => { setWithdrawing(null); withdraw.reset(); }}>{t("events.budget.keepContribution")}</button>
              </div>
              {withdraw.isError && <p role="alert">{budgetProblem(withdraw.error, "events.budget.withdrawProblem", t)}</p>}
            </div>}
          </li>;
        })}</ul>}
    </>}
  </section>;
}

function BudgetPlan({ user, eventId, budget, onClose, onSaved, onReload }: {
  user: Account; eventId: string; budget: Budget; onClose: () => void; onSaved: (budget: Budget) => void; onReload: () => void;
}) {
  const t = useText();
  const headingId = useId();
  // The version the draft started from: a newer one in the background must make the save fail, not overwrite it.
  const [etag] = useState(budget.etag ?? "");
  const [currency, setCurrency] = useState<string>(budget.currency ?? "");
  const [rows, setRows] = useState<(PlanRow & { key: string })[]>(() => budget.categories.map(item => ({
    key: rowKey(), id: item.id, name: item.name, estimate: minorText(item.estimate_minor),
  })));
  const [problem, setProblem] = useState<string | null>(null);
  const used = new Set(budget.categories.filter(item => item.recorded_minor > 0).map(item => item.id));
  const locked = budget.expenses.length > 0 || budget.contribution_count > 0 || budget.split !== null;
  const save = useMutation({
    mutationFn: () => saveBudget(user.id, eventId, etag, planBody(currency as Currency, rows)),
    onSuccess: onSaved,
  });
  const edit = (index: number, change: Partial<PlanRow>) => {
    setRows(rows.map((row, position) => position === index ? { ...row, ...change } : row));
    setProblem(null);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = planProblem(currency, rows);
    setProblem(found);
    if (!found) save.mutate();
  };
  return <form className={styles.confirm} aria-labelledby={headingId} onSubmit={submit} noValidate>
    <h4 id={headingId}>{t(budget.currency ? "events.budget.edit" : "events.budget.setUp")}</h4>
    <label className={styles.field}>{t("events.budget.currency")}
      <select name="budget_currency" value={currency} disabled={locked || save.isPending} onChange={event => { setCurrency(event.target.value); setProblem(null); }}>
        {!currency && <option value="" disabled>{t("events.budget.chooseCurrency")}</option>}
        {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
      </select>
    </label>
    {locked && <p className={styles.meta}>{t("events.budget.currencyLocked")}</p>}
    <fieldset className={styles.plan}>
      <legend>{t("events.budget.categories")}</legend>
      {rows.map((row, index) => <div key={row.key} className={styles.row}>
        <label className={styles.field}>{t("events.budget.categoryName", { number: index + 1 })}
          <input name={`budget_category_${index + 1}`} autoComplete="off" value={row.name} disabled={save.isPending} onChange={event => edit(index, { name: event.target.value })} />
        </label>
        <label className={styles.field}>{t("events.budget.estimate", { number: index + 1 })}
          <input name={`budget_estimate_${index + 1}`} inputMode="decimal" autoComplete="off" value={row.estimate} disabled={save.isPending} onChange={event => edit(index, { estimate: event.target.value })} />
        </label>
        {row.id && used.has(row.id) ? <p className={styles.meta}>{t("events.budget.categoryUsed")}</p>
          : <button type="button" className="text-button" disabled={save.isPending} aria-label={t("events.budget.removeCategory", { number: index + 1 })}
            onClick={() => { setRows(rows.filter((_, position) => position !== index)); setProblem(null); }}><X size={16} aria-hidden />{t("events.budget.remove")}</button>}
      </div>)}
      {rows.length < MAX_CATEGORIES && <div className={styles.actions}>
        <button type="button" className="secondary-button" disabled={save.isPending} onClick={() => setRows([...rows, { key: rowKey(), id: null, name: "", estimate: "" }])}>
          <Plus size={16} aria-hidden />{t("events.budget.addCategory")}
        </button>
      </div>}
    </fieldset>
    {problem && <p role="alert">{localText(problem, t)}</p>}
    {save.isError && <p role="alert">{budgetProblem(save.error, "events.budget.saveProblem", t)}</p>}
    <div className={styles.actions}>
      <button type="submit" className="primary-button" disabled={save.isPending}>{save.isPending ? t("events.saving") : t("events.budget.save")}</button>
      {save.isError && !isUnknown(save.error) && <button type="button" className="secondary-button" onClick={onReload}><RefreshCw size={16} aria-hidden />{t("events.budget.reload")}</button>}
      <button type="button" className="secondary-button" disabled={save.isPending} onClick={onClose}>{t("events.budget.closePlan")}</button>
    </div>
  </form>;
}

function ExpenseRecorder({ user, eventId, budget, currency, onSaved, onRefresh }: {
  user: Account; eventId: string; budget: Budget; currency: Currency; onSaved: (budget: Budget) => Promise<void>; onRefresh: () => void;
}) {
  const t = useText();
  const headingId = useId();
  const [form, setForm] = useState<ExpenseForm>({ amount: "", categoryId: "", note: "" });
  // The same details are sent with the same key, so a retry after a lost answer is not counted twice.
  const [intent, setIntent] = useState<ExpenseIntent | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const record = useMutation({
    mutationFn: recordExpense,
    onSuccess: async saved => { setForm({ amount: "", categoryId: "", note: "" }); setIntent(null); await onSaved(saved); },
    onError: error => { if (!isUnknown(error)) onRefresh(); },
  });
  const categoryId = budget.categories.some(item => item.id === form.categoryId) ? form.categoryId : "";
  const change = (next: Partial<ExpenseForm>) => { setForm({ ...form, ...next }); setProblem(null); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const filled = { ...form, categoryId };
    const found = expenseProblem(filled);
    setProblem(found);
    if (found) return;
    const body = expenseBody(filled);
    const next = intent && JSON.stringify(intent.body) === JSON.stringify(body) ? intent : { accountId: user.id, eventId, key: crypto.randomUUID(), body };
    setIntent(next);
    record.mutate(next);
  };
  return <form className={styles.rsvp} aria-labelledby={headingId} onSubmit={submit} noValidate>
    <h4 id={headingId}>{t("events.budget.record")}</h4>
    <div className={styles.row}>
      <label className={styles.field}>{t("events.budget.amount", { currency })}
        <input name="expense_amount" inputMode="decimal" autoComplete="off" value={form.amount} disabled={record.isPending} onChange={event => change({ amount: event.target.value })} />
      </label>
      {budget.categories.length > 0 && <label className={styles.field}>{t("events.budget.categoryField")}
        <select name="expense_category" value={categoryId} disabled={record.isPending} onChange={event => change({ categoryId: event.target.value })}>
          <option value="">{t("events.budget.noCategory")}</option>
          {budget.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
    </div>
    <label className={styles.field}>{t("events.budget.note")}
      <input name="expense_note" autoComplete="off" value={form.note} disabled={record.isPending} onChange={event => change({ note: event.target.value })} />
    </label>
    {problem && <p role="alert">{localText(problem, t)}</p>}
    {record.isError && <p role="alert">{budgetProblem(record.error, "events.budget.recordProblem", t)}{isUnknown(record.error) ? ` ${t("events.budget.retrySame")}` : ""}</p>}
    <div className={styles.actions}>
      <button type="submit" className="primary-button" disabled={record.isPending}>{record.isPending ? t("events.saving") : t("events.budget.recordButton")}</button>
    </div>
  </form>;
}

const NO_CONTRIBUTION: ContributionForm = { amount: "", state: "", note: "" };

// A person records only their own contribution (DEC-041), and must say whether it is promised or given.
function ContributionRecorder({ user, eventId, currency, onSaved, onRefresh }: {
  user: Account; eventId: string; currency: Currency; onSaved: (budget: Budget) => Promise<void>; onRefresh: () => void;
}) {
  const t = useText();
  const headingId = useId();
  const stateId = useId();
  const [form, setForm] = useState<ContributionForm>(NO_CONTRIBUTION);
  // The same details are sent with the same key, so a retry after a lost answer is not counted twice.
  const [intent, setIntent] = useState<ContributionIntent | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const record = useMutation({
    mutationFn: recordContribution,
    onSuccess: async saved => { setForm(NO_CONTRIBUTION); setIntent(null); await onSaved(saved); },
    onError: error => { if (!isUnknown(error)) onRefresh(); },
  });
  const change = (next: Partial<ContributionForm>) => { setForm({ ...form, ...next }); setProblem(null); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = contributionProblem(form);
    setProblem(found);
    if (found) return;
    const body = contributionBody(form);
    const next = intent && JSON.stringify(intent.body) === JSON.stringify(body) ? intent : { accountId: user.id, eventId, key: crypto.randomUUID(), body };
    setIntent(next);
    record.mutate(next);
  };
  return <form className={styles.rsvp} aria-labelledby={headingId} onSubmit={submit} noValidate>
    <h4 id={headingId}>{t("events.budget.contribute")}</h4>
    <label className={styles.field}>{t("events.budget.amount", { currency })}
      <input name="contribution_amount" inputMode="decimal" autoComplete="off" value={form.amount} disabled={record.isPending} onChange={event => change({ amount: event.target.value })} />
    </label>
    <p id={stateId} className={styles.meta}>{t("events.budget.contributionState")}</p>
    <div className={styles.tabs} role="group" aria-labelledby={stateId}>
      {CONTRIBUTION_STATES.map(value => <button key={value} type="button" className={styles.tab} aria-pressed={form.state === value}
        disabled={record.isPending} onClick={() => change({ state: value })}>
        {t(value === "given" ? "events.budget.stateGiven" : "events.budget.statePromised")}
      </button>)}
    </div>
    <label className={styles.field}>{t("events.budget.contributionNote")}
      <input name="contribution_note" autoComplete="off" value={form.note} disabled={record.isPending} onChange={event => change({ note: event.target.value })} />
    </label>
    {problem && <p role="alert">{localText(problem, t)}</p>}
    {record.isError && <p role="alert">{budgetProblem(record.error, "events.budget.contributeProblem", t, contributionProblems)}{isUnknown(record.error) ? ` ${t("events.budget.retrySame")}` : ""}</p>}
    <div className={styles.actions}>
      <button type="submit" className="primary-button" disabled={record.isPending}>{record.isPending ? t("events.saving") : t("events.budget.contributeButton")}</button>
    </div>
  </form>;
}

const METHOD_TEXT: Record<SplitMethod, [MessageId, MessageId]> = {
  equal: ["events.budget.split.equal", "events.budget.split.methodEqual"],
  percentages: ["events.budget.split.percentages", "events.budget.split.methodPercentages"],
  amounts: ["events.budget.split.amounts", "events.budget.split.methodAmounts"],
};
const BASE_TEXT: Record<SplitBase, MessageId> = { planned: "events.budget.split.basePlanned", recorded: "events.budget.split.baseRecorded" };

// How the cost is divided (DEC-042): a plan, never a bill. Members see their own share; managers see every share.
function BudgetSplit({ user, eventId, budget, currency, money, onSaved, onReload }: {
  user: Account; eventId: string; budget: Budget; currency: Currency; money: (amount: number) => string;
  onSaved: (budget: Budget) => Promise<void>; onReload: () => void;
}) {
  const t = useText();
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => removeSplit(user.id, eventId, budget.etag ?? ""),
    onSuccess: saved => { setConfirming(false); return onSaved(saved); },
    onError: error => { if (!isUnknown(error)) onReload(); },
  });
  const split = budget.split;
  const unit = money(1);
  const mine = split?.shares.find(item => item.mine);
  const shareText = (item: NonNullable<typeof split>["shares"][number]) => {
    const values = { name: item.mine ? t("events.you") : item.name ?? t("events.budget.deletedAccount"), amount: money(item.share_minor), unit };
    if (split?.method === "percentages") {
      return t(item.rounded_up ? "events.budget.split.sharePercentRounded" : "events.budget.split.sharePercent", { ...values, percent: percentText(item.value ?? 0) });
    }
    return t(item.rounded_up ? "events.budget.split.shareRounded" : "events.budget.split.share", values);
  };
  return <section className={styles.budget} aria-labelledby={headingId} data-testid="budget-split">
    <h4 id={headingId}>{t("events.budget.split.title")}</h4>
    <p className={styles.meta}>{t("events.budget.split.notBill")}</p>
    {split === null ? <p className={styles.meta}>{t(budget.can_manage ? "events.budget.split.noneManager" : "events.budget.split.none")}</p> : <>
      <p>{t(METHOD_TEXT[split.method][0], { base: t(BASE_TEXT[split.base]), amount: money(split.base_minor) })}</p>
      <p className={styles.meta}>{t("events.budget.split.people", { count: split.people_count })}</p>
      {!split.all_shares && (mine
        ? <p><strong>{t(mine.rounded_up ? "events.budget.split.yourShareRounded" : "events.budget.split.yourShare", { amount: money(mine.share_minor), unit })}</strong></p>
        : <p>{t("events.budget.split.notIncluded")}</p>)}
      {split.all_shares && <ul className={styles.attendees}>{split.shares.map((item, index) => <li key={item.account_id ?? `deleted-${index}`}>{shareText(item)}</li>)}</ul>}
      {split.rounding_count > 0 && <p className={styles.meta}>{t("events.budget.split.rounding", { count: split.rounding_count, unit })}</p>}
      {split.difference_minor !== 0 && <p className={styles.notice}>{t(split.difference_minor > 0 ? "events.budget.split.under" : "events.budget.split.over", {
        allocated: money(split.allocated_minor), difference: money(Math.abs(split.difference_minor)),
      })}</p>}
    </>}
    {budget.can_manage && !editing && !confirming && <div className={styles.actions}>
      <button className="secondary-button" disabled={remove.isPending} onClick={() => setEditing(true)}>{t(split ? "events.budget.split.edit" : "events.budget.split.add")}</button>
      {split && <button className="text-button" onClick={() => { remove.reset(); setConfirming(true); }}><Trash2 size={16} aria-hidden />{t("events.budget.split.remove")}</button>}
    </div>}
    {budget.can_manage && confirming && <div className={styles.confirm} role="group" aria-label={t("events.budget.split.confirmRemove")}>
      <p>{t("events.budget.split.removeText")}</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? t("events.budget.deleting") : t("events.budget.split.removeConfirm")}</button>
        <button className="secondary-button" disabled={remove.isPending} onClick={() => { setConfirming(false); remove.reset(); }}>{t("events.budget.split.keep")}</button>
      </div>
      {remove.isError && <p role="alert">{budgetProblem(remove.error, "events.budget.split.removeProblem", t)}</p>}
    </div>}
    {budget.can_manage && editing && <SplitEditor user={user} eventId={eventId} budget={budget} currency={currency}
      onClose={() => setEditing(false)} onSaved={saved => { setEditing(false); void onSaved(saved); }}
      onReload={() => { setEditing(false); onReload(); }} />}
  </section>;
}

function SplitEditor({ user, eventId, budget, currency, onClose, onSaved, onReload }: {
  user: Account; eventId: string; budget: Budget; currency: Currency; onClose: () => void; onSaved: (budget: Budget) => void; onReload: () => void;
}) {
  const t = useText();
  const headingId = useId();
  // The version the draft started from: a newer one must make the save fail, not overwrite it.
  const [etag] = useState(budget.etag ?? "");
  const [draft, setDraft] = useState<SplitDraft>(() => {
    const split = budget.split;
    const candidates = new Set(budget.split_candidates.map(item => item.account_id));
    return {
      method: split?.method ?? "equal", base: split?.base ?? "planned",
      people: (split?.shares ?? []).filter(item => item.account_id !== null && candidates.has(item.account_id)).map(item => ({
        accountId: item.account_id ?? "",
        value: item.value === null ? "" : split?.method === "percentages" ? percentText(item.value) : minorText(item.value),
      })),
    };
  });
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({ mutationFn: () => saveSplit(user.id, eventId, etag, splitBody(draft)), onSuccess: onSaved });
  const change = (next: Partial<SplitDraft>) => { setDraft({ ...draft, ...next }); setProblem(null); };
  const chosen = new Map(draft.people.map(person => [person.accountId, person.value]));
  const toggle = (accountId: string, on: boolean) => change({
    people: on ? [...draft.people, { accountId, value: "" }] : draft.people.filter(person => person.accountId !== accountId),
  });
  const setValue = (accountId: string, value: string) => change({ people: draft.people.map(person => person.accountId === accountId ? { ...person, value } : person) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = splitProblem(draft);
    setProblem(found);
    if (!found) save.mutate();
  };
  return <form className={styles.confirm} aria-labelledby={headingId} onSubmit={submit} noValidate>
    <h4 id={headingId}>{t(budget.split ? "events.budget.split.edit" : "events.budget.split.add")}</h4>
    <div className={styles.row}>
      <label className={styles.field}>{t("events.budget.split.method")}
        <select name="split_method" value={draft.method} disabled={save.isPending} onChange={event => change({ method: event.target.value as SplitMethod })}>
          {SPLIT_METHODS.map(method => <option key={method} value={method}>{t(METHOD_TEXT[method][1])}</option>)}
        </select>
      </label>
      <label className={styles.field}>{t("events.budget.split.base")}
        <select name="split_base" value={draft.base} disabled={save.isPending} onChange={event => change({ base: event.target.value as SplitBase })}>
          {SPLIT_BASES.map(base => <option key={base} value={base}>{t(BASE_TEXT[base])}</option>)}
        </select>
      </label>
    </div>
    <fieldset className={styles.plan}>
      <legend>{t("events.budget.split.peopleLegend")}</legend>
      {budget.split_candidates.map(candidate => {
        const value = chosen.get(candidate.account_id);
        return <div key={candidate.account_id} className={styles.row}>
          <label className={styles.check}>
            <input type="checkbox" name="split_person" checked={value !== undefined} disabled={save.isPending}
              onChange={event => toggle(candidate.account_id, event.target.checked)} />{candidate.name}
          </label>
          {value !== undefined && draft.method !== "equal" && <label className={styles.field}>
            {draft.method === "percentages" ? t("events.budget.split.percentFor", { name: candidate.name }) : t("events.budget.split.amountFor", { name: candidate.name, currency })}
            <input name="split_value" inputMode="decimal" autoComplete="off" value={value} disabled={save.isPending} onChange={event => setValue(candidate.account_id, event.target.value)} />
          </label>}
        </div>;
      })}
    </fieldset>
    {problem && <p role="alert">{localText(problem, t)}</p>}
    {save.isError && <p role="alert">{budgetProblem(save.error, "events.budget.split.saveProblem", t)}</p>}
    <div className={styles.actions}>
      <button type="submit" className="primary-button" disabled={save.isPending}>{save.isPending ? t("events.saving") : t("events.budget.split.save")}</button>
      {save.isError && !isUnknown(save.error) && <button type="button" className="secondary-button" onClick={onReload}><RefreshCw size={16} aria-hidden />{t("events.budget.reload")}</button>}
      <button type="button" className="secondary-button" disabled={save.isPending} onClick={onClose}>{t("events.budget.split.close")}</button>
    </div>
  </form>;
}
