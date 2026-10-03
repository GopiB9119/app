"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Globe, LoaderCircle, LockKeyhole, RefreshCw, Save, UserPlus, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import { useText } from "@/features/i18n/i18n";
import { changeAgentPolicy, changeInvitePolicy, changeVisibility, characters, lengthProblem, readSpaceSettings, saveSpaceSettings } from "./client";
import type { AgentPolicyIntent, InvitePolicyIntent, SpaceSettings, SpaceSettingsIntent, VisibilityIntent } from "./client";
import styles from "./spaces.module.css";

export function ManageSpaceSettings({ accountId, spaceId, onClose }: { accountId: string; spaceId: string; onClose: () => void }) {
  const t = useText();
  const cache = useQueryClient();
  const heading = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [basis, setBasis] = useState<SpaceSettings | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<SpaceSettingsIntent | null>(null);
  const [visibilityIntent, setVisibilityIntent] = useState<VisibilityIntent | null>(null);
  const [inviteIntent, setInviteIntent] = useState<InvitePolicyIntent | null>(null);
  const [agentIntent, setAgentIntent] = useState<AgentPolicyIntent | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmingInvites, setConfirmingInvites] = useState(false);
  const [confirmingAgent, setConfirmingAgent] = useState(false);
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
  const invitePolicy = useMutation({ mutationFn: changeInvitePolicy, retry: false, networkMode: "always",
    onSuccess: async result => {
      setInviteIntent(null); setConfirmingInvites(false);
      setNotice(t(result.member_invites ? "spaces.settings.invites.nowEveryone" : "spaces.settings.invites.nowAdmins"));
      await settled(result);
    },
    onError: error => failed(error, () => setInviteIntent(null)),
  });
  const agentPolicy = useMutation({ mutationFn: changeAgentPolicy, retry: false, networkMode: "always",
    onSuccess: async result => {
      setAgentIntent(null); setConfirmingAgent(false);
      setNotice(t(result.agent_enabled ? "spaces.settings.agent.nowOn" : "spaces.settings.agent.nowOff"));
      await settled(result);
    },
    onError: error => failed(error, () => setAgentIntent(null)),
  });
  const problem = save.error ?? visibility.error ?? invitePolicy.error ?? agentPolicy.error ?? review.error;
  const denied = problem instanceof ApiError && ([401, 403, 404].includes(problem.status) || problem.code === "ACCOUNT_CHANGED");
  const locked = intent !== null || visibilityIntent !== null || inviteIntent !== null || agentIntent !== null || save.isPending || visibility.isPending || invitePolicy.isPending || agentPolicy.isPending;
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
    setDiscard(null); save.reset(); visibility.reset(); invitePolicy.reset(); agentPolicy.reset(); setNotice(""); setConfirming(false); setConfirmingInvites(false); setConfirmingAgent(false);
    const result = await review.refetch();
    if (result.data && !result.isError) { setBasis(result.data); setName(result.data.name); setDescription(result.data.description); setConflict(false); }
  }
  const target = basis?.visibility === "public" ? "private" : "public";
  const inviteTarget = basis ? !basis.member_invites : true;
  const agentTarget = basis ? !basis.agent_enabled : false;
  const nameProblem = lengthProblem(name, 80);
  const descriptionProblem = lengthProblem(description, 280);
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
        if (save.isPending || conflict || review.isFetching || !name.trim() || (!intent && (nameProblem !== null || descriptionProblem !== null))) return;
        const command = intent ?? { accountId, spaceId, name: name.trim(), description: description.trim() === basis.description ? undefined : description.trim(), etag: basis.etag, key: crypto.randomUUID() };
        setIntent(command); setNotice(""); save.mutate(command);
      }}>
        <label>Space name<input name="settings_name" autoComplete="off" required maxLength={160} value={name} disabled={locked || review.isFetching} onChange={event => { setName(event.target.value); setNotice(""); }} /></label>
        {nameProblem && <span className="field-error">{nameProblem}</span>}
        <label>Description{basis.visibility === "public" ? " (shown in Find groups)" : " (only members see it)"}<textarea className={styles.textArea} name="settings_description" maxLength={560} value={description} disabled={locked || review.isFetching} onChange={event => { setDescription(event.target.value); setNotice(""); }} /></label>
        <span className={styles.counter}>{characters(description)}/280</span>
        {descriptionProblem && <span className="field-error">{descriptionProblem}</span>}
        {intent && !save.isPending && <p role="status">The result is unconfirmed. Retrying uses the original {intent.description === undefined ? "name" : "name, description"} and review.</p>}
        <button className="primary-button" type="submit" disabled={save.isPending || visibility.isPending || invitePolicy.isPending || review.isFetching || conflict || !name.trim() || (!intent && (nameProblem !== null || descriptionProblem !== null)) || (!intent && name.trim() === basis.name && description.trim() === basis.description)}>
          {save.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <Save size={17} aria-hidden />}{intent && !save.isPending ? (intent.description === undefined ? "Retry original name" : "Retry original changes") : description.trim() === basis.description ? "Save name" : "Save changes"}
        </button>
      </form>
      {basis.space_type === "group" ? <div className={styles.invitationSection}>
        <h3>{basis.visibility === "public" ? <><Globe size={17} aria-hidden className={styles.publicMark} /> Public group</> : <><LockKeyhole size={17} aria-hidden /> Private group</>}</h3>
        {!confirming ? <button className="secondary-button" disabled={locked || dirty || conflict || review.isFetching || confirmingInvites || confirmingAgent} onClick={() => { setConfirming(true); setNotice(""); }}>
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
      {(basis.space_type === "family" || basis.space_type === "group") && <div className={styles.invitationSection}>
        <h3><UserPlus size={17} aria-hidden /> {t("spaces.settings.invites.title")}</h3>
        <p>{t(basis.member_invites ? "spaces.settings.invites.everyone" : "spaces.settings.invites.admins")}</p>
        {!confirmingInvites ? <button className="secondary-button" disabled={locked || dirty || conflict || review.isFetching || confirming || confirmingAgent} onClick={() => { setConfirmingInvites(true); setNotice(""); }}>
          <UserPlus size={17} aria-hidden />{t(inviteTarget ? "spaces.settings.invites.allow" : "spaces.settings.invites.restrict")}</button>
        : <div className={styles.noteForm}>
          <p>{t(inviteTarget ? "spaces.settings.invites.confirmOn" : "spaces.settings.invites.confirmOff")}</p>
          {inviteIntent && !invitePolicy.isPending && <p role="status">{t("spaces.settings.visibilityUnconfirmed")}</p>}
          <div className={`dialog-actions ${styles.membershipActions}`}>
            <button className="secondary-button" disabled={invitePolicy.isPending || inviteIntent !== null} onClick={() => setConfirmingInvites(false)}>{t(inviteTarget ? "spaces.settings.invites.keepAdmins" : "spaces.settings.invites.keepEveryone")}</button>
            <button className="primary-button" disabled={invitePolicy.isPending} onClick={() => {
              const command = inviteIntent ?? { accountId, spaceId, memberInvites: inviteTarget, etag: basis.etag, key: crypto.randomUUID() };
              setInviteIntent(command); invitePolicy.mutate(command);
            }}>{invitePolicy.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : null}{inviteIntent && !invitePolicy.isPending ? t("spaces.retry") : t(inviteTarget ? "spaces.settings.invites.turnOn" : "spaces.settings.invites.turnOff")}</button>
          </div>
        </div>}
        {dirty && !locked && <p className={styles.emptyNote}>{t("spaces.settings.invites.saveFirst")}</p>}
      </div>}
      <div className={styles.invitationSection}>
        <h3><Bot size={17} aria-hidden /> {t("spaces.settings.agent.title")}</h3>
        <p>{t(basis.agent_enabled ? "spaces.settings.agent.on" : "spaces.settings.agent.off")}</p>
        {!confirmingAgent ? <button className="secondary-button" disabled={locked || dirty || conflict || review.isFetching || confirming || confirmingInvites} onClick={() => { setConfirmingAgent(true); setNotice(""); }}>
          <Bot size={17} aria-hidden />{t(agentTarget ? "spaces.settings.agent.turnOnQuestion" : "spaces.settings.agent.turnOffQuestion")}</button>
        : <div className={styles.noteForm}>
          <p>{t(agentTarget ? "spaces.settings.agent.confirmOn" : "spaces.settings.agent.confirmOff", { space: basis.name })}</p>
          {agentIntent && !agentPolicy.isPending && <p role="status">{t("spaces.settings.visibilityUnconfirmed")}</p>}
          <div className={`dialog-actions ${styles.membershipActions}`}>
            <button className="secondary-button" disabled={agentPolicy.isPending || agentIntent !== null} onClick={() => setConfirmingAgent(false)}>{t(agentTarget ? "spaces.settings.agent.keepOff" : "spaces.settings.agent.keepOn")}</button>
            <button className="primary-button" disabled={agentPolicy.isPending} onClick={() => {
              const command = agentIntent ?? { accountId, spaceId, agentEnabled: agentTarget, etag: basis.etag, key: crypto.randomUUID() };
              setAgentIntent(command); agentPolicy.mutate(command);
            }}>{agentPolicy.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : null}{agentIntent && !agentPolicy.isPending ? t("spaces.retry") : t(agentTarget ? "spaces.settings.agent.turnOn" : "spaces.settings.agent.turnOff")}</button>
          </div>
        </div>}
      </div>
      {conflict && <button className="text-button" disabled={review.isFetching} onClick={() => setDiscard("reload")}><RefreshCw size={17} aria-hidden />Reload current settings</button>}
    </>}
    {discard && !locked && <div className={styles.invitationSection}>
      <p>Discard the unsaved {basis && description !== basis.description ? "changes" : "name"}{discard === "reload" ? " and load current settings" : ""}?</p>
      <div className={`dialog-actions ${styles.membershipActions}`}><button className="secondary-button" onClick={() => setDiscard(null)}>Keep editing</button><button className="primary-button" onClick={() => discard === "reload" ? reload() : onClose()}>{basis && description !== basis.description ? "Discard changes" : "Discard name"}</button></div>
    </div>}
  </dialog>;
}