"use client";

import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crown, LoaderCircle, LogOut, RefreshCw, UserRoundMinus, UsersRound, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { changeOwnership, endMembership, ownershipLabels, ownershipPage, readMembers } from "./client";
import type { FamilySpace, MembershipIntent, OwnershipIntent, OwnershipTransfer, SpaceMember } from "./client";
import styles from "./spaces.module.css";

type Selection = { member: SpaceMember; action: "remove" | "leave" };

function denied(error: Error | null) {
  return error instanceof ApiError && ([401, 403, 404].includes(error.status) || error.code === "ACCOUNT_CHANGED");
}

export function ManageMembers({ user, space, onClose }: { user: Account; space: FamilySpace; onClose: () => void }) {
  const client = useQueryClient();
  const titleId = useId();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [intent, setIntent] = useState<MembershipIntent | null>(null);
  const [ownershipLocked, setOwnershipLocked] = useState(false);
  const [ownershipError, setOwnershipError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const roster = useQuery({ queryKey: ["spaceMembers", user.id, space.id], enabled: intent === null,
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
      setNotice("Member removed.");
      await client.invalidateQueries({ predicate: query => query.queryKey.includes(user.id) });
    },
    onError: error => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        setIntent(null); setSelection(null);
        client.invalidateQueries({ queryKey: ["spaceMembers", user.id, space.id] });
      }
    },
  });
  const problem = ownershipError ?? change.error ?? roster.error;
  const blocked = denied(ownershipError) || denied(change.error) || denied(roster.error);
  const locked = intent !== null || change.isPending || ownershipLocked;
  const own = roster.data?.find(member => member.account_id === user.id);
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  useEffect(() => {
    if (!intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [intent]);
  useEffect(() => {
    if (!blocked) return;
    if (problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED")) {
      client.clear(); window.location.replace(problem.status === 401 ? "/login" : "/app/spaces");
    } else { client.invalidateQueries({ queryKey: ["spaces", user.id] }); }
  }, [blocked, problem, client, user.id]);

  function review(member: SpaceMember, action: Selection["action"]) {
    if (locked || selection || blocked) return;
    change.reset(); setNotice(""); setSelection({ member, action });
  }

  return <section className={styles.invitationSection} aria-labelledby={titleId}>
    <div className={styles.sectionHeading}><UsersRound size={20} aria-hidden /><h2 id={titleId}>{blocked ? "Members unavailable" : `Members of ${space.name}`}</h2>
      <button className="icon-button" aria-label="Refresh members" title="Refresh members" disabled={locked || !!selection || roster.isFetching} onClick={() => { change.reset(); setOwnershipError(null); roster.refetch(); }}><RefreshCw size={18} className={roster.isFetching ? "spin" : ""} aria-hidden /></button>
      <button className="icon-button" aria-label="Close member management" title="Close member management" disabled={locked} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    {notice && <p className="message success" role="status"><Check size={17} aria-hidden />{notice}</p>}
    {problem && !selection && <p className="message error" role="alert">{problem.message}</p>}
    {roster.isPending && <p role="status">Loading members...</p>}
    {!blocked && !roster.isError && <ul className={styles.invitationList}>{roster.data?.map(member => <li key={member.account_id}>
      <div className={styles.invitationDetails}><h3>{member.display_name}{member.account_id === user.id ? " (you)" : ""}</h3>
        <span>{member.role === "owner" ? "Owner" : "Member"}</span><span className={styles.accountCode}>{member.account_id}</span>
      </div>
      {own?.role === "owner" && member.role === "member" && <button className="icon-button" aria-label={`Remove ${member.display_name} (${member.account_id})`} title={`Remove ${member.display_name}`} disabled={locked || !!selection} onClick={() => review(member, "remove")}><UserRoundMinus size={19} aria-hidden /></button>}
      {member.account_id === user.id && member.role === "member" && <button className="secondary-button" disabled={locked || !!selection} onClick={() => review(member, "leave")}><LogOut size={17} aria-hidden />Leave Space</button>}
    </li>)}</ul>}
    {!blocked && roster.data && !roster.isError && <OwnershipOffers user={user} space={space} members={roster.data}
      disabled={intent !== null || change.isPending || selection !== null || roster.isFetching}
      onLocked={setOwnershipLocked} onDenied={setOwnershipError} />}
    {selection && !blocked && <dialog ref={setDialog} className={styles.invitationDialog} aria-labelledby={`${titleId}-review`} onCancel={event => { if (locked) event.preventDefault(); else setSelection(null); }}>
      <div className="dialog-heading"><h2 id={`${titleId}-review`}>{selection.action === "leave" ? "Leave this family Space?" : "Remove this family member?"}</h2>
        <button className="icon-button" aria-label="Close membership confirmation" title="Close membership confirmation" disabled={locked} onClick={() => setSelection(null)}><X size={18} aria-hidden /></button>
      </div>
      <dl className={styles.reviewFacts}><dt>Space</dt><dd>{space.name}</dd><dt>Member</dt><dd>{selection.member.display_name}</dd><dt>Account ID</dt><dd className={styles.accountCode}>{selection.member.account_id}</dd></dl>
      <p>{selection.action === "leave" ? "You will lose access to this family's tasks and reminders." : "This member will lose access to this family's tasks and reminders."} Earlier copies are not deleted. {selection.action === "leave" ? "You can return only if the owner invites you again, and your earlier tasks and reminders will stay unavailable." : "You can invite them again later, but their earlier tasks and reminders will stay unavailable."}</p>
      {change.isError && <p className="message error" role="alert">{change.error.message}</p>}
      {intent && !change.isPending && <p role="status">The result is unconfirmed.</p>}
      <div className={`dialog-actions ${styles.membershipActions}`}>
        <button className="secondary-button" disabled={locked} onClick={() => setSelection(null)}>Keep membership</button>
        <button className="primary-button" disabled={change.isPending} onClick={() => {
          const command = intent ?? { accountId: user.id, spaceId: space.id, targetId: selection.member.account_id,
            action: selection.action, key: crypto.randomUUID(), etag: selection.member.etag };
          setIntent(command); change.mutate(command);
        }}>{change.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <LogOut size={17} aria-hidden />}
          {intent && !change.isPending ? "Retry original change" : selection.action === "leave" ? "Leave Space" : "Remove member"}</button>
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