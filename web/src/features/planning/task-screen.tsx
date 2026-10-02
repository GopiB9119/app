"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ZodError } from "zod";
import { Ban, Bell, CalendarDays, Check, ClipboardList, ListChecks, LoaderCircle, LockKeyhole, Pencil, Play, Plus, RefreshCw, RotateCcw, Save, UserRound, UsersRound, X } from "lucide-react";

import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { spacesSchema } from "@/features/spaces/client";
import { assigneesSchema, readTask, sendTask, statusLabels, taskBody, taskDraft, taskPage } from "./client";
import type { FamilyTask, TaskDraft, TaskIntent, TaskItem, TaskStatus } from "./client";
import styles from "./tasks.module.css";
import { TaskChecklist } from "./checklist";

const statusTexts = { open: "tasks.statusOpen", in_progress: "tasks.statusInProgress", completed: "tasks.statusCompleted", cancelled: "tasks.statusCancelled" } as const;
const actionTexts = { open: "tasks.reopen", in_progress: "tasks.start", completed: "tasks.complete", cancelled: "tasks.cancel" } as const;
const changedTexts = { open: "tasks.changedOpen", in_progress: "tasks.changedInProgress", completed: "tasks.changedCompleted", cancelled: "tasks.changedCancelled" } as const;

function isAccessError(error: Error | null) {
  return error instanceof ApiError && ([401, 403, 404].includes(error.status) || error.code === "ACCOUNT_CHANGED");
}

function useAccountGuard(error: Error | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED")) {
      queryClient.clear();
      window.location.replace(error.status === 401 ? "/login" : "/app/tasks");
    }
  }, [error, queryClient]);
}

export function TaskScreen({ initialSpaceId = "" }: { initialSpaceId?: string }) {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useAccountGuard(profile.error);
  if (profile.isPending) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("tasks.loadingScreen")}</main></Shell>;
  if (profile.isError || !profile.data) return <Shell account><main className={styles.main}><h1>{t("tasks.unavailable")}</h1><p className="message error" role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />{t("tasks.retry")}</button></main></Shell>;
  return <TaskWorkspace key={profile.data.data.id} user={profile.data.data} initialSpaceId={initialSpaceId} />;
}

function TaskWorkspace({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const t = useText();
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [busy, setBusy] = useState(false);
  const spaces = useQuery({ queryKey: ["spaces", user.id], queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }) });
  useAccountGuard(spaces.error);
  useEffect(() => {
    if (!spaceId && spaces.data?.data[0]) setSpaceId(spaces.data.data[0].id);
  }, [spaceId, spaces.data]);
  const selected = spaces.data?.data.find(space => space.id === spaceId);
  return <Shell account><main className={styles.main}>
    <nav className={styles.navigation} aria-label={t("tasks.workspace")}>
      <Link href="/app/settings/account"><UserRound size={18} aria-hidden />{t("tasks.account")}</Link>
      <Link href="/app/spaces"><UsersRound size={18} aria-hidden />{t("tasks.spaces")}</Link>
      <span aria-current="page"><ClipboardList size={18} aria-hidden />{t("tasks.title")}</span>
    </nav>
    <div className={styles.heading}><div><span className="section-kicker">{t(selected?.space_type === "solo" ? "tasks.personalPlanning" : "tasks.sharedPlanning")}</span><h1>{t(selected?.space_type === "solo" ? "tasks.myTasks" : "tasks.familyTasks")}</h1></div><span className={styles.private}><LockKeyhole size={16} aria-hidden />{t("tasks.private")}</span></div>
    {spaces.isPending && <p role="status">{t("tasks.loadingSpaces")}</p>}
    {spaces.isError && <div className="message error" role="alert">{spaces.error.message}<button className="text-button" onClick={() => spaces.refetch()}><RefreshCw size={16} aria-hidden />{t("tasks.retry")}</button></div>}
    {!spaces.isPending && !spaces.isError && <>
      {spaces.data?.data.length === 0 ? <div className={styles.empty}><UsersRound size={32} aria-hidden /><h2>{t("tasks.noSpaces")}</h2><Link href="/app/spaces">{t("tasks.openSpaces")}</Link></div> : <>
        <label className={styles.spaceSelector}><span id="task-space-label">{t(selected?.space_type === "solo" ? "tasks.soloSpace" : "tasks.familySpace")}</span><select aria-labelledby="task-space-label" value={spaceId} disabled={busy} onChange={event => setSpaceId(event.target.value)}>{!selected && <option value={spaceId}>{t("tasks.selectSpace")}</option>}{spaces.data?.data.map(space => <option value={space.id} key={space.id}>{space.name}</option>)}</select></label>
        {selected ? <TaskBoard key={selected.id} user={user} spaceId={selected.id} onBusy={setBusy} /> : <p className="message error" role="alert">{t("tasks.spaceUnavailable")}</p>}
      </>}
    </>}
  </main></Shell>;
}

function TaskBoard({ user, spaceId, onBusy }: { user: Account; spaceId: string; onBusy: (value: boolean) => void }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TaskStatus | "">("");
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [checklistTaskId, setChecklistTaskId] = useState<string | null>(null);
  const [review, setReview] = useState<{ task: TaskItem; target: TaskStatus; intent: TaskIntent } | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [accessError, setAccessError] = useState<Error | null>(null);
  const tasks = useInfiniteQuery({
    queryKey: ["tasks", user.id, spaceId, filter], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => taskPage(user.id, spaceId, filter, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
  });
  const changeStatus = useMutation({
    mutationFn: (intent: TaskIntent) => sendTask(intent, user.id),
    onMutate: () => { setNotice(""); setUncertain(true); },
    onSuccess: async task => {
      setUncertain(false); setReview(null); setNotice(t(changedTexts[task.status]));
      await queryClient.invalidateQueries({ queryKey: ["tasks", user.id, spaceId] });
    },
    onError: error => {
      if (isAccessError(error)) setAccessError(error);
      if (error instanceof ApiError && error.status > 0 && error.status < 500) {
        setUncertain(false); setReview(null);
        queryClient.invalidateQueries({ queryKey: ["tasks", user.id, spaceId] });
      }
    },
  });
  const blocked = !!accessError || isAccessError(tasks.error);
  useAccountGuard(accessError ?? tasks.error);
  const locked = createBusy || editBusy || editing !== null || review !== null || checklistTaskId !== null;
  useEffect(() => { onBusy(locked); return () => onBusy(false); }, [locked, onBusy]);
  useEffect(() => {
    if (!uncertain) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uncertain]);

  async function saved(task: FamilyTask, edited: boolean) {
    setEditing(null); setNotice(t(edited ? "tasks.saved" : "tasks.created"));
    await queryClient.invalidateQueries({ queryKey: ["tasks", user.id, spaceId] });
  }

  if (blocked) return <div className="message error" role="alert">{accessError?.message ?? tasks.error?.message}<Link href="/app/spaces">{t("tasks.returnSpaces")}</Link></div>;
  const rows = [...new Map(tasks.data?.pages.flatMap(page => page.data).map(task => [task.id, task] as const) ?? []).values()];
  return <>
    {notice && <p className="message success" role="status"><Check size={17} aria-hidden />{notice}</p>}
    <div className={styles.workspace}>
      <section className={styles.taskSection} aria-labelledby="tasks-title">
        <div className={styles.sectionHeading}><h2 id="tasks-title">{t("tasks.title")}</h2><button className="icon-button" title={t("tasks.refresh")} aria-label={t("tasks.refresh")} disabled={tasks.isFetching || locked} onClick={() => tasks.refetch()}><RefreshCw size={18} className={tasks.isFetching ? "spin" : ""} aria-hidden /></button></div>
        <label className={styles.filter}><span id="task-filter-label">{t("tasks.status")}</span><select aria-labelledby="task-filter-label" value={filter} disabled={locked} onChange={event => { setFilter(event.target.value as TaskStatus | ""); setNotice(""); changeStatus.reset(); }}><option value="">{t("tasks.allStatuses")}</option>{Object.keys(statusLabels).map(value => <option key={value} value={value}>{t(statusTexts[value as TaskStatus])}</option>)}</select></label>
        {tasks.isPending && <p role="status" aria-busy="true">{t("tasks.loadingList")}</p>}
        {tasks.isError && <div className="message error" role="alert">{tasks.error.message}<button className="text-button" onClick={() => tasks.refetch()}><RefreshCw size={16} aria-hidden />{t("tasks.retry")}</button></div>}
        {changeStatus.isError && !review && <p className="message error" role="alert">{changeStatus.error.message}</p>}
        {!tasks.isPending && !tasks.isError && rows.length === 0 && <div className={styles.empty}><ClipboardList size={30} strokeWidth={1.5} aria-hidden /><h3>{t("tasks.noTasks")}</h3></div>}
        {!tasks.isError && <ul className={styles.taskList}>{rows.map(task => <li key={task.id}>
          <div className={styles.taskRow}><h3>{task.title}</h3><span className={styles.taskStatus} data-status={task.status}>{t(statusTexts[task.status])}</span></div>
          <div className={styles.taskMetadata}><span><UserRound size={15} aria-hidden />{task.assignee?.display_name ?? t(task.assignee_unavailable ? "tasks.assigneeUnavailable" : "tasks.unassigned")}</span><span><CalendarDays size={15} aria-hidden />{task.due_date ? formatDateOnly(task.due_date, language) : t("tasks.noDueDate")}</span></div>
          {task.description && <details className={styles.notes}><summary>{t("tasks.notes")}</summary><p>{task.description}</p></details>}
          {task.completed_at && <p className={styles.completedAt}>{t("tasks.completedAt", { date: new Intl.DateTimeFormat(language === "en" ? "en" : `${language}-IN`, { dateStyle: "medium", timeStyle: "short", timeZone: user.timezone }).format(new Date(task.completed_at)) })}</p>}
          <div className={styles.taskActions}>
            <button className="icon-button" title={t("tasks.checklistTitle", { title: task.title })} aria-label={t("tasks.checklistTitle", { title: task.title })} disabled={locked} onClick={() => setChecklistTaskId(task.id)}><ListChecks size={18} aria-hidden /></button>
            {["open", "in_progress"].includes(task.status) && !locked && <Link className="icon-button" href={`/app/reminders?task_id=${task.id}`} title={t("tasks.remind")} aria-label={t("tasks.remindTitle", { title: task.title })}><Bell size={18} aria-hidden /></Link>}
            {task.permissions.can_edit && <button className="icon-button" title={t("tasks.edit")} aria-label={t("tasks.editTitle", { title: task.title })} disabled={locked} onClick={() => { setEditing(task); setNotice(""); }}><Pencil size={18} aria-hidden /></button>}
            {task.permissions.allowed_statuses.map(target => {
              const Icon = target === "completed" ? Check : target === "in_progress" ? Play : target === "open" ? RotateCcw : Ban;
              return <button key={target} className="icon-button" title={t(actionTexts[target])} aria-label={t("tasks.actionTitle", { action: t(actionTexts[target]), title: task.title })} disabled={locked} onClick={() => {
                changeStatus.reset(); setNotice("");
                setReview({ task, target, intent: { path: `tasks/${task.id}/status`, method: "POST", key: crypto.randomUUID(), body: { status: target }, etag: task.etag } });
              }}><Icon size={18} aria-hidden /></button>;
            })}
          </div>
        </li>)}</ul>}
        {tasks.hasNextPage && <button className="text-button" disabled={tasks.isFetching || locked} onClick={() => tasks.fetchNextPage()}>{t("tasks.more")}</button>}
      </section>
      <section className={styles.createSection} aria-labelledby="new-task-title"><div className={styles.sectionHeading}><Plus size={20} aria-hidden /><h2 id="new-task-title">{t("tasks.new")}</h2></div><TaskForm user={user} spaceId={spaceId} disabled={editing !== null || review !== null} onBusy={setCreateBusy} onFailure={setAccessError} onSaved={task => saved(task, false)} /></section>
    </div>
    {editing && <TaskDialog title={t("tasks.edit")} locked={editBusy} onClose={() => setEditing(null)}><TaskForm user={user} spaceId={spaceId} initial={editing} onBusy={setEditBusy} onFailure={setAccessError} onSaved={task => saved(task, true)} /></TaskDialog>}
    {checklistTaskId && <TaskChecklist accountId={user.id} taskId={checklistTaskId} spaceId={spaceId} onClose={() => setChecklistTaskId(null)} />}
    {review && <TaskDialog title={t("tasks.confirmAction", { action: t(actionTexts[review.target]) })} locked={changeStatus.isPending || uncertain} onClose={() => setReview(null)}>
      <p className={styles.reviewTitle}>{review.task.title}</p>
      {changeStatus.isError && <p className="message error" role="alert">{changeStatus.error.message}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={changeStatus.isPending || uncertain} onClick={() => setReview(null)}>{t("tasks.keepState")}</button><button className="primary-button" disabled={changeStatus.isPending} onClick={() => changeStatus.mutate(review.intent)}>{changeStatus.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Check size={17} aria-hidden />}{changeStatus.isError ? t("tasks.retryAction") : t(actionTexts[review.target])}</button></div>
    </TaskDialog>}
  </>;
}

function TaskForm({ user, spaceId, initial, disabled = false, onBusy, onFailure, onSaved }: {
  user: Account; spaceId: string; initial?: TaskItem; disabled?: boolean;
  onBusy: (value: boolean) => void; onFailure: (error: Error) => void; onSaved: (task: FamilyTask) => Promise<void>;
}) {
  const t = useText();
  const formId = useId();
  const [basis, setBasis] = useState(initial);
  const [draft, setDraft] = useState<TaskDraft>(() => taskDraft(initial));
  const [intent, setIntent] = useState<TaskIntent | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const assignees = useQuery({
    queryKey: ["taskAssignees", user.id, spaceId, basis?.id ?? "new"],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({ space_id: spaceId });
      if (basis) query.set("task_id", basis.id);
      return api(`tasks/assignees?${query}`, assigneesSchema, { accountId: user.id, signal });
    },
  });
  const mutation = useMutation({
    mutationFn: (command: TaskIntent) => sendTask(command, user.id),
    onSuccess: async result => { setIntent(null); setError(""); if (!basis) setDraft(taskDraft()); await onSaved(result); },
    onError: problem => {
      setError(problem.message);
      if (isAccessError(problem)) onFailure(problem);
      if (problem instanceof ApiError && problem.status > 0 && problem.status < 500) {
        setIntent(null);
        if (problem.status === 412 || problem.status === 428) setConflict(true);
      }
    },
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(taskDraft(basis));
  const locked = intent !== null || mutation.isPending || reloading;
  useEffect(() => { onBusy(locked || dirty); return () => onBusy(false); }, [locked, dirty, onBusy]);
  useEffect(() => {
    if (isAccessError(assignees.error) && assignees.error) onFailure(assignees.error);
  }, [assignees.error, onFailure]);
  useEffect(() => {
    if (!dirty && !locked) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, locked]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || conflict || disabled || assignees.isError) return;
    try {
      const command = intent ?? {
        path: basis ? `tasks/${basis.id}` : "tasks", method: basis ? "PATCH" as const : "POST" as const,
        key: crypto.randomUUID(), body: taskBody(draft, spaceId, basis), etag: basis?.etag,
      };
      setIntent(command); setError(""); mutation.mutate(command);
    } catch (problem) {
      // The draft schema's messages are written for people, such as "Use up to 200 characters."
      const message = problem instanceof ZodError ? problem.issues[0]?.message ?? t("tasks.checkTask")
        : problem instanceof Error && !problem.message.startsWith("[") ? problem.message : t("tasks.checkTask");
      const validationTexts: Record<string, string> = {
        "Enter a task title.": t("tasks.enterTitle"),
        "Use up to 200 characters.": t("tasks.maxCharacters", { count: 200 }),
        "Use up to 5000 characters.": t("tasks.maxCharacters", { count: 5000 }),
        "Enter a valid calendar date.": t("tasks.validDate"),
        "Select a current assignee.": t("tasks.currentAssignee"),
        "No changes to save.": t("tasks.noChanges"),
      };
      setError(validationTexts[message] ?? message);
    }
  }

  async function reload() {
    if (!basis) return;
    setReloading(true);
    try {
      const current = await readTask(basis.id, user.id);
      setBasis(current); setDraft(taskDraft(current)); setConflict(false); setError(""); mutation.reset();
      await assignees.refetch();
    } catch (problem) { setError((problem as Error).message); if (isAccessError(problem as Error)) onFailure(problem as Error); }
    finally { setReloading(false); }
  }

  const readOnly = !!basis && !basis.permissions.can_edit;
  const unavailableChoice = draft.assignee_account_id && draft.assignee_account_id !== "unavailable" && assignees.data && !assignees.data.data.some(item => item.account_id === draft.assignee_account_id);
  function field(name: keyof TaskDraft, value: string) { setDraft(current => ({ ...current, [name]: value })); setError(""); }
  return <form className={styles.form} onSubmit={submit}>
    <fieldset disabled={disabled || locked || readOnly}>
      <label>{t("tasks.titleLabel")}<input name="task_title" autoComplete="off" required maxLength={400} value={draft.title} onChange={event => field("title", event.target.value)} /></label>
      <label><span id={`${formId}-notes`}>{t("tasks.notes")}</span><textarea aria-labelledby={`${formId}-notes`} name="task_description" rows={4} maxLength={10000} value={draft.description} onChange={event => field("description", event.target.value)} /></label>
      <label>{t("tasks.dueDate")}<input name="task_due_date" type="date" value={draft.due_date} onChange={event => field("due_date", event.target.value)} /></label>
      <label><span id={`${formId}-assignee`}>{t("tasks.assignee")}</span><select aria-labelledby={`${formId}-assignee`} name="task_assignee" value={draft.assignee_account_id} disabled={assignees.isPending || assignees.isError} onChange={event => field("assignee_account_id", event.target.value)}>
        <option value="">{t("tasks.unassigned")}</option>
        {draft.assignee_account_id === "unavailable" && <option value="unavailable" disabled>{t("tasks.unavailableMember")}</option>}
        {unavailableChoice && <option value={draft.assignee_account_id} disabled>{t("tasks.unavailableMember")}</option>}
        {assignees.data?.data.map(member => <option key={member.account_id} value={member.account_id}>{member.display_name} ({member.account_id.slice(0, 8)})</option>)}
      </select></label>
    </fieldset>
    {assignees.isPending && <p role="status">{t("tasks.loadingAssignees")}</p>}
    {assignees.isError && <div className="message error" role="alert">{assignees.error.message}<button className="text-button" type="button" onClick={() => assignees.refetch()}>{t("tasks.retry")}</button></div>}
    {readOnly && <p className="message error" role="alert">{t("tasks.notEditable")}</p>}
    {error && <p className="message error" role="alert">{error}</p>}
    {conflict && <button className="secondary-button" type="button" disabled={reloading} onClick={reload}><RefreshCw size={17} aria-hidden />{t("tasks.discardReload")}</button>}
    <div className={styles.formActions}>
      <button className="primary-button" type="submit" disabled={mutation.isPending || reloading || disabled || conflict || readOnly || assignees.isPending || assignees.isError || !draft.title.trim()}>{mutation.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : basis ? <Save size={17} aria-hidden /> : <Plus size={17} aria-hidden />}{t(mutation.isPending ? "tasks.saving" : intent ? "tasks.retrySave" : basis ? "tasks.save" : "tasks.create")}</button>
      {dirty && !locked && !conflict && <button className="text-button" type="button" onClick={() => { setDraft(taskDraft(basis)); setError(""); }}>{t("tasks.discard")}</button>}
    </div>
  </form>;
}

function TaskDialog({ title, locked, onClose, children }: { title: string; locked: boolean; onClose: () => void; children: React.ReactNode }) {
  const t = useText();
  const [element, setElement] = useState<HTMLDialogElement | null>(null);
  useEffect(() => { element?.showModal(); return () => element?.close(); }, [element]);
  return <dialog ref={setElement} className={styles.dialog} aria-labelledby="task-dialog-title" onCancel={event => { if (locked) event.preventDefault(); else onClose(); }}><div className="dialog-heading"><h2 id="task-dialog-title">{title}</h2><button className="icon-button" title={t("tasks.closeDialog")} aria-label={t("tasks.closeDialog")} disabled={locked} onClick={onClose}><X size={18} aria-hidden /></button></div>{children}</dialog>;
}

function formatDateOnly(value: string, language: "en" | "te" | "hi" = "en") {
  return new Intl.DateTimeFormat(language === "en" ? "en" : `${language}-IN`, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}