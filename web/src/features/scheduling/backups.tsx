"use client";

import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, RefreshCw, UserRoundCheck, UserRoundPlus, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { askBackup, backupContacts, backupPage, backupStatusLabels, backupWaits, respondBackup } from "@/features/notifications/alerts-client";
import type { BackupIntent, BackupWait, ReminderBackup } from "@/features/notifications/alerts-client";
import { protectedReminderError } from "./reminder-common";
import styles from "./reminders.module.css";

const waitLabel = (minutes: number) => backupWaits.find(item => item.minutes === minutes)?.label ?? `${minutes} minutes`;

/** A backup person agrees to be told, in this app, when your reminder for one task goes unanswered. */
export function BackupPeople({ user, taskId, disabled, onLocked, onDenied, onNotice }: {
  user: Account; taskId: string; disabled: boolean; onLocked: (locked: boolean) => void; onDenied: (error: Error) => void; onNotice: (message: string) => void;
}) {
  const client = useQueryClient();
  const titleId = useId();
  const [contact, setContact] = useState("");
  const [wait, setWait] = useState<BackupWait>(30);
  const [intent, setIntent] = useState<BackupIntent | null>(null);
  const [error, setError] = useState("");
  const asked = useInfiniteQuery({
    queryKey: ["reminderBackups", user.id, "contact"], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => backupPage(user.id, "contact", undefined, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
  });
  const mine = useInfiniteQuery({
    queryKey: ["reminderBackups", user.id, "owner", taskId], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => backupPage(user.id, "owner", taskId || undefined, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
  });
  const people = useQuery({ queryKey: ["backupContacts", user.id, taskId], enabled: !!taskId, queryFn: ({ signal }) => backupContacts(user.id, taskId, signal) });
  const refresh = () => client.invalidateQueries({ queryKey: ["reminderBackups", user.id] });
  const ask = useMutation({
    mutationFn: askBackup,
    onSuccess: async result => { setIntent(null); setContact(""); setError(""); onNotice(`Asked ${result.contact.display_name || "them"} to be your backup person.`); await refresh(); },
    onError: problem => {
      setError(problem.message);
      if (protectedReminderError(problem)) onDenied(problem);
      if (problem instanceof ApiError && problem.status >= 400 && problem.status < 500 && problem.status !== 408) setIntent(null);
    },
  });
  const respond = useMutation({
    mutationFn: (command: { backup: ReminderBackup; action: "accept" | "decline" | "cancel" }) => respondBackup(user.id, command.backup, command.action),
    onSuccess: async (_result, command) => {
      setError("");
      onNotice(command.action === "accept" ? "You agreed to be the backup person." : command.action === "decline" ? "Request declined." : "Backup person stopped.");
      await refresh();
    },
    onError: problem => { setError(problem.message); if (protectedReminderError(problem)) onDenied(problem); void refresh(); },
  });
  const locked = ask.isPending || intent !== null || respond.isPending;
  useEffect(() => { onLocked(locked); return () => onLocked(false); }, [locked, onLocked]);
  useEffect(() => {
    const problem = asked.error ?? mine.error ?? people.error;
    if (problem && protectedReminderError(problem)) onDenied(problem);
  }, [asked.error, mine.error, people.error, onDenied]);
  const busy = disabled || locked;
  const requests = [...new Map(asked.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()]
    .filter(item => ["pending", "active"].includes(item.status));
  const own = [...new Map(mine.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];
  const current = own.find(item => ["pending", "active"].includes(item.status) && (!taskId || item.task_id === taskId));
  return <section className={styles.requests} aria-labelledby={titleId}>
    <div className={styles.sectionHeading}><h2 id={titleId}>Backup people</h2><button className="icon-button" aria-label="Refresh backup people" title="Refresh backup people" disabled={busy || asked.isFetching || mine.isFetching} onClick={() => { void asked.refetch(); void mine.refetch(); }}><RefreshCw size={18} className={asked.isFetching || mine.isFetching ? "spin" : ""} /></button></div>
    <p className={styles.disclosure}>A backup person sees an alert in this app when your reminder for a task stays unanswered for the time you choose. They agree first, and either of you can stop it. Nothing is sent outside the app.</p>
    {error && <p className="message error" role="alert">{error}</p>}
    {(asked.error || mine.error) && <p className="message error" role="alert">{(asked.error ?? mine.error)?.message}</p>}
    <h3 className={styles.subheading}>Asked of you</h3>
    {asked.isPending && <p role="status">Loading requests...</p>}
    {asked.data && requests.length === 0 && <p className={styles.empty}>No one has asked you.</p>}
    <ul className={styles.list}>{requests.map(item => <li key={item.id}>
      <div className={styles.rowHeading}><h3>{item.task_title}</h3><span className={styles.status}>{backupStatusLabels[item.status]}</span></div>
      <span>{item.owner.display_name || "Someone"} asks you to be told if a reminder stays unanswered for {waitLabel(item.wait_minutes)}.</span>
      <div className={styles.actions}>
        {item.status === "pending" && <button className="primary-button" disabled={busy} onClick={() => respond.mutate({ backup: item, action: "accept" })}><Check size={17} />Agree</button>}
        {item.status === "pending" && <button className="secondary-button" disabled={busy} onClick={() => respond.mutate({ backup: item, action: "decline" })}><X size={17} />Decline</button>}
        {item.status === "active" && <button className="secondary-button" aria-label={`Stop being backup person: ${item.task_title}`} disabled={busy} onClick={() => respond.mutate({ backup: item, action: "cancel" })}><X size={17} />Stop</button>}
      </div>
    </li>)}</ul>
    <h3 className={styles.subheading}>{taskId ? "For this task" : "People you asked"}</h3>
    {mine.isPending && <p role="status">Loading backup people...</p>}
    {mine.data && own.length === 0 && <p className={styles.empty}>You have not asked anyone{taskId ? " for this task" : ""}.</p>}
    <ul className={styles.list}>{own.map(item => <li key={item.id}>
      <div className={styles.rowHeading}><h3>{item.contact.display_name || "Member"}</h3><span className={styles.status}>{backupStatusLabels[item.status]}</span></div>
      <span>{item.task_title} / after {waitLabel(item.wait_minutes)}</span>
      {["pending", "active"].includes(item.status) && <div className={styles.actions}><button className="secondary-button" aria-label={`Stop backup person: ${item.contact.display_name}`} disabled={busy} onClick={() => respond.mutate({ backup: item, action: "cancel" })}><X size={17} />Stop</button></div>}
    </li>)}</ul>
    {(asked.hasNextPage || mine.hasNextPage) && <button className="text-button" disabled={busy} onClick={() => { if (asked.hasNextPage) void asked.fetchNextPage(); if (mine.hasNextPage) void mine.fetchNextPage(); }}>Load more</button>}
    {taskId && !current && <form className={styles.form} onSubmit={event => {
      event.preventDefault();
      if (!contact) return;
      const command = intent ?? { accountId: user.id, taskId, contactId: contact, waitMinutes: wait, key: crypto.randomUUID() };
      setIntent(command); setError(""); ask.mutate(command);
    }}>
      <label><span id={`${titleId}-person`}>Ask someone who can see this task</span><select aria-labelledby={`${titleId}-person`} name="backup_contact" value={contact} disabled={busy || intent !== null} onChange={event => setContact(event.target.value)}>
        <option value="">Choose a person</option>{people.data?.map(person => <option key={person.account_id} value={person.account_id}>{person.display_name || "Member"}</option>)}
      </select></label>
      {people.data?.length === 0 && <p className={styles.empty}>No one else can see this task.</p>}
      <label><span id={`${titleId}-wait`}>Alert them if unanswered after</span><select aria-labelledby={`${titleId}-wait`} name="backup_wait" value={wait} disabled={busy || intent !== null} onChange={event => setWait(Number(event.target.value) as BackupWait)}>
        {backupWaits.map(choice => <option key={choice.minutes} value={choice.minutes}>{choice.label}</option>)}
      </select></label>
      <button className="secondary-button" type="submit" disabled={disabled || ask.isPending || !contact}>{ask.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : <UserRoundPlus size={17} />}{intent && !ask.isPending ? "Retry original request" : "Ask to be backup"}</button>
    </form>}
    {taskId && current && <p className={styles.reason}><UserRoundCheck size={15} aria-hidden /> This task already has a backup person. Stop it to ask someone else.</p>}
  </section>;
}
