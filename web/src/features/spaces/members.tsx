"use client";

import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crown, LoaderCircle, LogOut, RefreshCw, ShieldCheck, UserRound, UserRoundMinus, UsersRound, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { formatDateTime, useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId, MessageValues } from "@/features/i18n/messages";
import { changeOwnership, changeRole, endMembership, ownershipPage, readMembers } from "./client";
import type { FamilySpace, MembershipIntent, OwnershipIntent, OwnershipTransfer, RoleIntent, SpaceMember } from "./client";
import styles from "./spaces.module.css";

type Selection = { member: SpaceMember; action: "remove" | "leave" };
type RoleSelection = { member: SpaceMember; role: "admin" | "member" };
const roleLabels: Record<SpaceMember["role"], MessageId> = { owner: "spaces.role.owner", admin: "spaces.role.admin", member: "spaces.role.member" };
const ownershipLabels: Record<OwnershipTransfer["status"], MessageId> = {
  pending: "spaces.ownership.status.pending", accepted: "spaces.ownership.status.accepted", declined: "spaces.ownership.status.declined",
  cancelled: "spaces.ownership.status.cancelled", expired: "spaces.ownership.status.expired", invalidated: "spaces.ownership.status.invalidated",
};
const ownershipNotices: Record<OwnershipTransfer["status"], MessageId> = {
  pending: "spaces.ownership.notice.pending", accepted: "spaces.ownership.notice.accepted", declined: "spaces.ownership.notice.declined",
  cancelled: "spaces.ownership.notice.cancelled", expired: "spaces.ownership.notice.expired", invalidated: "spaces.ownership.notice.invalidated",
};

function denied(error: Error | null) {
  return error instanceof ApiError && ([401, 403, 404].includes(error.status) || error.code === "ACCOUNT_CHANGED");
}

export function ManageMembers({ user, space, onClose }: { user: Account; space: FamilySpace; onClose: () => void }) {
  const t = useText();
  const client = useQueryClient();
  const titleId = useId();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [intent, setIntent] = useState<MembershipIntent | null>(null);
  const [roleSelection, setRoleSelection] = useState<RoleSelection | null>(null);
  const [roleIntent, setRoleIntent] = useState<RoleIntent | null>(null);
  const [ownershipLocked, setOwnershipLocked] = useState(false);
  const [ownershipError, setOwnershipError] = useState<Error | null>(null);
  const [notice, setNotice] = useState<{ id: MessageId; values?: MessageValues } | null>(null);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [roleDialog, setRoleDialog] = useState<HTMLDialogElement | null>(null);
  const roster = useQuery({ queryKey: ["spaceMembers", user.id, space.id], enabled: intent === null && roleIntent === null,
    queryFn: ({ signal }) => readMembers(user.id, space.id, signal), refetchOnWindowFocus: false });
  const change = useMutation({
    mutationFn: endMembership,
    onSuccess: async (_result, command) => {
      setSelection(null); setIntent(null);
      if (command.action === "leave") {
        client.clear();
        window.location.replace("/app/spaces");
        return;
      }
      setNotice({ id: "spaces.members.removed" });
      await client.invalidateQueries({ predicate: query => query.queryKey.includes(user.id) });
    },
    onError: error => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        setIntent(null); setSelection(null);
        client.invalidateQueries({ queryKey: ["spaceMembers", user.id, space.id] });
      }
    },
  });
  const roleChange = useMutation({
    mutationFn: changeRole,
    onSuccess: async (result, command) => {
      setRoleSelection(null); setRoleIntent(null);
      setNotice({ id: command.role === "admin" ? "spaces.members.nowAdmin" : "spaces.members.nowMember", values: { name: result.display_name } });
      await client.invalidateQueries({ predicate: query => query.queryKey.includes(user.id) });
    },
    onError: error => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        setRoleIntent(null); setRoleSelection(null);
        client.invalidateQueries({ queryKey: ["spaceMembers", user.id, space.id] });
      }
    },
  });
  const problem = ownershipError ?? change.error ?? roleChange.error ?? roster.error;
  const blocked = denied(ownershipError) || denied(change.error) || denied(roleChange.error) || denied(roster.error);
  const locked = intent !== null || change.isPending || roleIntent !== null || roleChange.isPending || ownershipLocked;
  const own = roster.data?.find(member => member.account_id === user.id);
  const canChangeRoles = own?.role === "owner" && (space.space_type === "family" || space.space_type === "group");
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  useEffect(() => { roleDialog?.showModal(); return () => roleDialog?.close(); }, [roleDialog]);
  useEffect(() => {
    if (!intent && !roleIntent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [intent, roleIntent]);
  useEffect(() => {
    if (!blocked) return;
    if (problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED")) {
      client.clear(); window.location.replace(problem.status === 401 ? "/login" : "/app/spaces");
    } else { client.invalidateQueries({ queryKey: ["spaces", user.id] }); }
  }, [blocked, problem, client, user.id]);

  function review(member: SpaceMember, action: Selection["action"]) {
    if (locked || selection || roleSelection || blocked) return;
    change.reset(); roleChange.reset(); setNotice(null); setSelection({ member, action });
  }

  function reviewRole(member: SpaceMember, role: RoleSelection["role"]) {
    if (locked || selection || roleSelection || blocked) return;
    change.reset(); roleChange.reset(); setNotice(null); setRoleSelection({ member, role });
  }

  const busy = !!selection || !!roleSelection;

  return <section className={styles.invitationSection} aria-labelledby={titleId}>
    <div className={styles.sectionHeading}><UsersRound size={20} aria-hidden /><h2 id={titleId}>{blocked ? t("spaces.members.unavailable") : t("spaces.membersOf", { name: space.name })}</h2>
      <button className="icon-button" aria-label={t("spaces.members.refresh")} title={t("spaces.members.refresh")} disabled={locked || busy || roster.isFetching} onClick={() => { change.reset(); roleChange.reset(); setOwnershipError(null); roster.refetch(); }}><RefreshCw size={18} className={roster.isFetching ? "spin" : ""} aria-hidden /></button>
      <button className="icon-button" aria-label={t("spaces.members.close")} title={t("spaces.members.close")} disabled={locked} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    {notice && <p className="message success" role="status"><Check size={17} aria-hidden />{t(notice.id, notice.values)}</p>}
    {problem && !busy && <p className="message error" role="alert">{problem.message}</p>}
    {roster.isPending && <p role="status">{t("spaces.members.loading")}</p>}
    {!blocked && !roster.isError && <ul className={styles.invitationList}>{roster.data?.map(member => <li key={member.account_id}>
      <div className={styles.invitationDetails}><h3>{member.account_id === user.id ? t("spaces.members.you", { name: member.display_name }) : member.display_name}</h3>
        <span>{t(roleLabels[member.role])}</span><span className={styles.accountCode}>{member.account_id}</span>
      </div>
      {canChangeRoles && member.role !== "owner" && <button className="secondary-button" aria-label={t(member.role === "admin" ? "spaces.members.makeMemberFor" : "spaces.members.makeAdminFor", { name: member.display_name, account: member.account_id })} disabled={locked || busy}
        onClick={() => reviewRole(member, member.role === "admin" ? "member" : "admin")}>{member.role === "admin" ? <UserRound size={17} aria-hidden /> : <ShieldCheck size={17} aria-hidden />}{t(member.role === "admin" ? "spaces.members.makeMember" : "spaces.members.makeAdmin")}</button>}
      {((own?.role === "owner" && member.role !== "owner") || (own?.role === "admin" && member.role === "member")) && <button className="icon-button" aria-label={t("spaces.members.removeFor", { name: member.display_name, account: member.account_id })} title={t("spaces.members.removeTitle", { name: member.display_name })} disabled={locked || busy} onClick={() => review(member, "remove")}><UserRoundMinus size={19} aria-hidden /></button>}
      {member.account_id === user.id && member.role !== "owner" && <button className="secondary-button" disabled={locked || busy} onClick={() => review(member, "leave")}><LogOut size={17} aria-hidden />{t("spaces.members.leave")}</button>}
    </li>)}</ul>}
    {!blocked && roster.data && !roster.isError && <OwnershipOffers user={user} space={space} members={roster.data}
      disabled={intent !== null || change.isPending || roleIntent !== null || roleChange.isPending || busy || roster.isFetching}
      onLocked={setOwnershipLocked} onDenied={setOwnershipError} />}
    {selection && !blocked && <dialog ref={setDialog} className={styles.invitationDialog} aria-labelledby={`${titleId}-review`} onCancel={event => { if (locked) event.preventDefault(); else setSelection(null); }}>
      <div className="dialog-heading"><h2 id={`${titleId}-review`}>{t(selection.action === "leave" ? "spaces.members.leaveTitle" : "spaces.members.removeConfirmTitle")}</h2>
        <button className="icon-button" aria-label={t("spaces.members.closeConfirmation")} title={t("spaces.members.closeConfirmation")} disabled={locked} onClick={() => setSelection(null)}><X size={18} aria-hidden /></button>
      </div>
      <dl className={styles.reviewFacts}><dt>{t("spaces.members.space")}</dt><dd>{space.name}</dd><dt>{t("spaces.members.member")}</dt><dd>{selection.member.display_name}</dd><dt>{t("spaces.members.accountId")}</dt><dd className={styles.accountCode}>{selection.member.account_id}</dd></dl>
      <p>{t(selection.action === "leave" ? "spaces.members.leaveEffect" : "spaces.members.removeEffect")}</p>
      {change.isError && <p className="message error" role="alert">{change.error.message}</p>}
      {intent && !change.isPending && <p role="status">{t("spaces.members.unconfirmed")}</p>}
      <div className={`dialog-actions ${styles.membershipActions}`}>
        <button className="secondary-button" disabled={locked} onClick={() => setSelection(null)}>{t("spaces.members.keep")}</button>
        <button className="primary-button" disabled={change.isPending} onClick={() => {
          const command = intent ?? { accountId: user.id, spaceId: space.id, targetId: selection.member.account_id,
            action: selection.action, key: crypto.randomUUID(), etag: selection.member.etag };
          setIntent(command); change.mutate(command);
        }}>{change.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <LogOut size={17} aria-hidden />}
          {intent && !change.isPending ? t("spaces.members.retryChange") : t(selection.action === "leave" ? "spaces.members.leave" : "spaces.members.remove")}</button>
      </div>
    </dialog>}
    {roleSelection && !blocked && <dialog ref={setRoleDialog} className={styles.invitationDialog} aria-labelledby={`${titleId}-role`} onCancel={event => { if (locked) event.preventDefault(); else setRoleSelection(null); }}>
      <div className="dialog-heading"><h2 id={`${titleId}-role`}>{t(roleSelection.role === "admin" ? "spaces.members.adminTitle" : "spaces.members.memberTitle")}</h2>
        <button className="icon-button" aria-label={t("spaces.members.closeRole")} title={t("spaces.members.closeRole")} disabled={locked} onClick={() => setRoleSelection(null)}><X size={18} aria-hidden /></button>
      </div>
      <dl className={styles.reviewFacts}><dt>{t("spaces.members.space")}</dt><dd>{space.name}</dd><dt>{t("spaces.members.member")}</dt><dd>{roleSelection.member.display_name}</dd><dt>{t("spaces.members.accountId")}</dt><dd className={styles.accountCode}>{roleSelection.member.account_id}</dd></dl>
      <p>{t(roleSelection.role === "admin" ? "spaces.members.adminEffect" : "spaces.members.memberEffect")}</p>
      {roleChange.isError && <p className="message error" role="alert">{roleChange.error.message}</p>}
      {roleIntent && !roleChange.isPending && <p role="status">{t("spaces.members.unconfirmed")}</p>}
      <div className={`dialog-actions ${styles.membershipActions}`}>
        <button className="secondary-button" disabled={locked} onClick={() => setRoleSelection(null)}>{t("spaces.cancel")}</button>
        <button className="primary-button" disabled={roleChange.isPending} onClick={() => {
          const command = roleIntent ?? { accountId: user.id, spaceId: space.id, targetId: roleSelection.member.account_id,
            role: roleSelection.role, key: crypto.randomUUID(), etag: roleSelection.member.etag };
          setRoleIntent(command); roleChange.mutate(command);
        }}>{roleChange.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : roleIntent ? <RefreshCw size={17} aria-hidden /> : roleSelection.role === "admin" ? <ShieldCheck size={17} aria-hidden /> : <UserRound size={17} aria-hidden />}
          {roleIntent && !roleChange.isPending ? t("spaces.retry") : t(roleSelection.role === "admin" ? "spaces.members.makeAdmin" : "spaces.members.makeMember")}</button>
      </div>
    </dialog>}
  </section>;
}

type OwnershipSelection = { action: "offer"; member: SpaceMember } | { action: "accept" | "decline" | "cancel"; transfer: OwnershipTransfer };

function OwnershipOffers({ user, space, members, disabled, onLocked, onDenied }: {
  user: Account; space: FamilySpace; members: SpaceMember[]; disabled: boolean;
  onLocked: (locked: boolean) => void; onDenied: (error: Error) => void;
}) {
  const client = useQueryClient();
  const titleId = useId();
  const [recipientId, setRecipientId] = useState("");
  const [selection, setSelection] = useState<OwnershipSelection | null>(null);
  const [intent, setIntent] = useState<OwnershipIntent | null>(null);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const offers = useInfiniteQuery({
    queryKey: ["ownershipOffers", user.id, space.id], initialPageParam: null as string | null,
    enabled: intent === null, refetchOnWindowFocus: false,
    queryFn: ({ pageParam, signal }) => ownershipPage(user.id, space.id, pageParam, signal),
    getNextPageParam: page => page.pagination.next_cursor ?? undefined,
  });
  const change = useMutation({
    mutationFn: changeOwnership,
    onSuccess: async result => {
      setIntent(null); setSelection(null); setRecipientId("");
      setNotice(`Ownership offer ${ownershipLabels[result.status].toLowerCase()}.`);
      await client.invalidateQueries({ predicate: query => query.queryKey.includes(user.id) });
    },
    onError: error => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        setIntent(null); setSelection(null);
        client.invalidateQueries({ queryKey: ["spaceMembers", user.id, space.id] });
        client.invalidateQueries({ queryKey: ["ownershipOffers", user.id, space.id] });
      }
      if (denied(error) && !(error instanceof ApiError && error.code === "REAUTHENTICATION_REQUIRED")) onDenied(error);
    },
  });
  const locked = intent !== null || change.isPending;
  useEffect(() => { onLocked(locked || selection !== null); return () => onLocked(false); }, [locked, selection, onLocked]);
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  useEffect(() => { if (offers.error && denied(offers.error)) onDenied(offers.error); }, [offers.error, onDenied]);
  useEffect(() => {
    if (!intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [intent]);
  const own = members.find(member => member.account_id === user.id);
  const eligible = members.filter(member => member.role === "member" && member.account_id !== user.id);
  const rows = [...new Map(offers.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];
  const pending = rows.some(item => item.status === "pending");
  const reauthentication = change.error instanceof ApiError && change.error.code === "REAUTHENTICATION_REQUIRED";
  const title = selection?.action === "offer" ? "Offer family ownership?" : selection?.action === "accept" ? "Accept family ownership?" : selection?.action === "decline" ? "Decline ownership offer?" : "Withdraw ownership offer?";
  const actionLabel = selection?.action === "offer" ? "Send ownership offer" : selection?.action === "accept" ? "Accept ownership" : selection?.action === "decline" ? "Decline offer" : "Withdraw offer";
  const senderName = selection?.action === "offer" ? user.display_name : selection?.transfer.from_name;
  const senderId = selection?.action === "offer" ? user.id : selection?.transfer.from_account_id;
  const recipientName = selection?.action === "offer" ? selection.member.display_name : selection?.transfer.to_name;
  const reviewedRecipient = selection?.action === "offer" ? selection.member.account_id : selection?.transfer.to_account_id;

  function review(value: OwnershipSelection) {
    if (disabled || locked || selection) return;
    change.reset(); setNotice(""); setSelection(value);
  }

  return <section className={styles.invitationSection} aria-labelledby={titleId}>
    <div className={styles.sectionHeading}><Crown size={20} aria-hidden /><h2 id={titleId}>Ownership offers</h2>
      <button className="icon-button" aria-label="Refresh ownership offers" title="Refresh ownership offers" disabled={disabled || locked || !!selection || offers.isFetching}
        onClick={() => { change.reset(); offers.refetch(); }}><RefreshCw size={18} className={offers.isFetching ? "spin" : ""} /></button>
    </div>
    {notice && <p className="message success" role="status"><Check size={17} />{notice}</p>}
    {(offers.error || (change.error && !selection)) && <p className="message error" role="alert">{offers.error?.message ?? change.error?.message}{reauthentication && <> <a href="/login">Sign in again</a></>}</p>}
    {own?.role === "owner" && <form className={styles.ownershipForm} onSubmit={event => {
      event.preventDefault();
      const member = eligible.find(item => item.account_id === recipientId);
      if (member && !pending) review({ action: "offer", member });
    }}>
      <label htmlFor={`${titleId}-recipient`}>Next owner</label>
      <select id={`${titleId}-recipient`} value={recipientId} disabled={disabled || locked || !!selection || pending || offers.isPending || offers.isError}
        onChange={event => setRecipientId(event.target.value)}>
        <option value="">Choose a current member</option>
        {eligible.map(member => <option key={member.account_id} value={member.account_id}>{member.display_name} ({member.account_id})</option>)}
      </select>
      <button type="submit" className="secondary-button" disabled={disabled || locked || !!selection || pending || !recipientId || offers.isPending || offers.isError}><Crown size={17} />Review ownership offer</button>
    </form>}
    {offers.isPending && <p role="status">Loading ownership offers...</p>}
    {!offers.isPending && !offers.isError && rows.length === 0 && <p>No ownership offers.</p>}
    {!offers.isError && <ul className={styles.invitationList}>{rows.map(transfer => <li key={transfer.id}>
      <div className={styles.invitationDetails}><h3>{transfer.from_name} to {transfer.to_name}</h3><span>{ownershipLabels[transfer.status]}</span>
        <span>Expires {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: user.timezone }).format(new Date(transfer.expires_at))} ({user.timezone})</span>
      </div>
      {transfer.status === "pending" && <div className={styles.invitationActions}>
        {transfer.to_account_id === user.id ? <><button className="primary-button" disabled={disabled || locked || !!selection} onClick={() => review({ action: "accept", transfer })}><Crown size={17} />Review ownership</button>
          <button className="secondary-button" disabled={disabled || locked || !!selection} onClick={() => review({ action: "decline", transfer })}><X size={17} />Decline offer</button></>
          : <button className="secondary-button" disabled={disabled || locked || !!selection} onClick={() => review({ action: "cancel", transfer })}><X size={17} />Withdraw offer</button>}
      </div>}
    </li>)}</ul>}
    {offers.hasNextPage && <button className="text-button" disabled={disabled || locked || !!selection || offers.isFetching} onClick={() => offers.fetchNextPage()}>More ownership offers</button>}
    {selection && <dialog ref={setDialog} className={styles.invitationDialog} aria-labelledby={`${titleId}-review`}
      onCancel={event => { if (locked) event.preventDefault(); else setSelection(null); }}>
      <div className="dialog-heading"><h2 id={`${titleId}-review`}>{title}</h2><button className="icon-button" aria-label="Close ownership review" title="Close ownership review" disabled={locked} onClick={() => setSelection(null)}><X size={18} /></button></div>
      <dl className={styles.reviewFacts}><dt>Space</dt><dd>{space.name}</dd><dt>Current owner</dt><dd>{senderName}<span className={styles.accountCode}>{senderId}</span></dd><dt>Next owner</dt><dd>{recipientName}<span className={styles.accountCode}>{reviewedRecipient}</span></dd></dl>
      {selection.action === "offer" || selection.action === "accept" ? <p>After acceptance, the next owner can manage members and invitations. The current owner becomes a member. Existing task history and private-data permissions stay unchanged. Pending invitations from the current owner will be revoked.</p> : <p>This ends the offer without changing either membership role.</p>}
      {selection.action === "offer" ? <p>The offer expires after 15 minutes. Signing out of this session before acceptance invalidates it.</p>
        : <p>Offer expires {selection.transfer.expires_at.replace("T", " ")}.</p>}
      {change.error && <p className="message error" role="alert">{change.error.message}</p>}
      {intent && !change.isPending && <p role="status">The result is unconfirmed.</p>}
      <div className={`dialog-actions ${styles.membershipActions}`}><button className="secondary-button" disabled={locked} onClick={() => setSelection(null)}>Not now</button>
        <button className="primary-button" disabled={change.isPending} onClick={() => {
          const command: OwnershipIntent = intent ?? (selection.action === "offer"
            ? { action: "offer", accountId: user.id, spaceId: space.id, recipientId: selection.member.account_id, etag: selection.member.etag, key: crypto.randomUUID() }
            : { action: selection.action, accountId: user.id, transfer: selection.transfer });
          setIntent(command); change.mutate(command);
        }}>{change.isPending ? <LoaderCircle size={17} className="spin" /> : intent ? <RefreshCw size={17} /> : <Crown size={17} />}{intent && !change.isPending ? "Retry original ownership change" : actionLabel}</button>
      </div>
    </dialog>}
  </section>;
}