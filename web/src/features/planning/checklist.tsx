"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { ApiError, characters } from "@/features/identity/client";
import { changeChecklist, readChecklist } from "./checklist-client";
import type { Checklist, ChecklistBody, ChecklistIntent, ChecklistItem } from "./checklist-client";
import styles from "./checklist.module.css";

export function TaskChecklist({ accountId, taskId, spaceId, onClose }: { accountId: string; taskId: string; spaceId: string; onClose: () => void }) {
  const cache = useQueryClient();
  const heading = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [basis, setBasis] = useState<Checklist | null>(null);
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ChecklistItem | null>(null);
  const [intent, setIntent] = useState<ChecklistIntent | null>(null);
  const [conflict, setConflict] = useState(false);
  const [discard, setDiscard] = useState<"close" | "reload" | null>(null);
  const [notice, setNotice] = useState("");
  // The server counts characters, so an emoji counts once.
  const titleTooLong = characters(title.trim()) > 200;
  const review = useQuery({ queryKey: ["checklist", accountId, taskId], enabled: basis === null,
    queryFn: ({ signal }) => readChecklist(accountId, taskId, spaceId, signal), retry: false, networkMode: "always", refetchOnWindowFocus: false, gcTime: 0 });
  useEffect(() => { if (!basis && review.data) setBasis(review.data); }, [basis, review.data]);
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  const mutation = useMutation({ mutationFn: changeChecklist, retry: false, networkMode: "always",
    onSuccess: async result => {
      setBasis(result); setTitle(""); setEditing(null); setRemoving(null); setIntent(null); setNotice("Checklist saved.");
      await cache.invalidateQueries({ queryKey: ["tasks", accountId, spaceId] });
    },
    onError: error => { if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) { setIntent(null); setConflict(true); } },
  });
  const problem = mutation.error ?? review.error;
  const denied = problem instanceof ApiError && ([401, 403, 404].includes(problem.status) || problem.code === "ACCOUNT_CHANGED");
  const locked = intent !== null || mutation.isPending || review.isFetching;
  const dirty = title.length > 0 || editing !== null;
  useEffect(() => {
    if (!dirty && !intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, intent]);
  useEffect(() => {
    if (problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED")) {
      cache.clear(); window.location.replace(problem.status === 401 ? "/login" : "/app/tasks");
    }
  }, [problem, cache]);
  function submit(body: ChecklistBody) {
    if (!basis || locked || conflict || denied) return;
    const command = { accountId, spaceId, taskId, body, etag: basis.etag, key: crypto.randomUUID() };
    setIntent(command); setNotice(""); mutation.mutate(command);
  }
  function close() { if (!locked || denied) { if (dirty && !denied) setDiscard("close"); else onClose(); } }
  async function reload() {
    setDiscard(null); mutation.reset(); setNotice("");
    const current = await review.refetch();
    if (current.data && !current.isError) { setBasis(current.data); setTitle(""); setEditing(null); setRemoving(null); setConflict(false); }
  }
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }}>
    <div className="dialog-heading"><h2 id={heading}>Task checklist</h2><button className="icon-button" aria-label="Close checklist" title="Close checklist" disabled={locked && !denied} onClick={close}><X size={18} aria-hidden /></button></div>
    {problem && <p className="message error" role="alert">{problem.message}</p>}
    {notice && <p className="message success" role="status">{notice}</p>}
    {review.isFetching && <p role="status">Loading checklist...</p>}
    {!basis && review.isError && !denied && <button className="secondary-button" onClick={() => review.refetch()}><RefreshCw size={17} aria-hidden />Retry loading</button>}
    {basis && !denied && <>
      <h3 className={styles.title}>{basis.task_title}</h3>
      <p className={styles.count}>{basis.items.filter(item => item.checked).length} of {basis.items.length} checked</p>
      <ul className={styles.list}>{basis.items.map(item => <li key={item.id}>
        <label className={styles.item}><input type="checkbox" checked={item.checked} disabled={locked || conflict || dirty || removing !== null || !basis.can_check} onChange={event => submit({ action: "check", item_id: item.id, checked: event.target.checked })} /><span>{item.title}</span></label>
        {basis.can_manage && <div className={styles.actions}>
          <button className="icon-button" title={`Edit ${item.title}`} aria-label={`Edit checklist item: ${item.title}`} disabled={locked || conflict || dirty || removing !== null} onClick={() => { setEditing(item.id); setTitle(item.title); setNotice(""); }}><Pencil size={17} aria-hidden /></button>
          <button className="icon-button" title={`Remove ${item.title}`} aria-label={`Remove checklist item: ${item.title}`} disabled={locked || conflict || dirty || removing !== null} onClick={() => { setRemoving(item); setNotice(""); }}><Trash2 size={17} aria-hidden /></button>
        </div>}
      </li>)}</ul>
      {basis.items.length === 0 && <p>No checklist items.</p>}
      {basis.can_manage && !removing && <form className={styles.form} onSubmit={event => { event.preventDefault(); if (title.trim() && !titleTooLong) submit(editing ? { action: "rename", item_id: editing, title: title.trim() } : { action: "add", title: title.trim() }); }}>
        <label>{editing ? "Item title" : "New item"}<input required value={title} disabled={locked} aria-invalid={titleTooLong || undefined} onChange={event => setTitle(event.target.value)} /></label>
        {titleTooLong && <p className="message error" role="alert">Use up to 200 characters.</p>}
        <div className={styles.commands}><button className="primary-button" disabled={locked || conflict || !title.trim() || titleTooLong}>{mutation.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : editing ? <Check size={17} aria-hidden /> : <Plus size={17} aria-hidden />}{editing ? "Save item" : "Add item"}</button>{editing && <button type="button" className="secondary-button" disabled={locked} onClick={() => { setEditing(null); setTitle(""); }}>Cancel edit</button>}</div>
      </form>}
      {removing && <div className={styles.review}><p>Remove {removing.title}?</p><div className={styles.commands}><button className="secondary-button" disabled={locked} onClick={() => setRemoving(null)}>Keep item</button><button className="primary-button" disabled={locked || conflict} onClick={() => submit({ action: "remove", item_id: removing.id })}><Trash2 size={17} aria-hidden />Remove item</button></div></div>}
      {intent && !mutation.isPending && <div className={styles.review}><p role="status">The change is unconfirmed.</p><button className="primary-button" onClick={() => mutation.mutate(intent)}><RefreshCw size={17} aria-hidden />Retry original change</button></div>}
      {conflict && <button className="text-button" disabled={locked} onClick={() => setDiscard("reload")}><RefreshCw size={17} aria-hidden />Reload current checklist</button>}
    </>}
    {discard && !locked && <div className={styles.review}><p>Discard the current draft{discard === "reload" ? " and review the latest checklist" : ""}?</p><div className={styles.commands}><button className="secondary-button" onClick={() => setDiscard(null)}>Keep editing</button><button className="primary-button" onClick={() => discard === "reload" ? reload() : onClose()}>Discard draft</button></div></div>}
  </dialog>;
}