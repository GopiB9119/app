"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Inbox, LoaderCircle, RefreshCw, UserPlus, X } from "lucide-react";

import { ApiError, api } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { formatDateTime, useLanguage, useText } from "@/features/i18n/i18n";
import type { Language, MessageId, MessageValues } from "@/features/i18n/messages";
import { invitationOutcomeSchema, invitationPage, invitationSchema, recipientSchema, spaceSchema } from "./client";
import type { FamilyInvitation, FamilySpace } from "./client";
import styles from "./spaces.module.css";

const inviteResults: Record<FamilyInvitation["status"], MessageId> = {
  pending: "spaces.invitations.created", accepted: "spaces.invitations.result.accepted", declined: "spaces.invitations.result.declined",
  revoked: "spaces.invitations.result.revoked", expired: "spaces.invitations.result.expired",
};
const sentStatuses: Record<FamilyInvitation["status"], MessageId> = {
  pending: "spaces.invitations.status.pending", accepted: "spaces.invitations.status.accepted", declined: "spaces.invitations.status.declined",
  revoked: "spaces.invitations.status.revoked", expired: "spaces.invitations.status.expired",
};

function useAccountGuard(...errors: (Error | null)[]) {
  const queryClient = useQueryClient();
  const denied = errors.find(error => error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED"));
  useEffect(() => {
    if (denied instanceof ApiError) {
      queryClient.clear();
      window.location.replace(denied.status === 401 ? "/login" : "/app/spaces");
    }
  }, [denied, queryClient]);
  return !!denied;
}

export function AccountIdentifier({ accountId }: { accountId: string }) {
  const t = useText();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true); setError(false);
    } catch {
      setError(true);
    }
  }
  return <div className={styles.accountIdentifier}>
    <label>{t("spaces.account.id")}<input aria-label={t("spaces.account.id")} value={accountId} readOnly onFocus={event => event.currentTarget.select()} /></label>
    <button className="icon-button" onClick={copy} title={t("spaces.account.copy")} aria-label={t("spaces.account.copy")}>{copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}</button>
    <span className={styles.copyStatus} role="status">{error ? t("spaces.account.clipboard") : copied ? t("spaces.account.copied") : ""}</span>
  </div>;
}

export function InvitationInbox({ user }: { user: Account }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [review, setReview] = useState<FamilyInvitation | null>(null);
  const [notice, setNotice] = useState<{ id: MessageId; values?: MessageValues } | null>(null);
  const invitations = useInfiniteQuery({
    queryKey: ["invitationInbox", user.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => invitationPage("invitations", user.id, pageParam, signal),
    getNextPageParam: last => last.pagination.next_cursor ?? undefined,
  });
  const respond = useMutation({
    mutationFn: async ({ invitation, action }: { invitation: FamilyInvitation; action: "accept" | "decline" }) => {
      const options = { method: "POST", body: {}, accountId: user.id };
      if (action === "accept") return api(`invitations/${invitation.id}/accept`, spaceSchema, options);
      return api(`invitations/${invitation.id}/decline`, invitationOutcomeSchema, options);
    },
    onMutate: () => setNotice(null),
    onSuccess: async (_result, { invitation, action }) => {
      setReview(null);
      setNotice(action === "accept" ? { id: "spaces.invitations.joined", values: { name: invitation.space_name } } : { id: "spaces.invitations.declined" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invitationInbox", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["spaces", user.id] }),
      ]);
    },
    onError: error => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        setReview(null);
        queryClient.invalidateQueries({ queryKey: ["invitationInbox", user.id] });
      }
    },
  });
  const denied = useAccountGuard(invitations.error, respond.error);
  const rows = [...new Map(invitations.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];

  return <section className={styles.invitationSection} aria-labelledby="invitation-title">
    <div className={styles.sectionHeading}><Inbox size={20} aria-hidden /><h2 id="invitation-title">{t("spaces.invitations.title")}</h2><button className="icon-button" title={t("spaces.invitations.refresh")} aria-label={t("spaces.invitations.refresh")} disabled={invitations.isFetching} onClick={() => invitations.refetch()}><RefreshCw size={17} className={invitations.isFetching ? "spin" : ""} aria-hidden /></button></div>
    {notice && <p className="message success" role="status">{t(notice.id, notice.values)}</p>}
    {invitations.isPending && <p role="status">{t("spaces.invitations.loading")}</p>}
    {invitations.isError && <div className="message error" role="alert">{invitations.error.message}<button className="text-button" onClick={() => invitations.refetch()}><RefreshCw size={16} aria-hidden />{t("spaces.retry")}</button></div>}
    {respond.isError && <p className="message error" role="alert">{respond.error.message}</p>}
    {!denied && !invitations.isError && !invitations.isPending && rows.length === 0 && <p className={styles.emptyNote}>{t("spaces.invitations.none")}</p>}
    {!denied && !invitations.isError && <ul className={styles.invitationList}>{rows.map(invitation => <li key={invitation.id}>
      <div className={styles.invitationDetails}><h3>{invitation.space_name}</h3><p>{t("spaces.invitations.from", { name: invitation.inviter_name })}</p><span>{t("spaces.invitations.memberPrivate")}</span><time dateTime={invitation.expires_at}>{t("spaces.invitations.expires", { date: formatExpiry(language, invitation.expires_at, user.timezone) })}</time></div>
      <div className={styles.invitationActions}>
        <button className="secondary-button" disabled={respond.isPending} onClick={() => { respond.reset(); setReview(invitation); }}><Check size={16} aria-hidden />{t("spaces.invitations.review")}</button>
        <button className="icon-button" title={t("spaces.invitations.declineFor", { name: invitation.space_name })} aria-label={t("spaces.invitations.declineFor", { name: invitation.space_name })} disabled={respond.isPending} onClick={() => respond.mutate({ invitation, action: "decline" })}><X size={18} aria-hidden /></button>
      </div>
    </li>)}</ul>}
    {invitations.hasNextPage && !denied && <button className="text-button" onClick={() => invitations.fetchNextPage()} disabled={invitations.isFetching}>{t("spaces.invitations.more")}</button>}
    {review && !denied && <InvitationConfirmation title={t("spaces.invitations.joinTitle", { name: review.space_name })} label={t("spaces.invitations.join")} pending={respond.isPending} error={respond.error?.message} onCancel={() => setReview(null)} onConfirm={() => respond.mutate({ invitation: review, action: "accept" })}>
      <dl className={styles.reviewFacts}><dt>{t("spaces.invitations.invitedBy")}</dt><dd>{review.inviter_name}</dd><dt>{t("spaces.invitations.role")}</dt><dd>{t("spaces.role.member")}</dd><dt>{t("spaces.invitations.privacy")}</dt><dd>{t("spaces.private")}</dd><dt>{t("spaces.invitations.earlier")}</dt><dd>{t("spaces.invitations.noAccess")}</dd></dl>
    </InvitationConfirmation>}
  </section>;
}

export function ManageInvitations({ user, space, onClose }: { user: Account; space: FamilySpace; onClose: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState("");
  const [intent, setIntent] = useState<{ recipient: string; key: string } | null>(null);
  const [validation, setValidation] = useState<MessageId | "">("");
  const [notice, setNotice] = useState<MessageId | "">("");
  const [revokeTarget, setRevokeTarget] = useState<FamilyInvitation | null>(null);
  const history = useInfiniteQuery({
    queryKey: ["sentInvitations", user.id, space.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => invitationPage(`spaces/${space.id}/invitations`, user.id, pageParam, signal),
    getNextPageParam: last => last.pagination.next_cursor ?? undefined,
  });
  const invite = useMutation({
    mutationFn: (pending: NonNullable<typeof intent>) => api(`spaces/${space.id}/invitations`, invitationSchema, {
      method: "POST", accountId: user.id, body: { recipient_account_id: pending.recipient }, headers: { "Idempotency-Key": pending.key },
    }),
    onSuccess: async result => {
      setIntent(null); setRecipient("");
      setNotice(inviteResults[result.data.status]);
      await queryClient.invalidateQueries({ queryKey: ["sentInvitations", user.id, space.id] });
    },
    onError: error => {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) {
        setIntent(null);
        queryClient.invalidateQueries({ queryKey: ["sentInvitations", user.id, space.id] });
      }
    },
  });
  const revoke = useMutation({
    mutationFn: (invitation: FamilyInvitation) => api(`spaces/${space.id}/invitations/${invitation.id}/revoke`, invitationOutcomeSchema, { method: "POST", body: {}, accountId: user.id }),
    onSuccess: async () => {
      setRevokeTarget(null); setNotice("spaces.invitations.revoked");
      await queryClient.invalidateQueries({ queryKey: ["sentInvitations", user.id, space.id] });
    },
    onError: error => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        setRevokeTarget(null);
        queryClient.invalidateQueries({ queryKey: ["sentInvitations", user.id, space.id] });
      }
    },
  });
  const denied = useAccountGuard(history.error, invite.error, revoke.error);
  const rows = [...new Map(history.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];

  useEffect(() => {
    if (!recipient && !intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recipient, intent]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invite.isPending || denied || history.isError) return;
    const parsed = recipientSchema.safeParse(recipient);
    if (!parsed.success) { setValidation("spaces.invitations.invalidId"); return; }
    const pending = intent ?? { recipient: parsed.data, key: crypto.randomUUID() };
    setIntent(pending); setValidation(""); setNotice(""); invite.mutate(pending);
  }

  return <section className={styles.invitationSection} aria-labelledby="manage-invitations-title">
    <div className={styles.sectionHeading}><UserPlus size={20} aria-hidden /><h2 id="manage-invitations-title">{t("spaces.invitations.inviteTo", { name: space.name })}</h2><button className="icon-button" title={t("spaces.invitations.close")} aria-label={t("spaces.invitations.close")} disabled={intent !== null || revoke.isPending} onClick={onClose}><X size={18} aria-hidden /></button></div>
    {notice && <p className="message success" role="status">{t(notice)}</p>}
    {space.space_type === "couple" && <p className={styles.emptyNote}>{t("spaces.invitations.coupleHint")}</p>}
    <form className={styles.inviteForm} onSubmit={submit}>
      <label>{t("spaces.invitations.recipient")}<input name="recipient_account_id" autoComplete="off" required maxLength={36} value={recipient} disabled={intent !== null || denied || history.isError} aria-invalid={!!validation} aria-describedby={validation ? "recipient-error" : undefined} onChange={event => { setRecipient(event.target.value); setValidation(""); setNotice(""); invite.reset(); }} /></label>
      <button className="primary-button" type="submit" disabled={invite.isPending || !recipient.trim() || denied || history.isError}>{invite.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <UserPlus size={17} aria-hidden />}{invite.isPending ? t("spaces.creating") : intent ? t("spaces.invitations.retry") : t("spaces.invitations.create")}</button>
    </form>
    {validation && <p id="recipient-error" className="message error" role="alert">{t(validation)}</p>}
    {invite.isError && <p className="message error" role="alert">{invite.error.message}</p>}
    {revoke.isError && <p className="message error" role="alert">{revoke.error.message}</p>}
    <div className={styles.sectionHeading}><h3>{t("spaces.invitations.sent")}</h3><button className="icon-button" title={t("spaces.invitations.refreshSent")} aria-label={t("spaces.invitations.refreshSent")} disabled={history.isFetching} onClick={() => history.refetch()}><RefreshCw size={17} className={history.isFetching ? "spin" : ""} aria-hidden /></button></div>
    {history.isPending && <p role="status">{t("spaces.invitations.loadingSent")}</p>}
    {history.isError && <div className="message error" role="alert">{history.error.message}<button className="text-button" onClick={() => history.refetch()}>{t("spaces.retry")}</button></div>}
    {!denied && !history.isError && !history.isPending && rows.length === 0 && <p className={styles.emptyNote}>{t("spaces.invitations.noneSent")}</p>}
    {!denied && !history.isError && <ul className={styles.invitationList}>{rows.map(invitation => <li key={invitation.id}>
      <div className={styles.invitationDetails}><span className={styles.accountCode}>{invitation.recipient_account_id}</span><span>{t(sentStatuses[invitation.status])}</span><time dateTime={invitation.expires_at}>{t("spaces.invitations.expires", { date: formatExpiry(language, invitation.expires_at, user.timezone) })}</time></div>
      {invitation.status === "pending" && <button className="icon-button" title={t("spaces.invitations.revoke")} aria-label={t("spaces.invitations.revokeFor", { account: invitation.recipient_account_id })} disabled={revoke.isPending} onClick={() => { revoke.reset(); setRevokeTarget(invitation); }}><X size={18} aria-hidden /></button>}
    </li>)}</ul>}
    {history.hasNextPage && !denied && <button className="text-button" disabled={history.isFetching} onClick={() => history.fetchNextPage()}>{t("spaces.invitations.moreSent")}</button>}
    {revokeTarget && !denied && <InvitationConfirmation title={t("spaces.invitations.revokeTitle")} label={t("spaces.invitations.revoke")} pending={revoke.isPending} error={revoke.error?.message} onCancel={() => setRevokeTarget(null)} onConfirm={() => revoke.mutate(revokeTarget)}><p className={styles.accountCode}>{revokeTarget.recipient_account_id}</p></InvitationConfirmation>}
  </section>;
}

function InvitationConfirmation({ title, label, pending, error, children, onCancel, onConfirm }: {
  title: string; label: string; pending: boolean; error?: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void;
}) {
  const t = useText();
  const [element, setElement] = useState<HTMLDialogElement | null>(null);
  useEffect(() => { element?.showModal(); return () => element?.close(); }, [element]);
  return <dialog className={styles.invitationDialog} ref={setElement} aria-labelledby="invitation-review-title" onCancel={event => { if (pending) event.preventDefault(); else onCancel(); }}>
    <div className="dialog-heading"><h2 id="invitation-review-title">{title}</h2><button className="icon-button" title={t("spaces.invitations.closeConfirmation")} aria-label={t("spaces.invitations.closeConfirmation")} disabled={pending} onClick={onCancel}><X size={18} aria-hidden /></button></div>
    {children}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={onCancel}>{t("spaces.cancel")}</button><button className="primary-button" disabled={pending} onClick={onConfirm}>{pending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Check size={17} aria-hidden />}{label}</button></div>
  </dialog>;
}

function formatExpiry(language: Language, value: string, timezone: string) {
  return formatDateTime(language, value, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone });
}