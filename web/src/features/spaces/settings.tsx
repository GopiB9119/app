"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, LoaderCircle, LockKeyhole, RefreshCw, Save, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import { changeVisibility, readSpaceSettings, saveSpaceSettings } from "./client";
import type { SpaceSettings, SpaceSettingsIntent, VisibilityIntent } from "./client";
import styles from "./spaces.module.css";

export function ManageSpaceSettings({ accountId, spaceId, onClose }: { accountId: string; spaceId: string; onClose: () => void }) {
  const cache = useQueryClient();
  const heading = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [basis, setBasis] = useState<SpaceSettings | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<SpaceSettingsIntent | null>(null);
  const [visibilityIntent, setVisibilityIntent] = useState<VisibilityIntent | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [discard, setDiscard] = useState<"close" | "reload" | null>(null);
  const [notice, setNotice] = useState("");
  const review = useQuery({ queryKey: ["spaceSettings", accountId, spaceId], enabled: basis === null,
    queryFn: ({ signal }) => readSpaceSettings(accountId, spaceId, signal), retry: false,
    networkMode: "always", refetchOnWindowFocus: false, gcTime: 0 });
  useEffect(() => { if (review.data && !basis) { setBasis(review.data); setName(review.data.name); setDescription(review.data.description); } }, [review.data, basis]);
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  const settled = async (result: SpaceSettings) => {
    setBasis(result); setName(result.name); setDescription(result.description); setConflict(false);
    await cache.invalidateQueries({ predicate: query => query.queryKey.includes(accountId) && query.queryKey[0] !== "spaceSettings" });
  };
  const failed = (error: Error, clear: () => void) => {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) { clear(); setConflict(true); }
  };
  const save = useMutation({ mutationFn: saveSpaceSettings, retry: false, networkMode: "always",
    onSuccess: async result => { setIntent(null); setNotice(`Settings saved. Current name: ${result.name}`); await settled(result); },
    onError: error => failed(error, () => setIntent(null)),
  });
  const visibility = useMutation({ mutationFn: changeVisibility, retry: false, networkMode: "always",
    onSuccess: async result => {
      setVisibilityIntent(null); setConfirming(false);
      setNotice(result.visibility === "public" ? "The group is public. People can find it and ask to join." : "The group is private. It no longer appears in Find groups, and waiting requests were closed.");
      await settled(result);
    },
    onError: error => failed(error, () => setVisibilityIntent(null)),
  });
  const problem = save.error ?? visibility.error ?? review.error;
  const denied = problem instanceof ApiError && ([401, 403, 404].includes(problem.status) || problem.code === "ACCOUNT_CHANGED");
  const locked = intent !== null || visibilityIntent !== null || save.isPending || visibility.isPending;
  const dirty = basis !== null && (name !== basis.name || description !== basis.description);
  useEffect(() => {
    if (!dirty && !locked) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, locked]);
  useEffect(() => {
    if (problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED")) {
      cache.clear(); window.location.replace(problem.status === 401 ? "/login" : "/app/spaces");
    }
  }, [problem, cache]);
  function close() { if (!locked || denied) { if (dirty && !denied) setDiscard("close"); else onClose(); } }
  async function reload() {
    setDiscard(null); save.reset(); visibility.reset(); setNotice(""); setConfirming(false);
    const result = await review.refetch();
    if (result.data && !result.isError) { setBasis(result.data); setName(result.data.name); setDescription(result.data.description); setConflict(false); }
  }
  const target = basis?.visibility === "public" ? "private" : "public";
  return <dialog ref={setDialog} className={styles.invitationDialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }}>
    <div className="dialog-heading"><h2 id={heading}>Space settings</h2><button className="icon-button" aria-label="Close Space settings" title="Close Space settings" disabled={locked && !denied} onClick={close}><X size={18} aria-hidden /></button></div>
    {problem && <p className="message error" role="alert">{problem.message}</p>}
    {notice && <p className="message success" role="status">{notice}</p>}
    {review.isFetching && <p role="status">Loading current settings...</p>}
    {!basis && review.isError && !denied && <button className="secondary-button" onClick={() => review.refetch()}><RefreshCw size={17} aria-hidden />Retry loading</button>}
    {!denied && basis && <>
      <dl className={styles.reviewFacts}><dt>Current name</dt><dd>{basis.name}</dd><dt>Visibility</dt><dd>{basis.visibility === "public" ? "Public: anyone signed in can find it and ask to join" : "Private: only people you invite"}</dd><dt>Space ID</dt><dd className={styles.accountCode}>{spaceId}</dd></dl>
      <form className={styles.form} onSubmit={event => {
        event.preventDefault();
        if (save.isPending || conflict || review.isFetching || !name.trim()) return;
        const command = intent ?? { accountId, spaceId, name: name.trim(), description: description.trim() === basis.description ? undefined : description.trim(), etag: basis.etag, key: crypto.randomUUID() };
        setIntent(command); setNotice(""); save.mutate(command);
      }}>
        <label>Space name<input name="settings_name" autoComplete="off" required maxLength={80} value={name} disabled={locked || review.isFetching} onChange={event => { setName(event.target.value); setNotice(""); }} /></label>
        <label>Description{basis.visibility === "public" ? " (shown in Find groups)" : " (only members see it)"}<textarea className={styles.textArea} name="settings_description" maxLength={280} value={description} disabled={locked || review.isFetching} onChange={event => { setDescription(event.target.value); setNotice(""); }} /></label>
        <span className={styles.counter}>{description.length}/280</span>
        {intent && !save.isPending && <p role="status">The result is unconfirmed. Retrying uses the original {intent.description === undefined ? "name" : "name, description"} and review.</p>}
        <button className="primary-button" type="submit" disabled={save.isPending || visibility.isPending || review.isFetching || conflict || !name.trim() || (!intent && name.trim() === basis.name && description.trim() === basis.description)}>
          {save.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <Save size={17} aria-hidden />}{intent && !save.isPending ? (intent.description === undefined ? "Retry original name" : "Retry original changes") : description.trim() === basis.description ? "Save name" : "Save changes"}
        </button>
      </form>
      {basis.space_type === "group" ? <div className={styles.invitationSection}>
        <h3>{basis.visibility === "public" ? <><Globe size={17} aria-hidden className={styles.publicMark} /> Public group</> : <><LockKeyhole size={17} aria-hidden /> Private group</>}</h3>
        {!confirming ? <button className="secondary-button" disabled={locked || dirty || conflict || review.isFetching} onClick={() => { setConfirming(true); setNotice(""); }}>
          {target === "public" ? <Globe size={17} aria-hidden /> : <LockKeyhole size={17} aria-hidden />}{target === "public" ? "Make this group public" : "Make this group private"}</button>
        : <div className={styles.noteForm}>
          <p>{target === "public"
            ? "Anyone signed in will be able to find this group's name and description, see how many members it has, and ask to join. You approve each person. Chats, tasks, events and the member list stay private to members."
            : "The group will disappear from Find groups. Anyone still waiting for an answer will see their request closed. Members and their content are not affected."}</p>
          {visibilityIntent && !visibility.isPending && <p role="status">The change is unconfirmed. Retrying sends exactly the same change.</p>}
          <div className={`dialog-actions ${styles.membershipActions}`}>
            <button className="secondary-button" disabled={visibility.isPending || visibilityIntent !== null} onClick={() => setConfirming(false)}>Keep it {basis.visibility}</button>
            <button className="primary-button" disabled={visibility.isPending} onClick={() => {
              const command = visibilityIntent ?? { accountId, spaceId, visibility: target, etag: basis.etag, key: crypto.randomUUID() };
              setVisibilityIntent(command); visibility.mutate(command);
            }}>{visibility.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : null}{visibilityIntent && !visibility.isPending ? "Retry" : target === "public" ? "Make public" : "Make private"}</button>
          </div>
        </div>}
        {dirty && !locked && <p className={styles.emptyNote}>Save or undo your edits before changing who can find the group.</p>}
      </div> : <p className={styles.description}><LockKeyhole size={14} aria-hidden /> Family, couple and solo Spaces are always private.</p>}
      {conflict && <button className="text-button" disabled={review.isFetching} onClick={() => setDiscard("reload")}><RefreshCw size={17} aria-hidden />Reload current settings</button>}
    </>}
    {discard && !locked && <div className={styles.invitationSection}>
      <p>Discard the unsaved {basis && description !== basis.description ? "changes" : "name"}{discard === "reload" ? " and load current settings" : ""}?</p>
      <div className={`dialog-actions ${styles.membershipActions}`}><button className="secondary-button" onClick={() => setDiscard(null)}>Keep editing</button><button className="primary-button" onClick={() => discard === "reload" ? reload() : onClose()}>{basis && description !== basis.description ? "Discard changes" : "Discard name"}</button></div>
    </div>}
  </dialog>;
}