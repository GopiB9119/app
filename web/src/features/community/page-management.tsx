"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Handshake, LoaderCircle, Pin, PinOff, Trash2, UserMinus, UserPlus } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { useText } from "@/features/i18n/i18n";
import {
  archivePage, deletePage, inviteModerator, isUnknown, offerHandover, pageHandover, pageModerators, pinPost, removeModerator, respondHandover,
  restorePage, withdrawModerator,
} from "./client";
import type { CreateIntent, ModeratorRow, PublicPage, PublicPost } from "./client";
import { Failure, problemText, sessionLost, useCommunityTime } from "./shared";
import styles from "./community.module.css";

// Page moderators, handing a page over, and archiving, deleting and restoring it (DEC-025 parts 3 to 5).

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type InviteIntent = CreateIntent<{ account_id: string }> & { pageId: string };
type OfferIntent = CreateIntent<{ to_account_id: string }> & { pageId: string; etag: string };
type Confirm = { kind: "withdraw" | "remove" | "handover"; row: ModeratorRow } | { kind: "archive" | "delete" };

/** The name the server compares with: spaces of any kind become one, and the ends are trimmed. */
function typedName(value: string) {
  return value.replace(/[\s\u0085\u001c-\u001f]+/g, " ").trim();
}

/** Tells everyone that an archived page is read only. A deleted page reaches only its owner, through the management section. */
export function PageStateNotice({ page }: { page: PublicPage }) {
  const t = useText();
  if (page.status !== "read_only") return null;
  return <p className={styles.notice} role="status">{t("community.manage.readOnly")}</p>;
}

/** A moderator of the page pins or unpins a published post; the owner's controls are in the post manager instead. */
export function ModeratorPin({ account, post, onChanged }: { account: Account; post: PublicPost; onChanged: () => void }) {
  const t = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (post.status !== "published") return null;
  async function toggle() {
    setBusy(true);
    setError("");
    try { await pinPost(account.id, post.id, !post.pinned); onChanged(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, t("community.changeFailed"), t));
    } finally { setBusy(false); }
  }
  return <div className={styles.stack}>
    <div className={styles.actions}>
      <button className="text-button" disabled={busy} onClick={() => void toggle()}>
        {post.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}{t(post.pinned ? "community.unpin" : "community.pin")}
      </button>
    </div>
    {error && <div className="message error" role="alert">{error}</div>}
  </div>;
}

/** The owner's moderators, handover offer, and archive, delete and restore. Nobody else sees who moderates a page. */
export function PageManagement({ account, page, onChanged }: { account: Account; page: PublicPage; onChanged: (updated?: PublicPage) => void }) {
  const t = useText();
  const time = useCommunityTime();
  const queryClient = useQueryClient();
  const deleted = page.status === "deleted";
  const moderators = useQuery({
    queryKey: ["page-moderators", page.id, account.id], queryFn: ({ signal }) => pageModerators(account.id, page.id, signal),
    enabled: !deleted, networkMode: "always",
  });
  const handover = useQuery({
    queryKey: ["page-handover", page.id, account.id], queryFn: ({ signal }) => pageHandover(account.id, page.id, signal),
    enabled: !deleted, networkMode: "always",
  });
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invitee, setInvitee] = useState("");
  const [invite, setInvite] = useState<InviteIntent | null>(null);
  const [offer, setOffer] = useState<OfferIntent | null>(null);
  const [name, setName] = useState("");

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["page-moderators", page.id] });
    void queryClient.invalidateQueries({ queryKey: ["page-handover", page.id] });
    void queryClient.invalidateQueries({ queryKey: ["my-pages"] });
    onChanged();
  }
  async function run(action: () => Promise<unknown>, done = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); setConfirm(null); setNotice(done); refresh(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, t("community.changeFailed"), t));
      refresh();
    } finally { setBusy(false); }
  }
  // Archive, restore and delete answer with the page's new version; showing it at once keeps the next action current.
  const changeState = (action: () => Promise<PublicPage>, done: string) => run(async () => onChanged(await action()), done);
  // An invitation or offer whose answer was lost keeps its key, so Retry cannot make a second one.
  async function send<Intent>(intent: Intent, keep: (value: Intent | null) => void, action: (value: Intent) => Promise<unknown>, done: string) {
    keep(intent);
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(intent); keep(null); setConfirm(null); setInvitee(""); setNotice(done); refresh(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      if (!isUnknown(problem)) { keep(null); refresh(); }
      setError(problemText(problem, t("community.changeFailed"), t));
    } finally { setBusy(false); }
  }

  if (deleted) {
    return <section className={styles.stack} aria-labelledby="page-state-heading">
      <h2 id="page-state-heading">{t("community.manage.status.deleted")}</h2>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <p className={styles.notice}>{t("community.manage.deleted", { date: page.purge_after ? time.format(new Date(page.purge_after)) : "" })}</p>
      {error && <div className="message error" role="alert">{error}</div>}
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => changeState(() => restorePage(account.id, page), t("community.manage.restored"))}>
          {busy ? <LoaderCircle size={17} className="spin" aria-hidden /> : <ArchiveRestore size={17} aria-hidden />}{t("community.manage.restore")}
        </button>
      </div>
    </section>;
  }

  const rows = moderators.data ?? [];
  const now = Date.now();
  const expired = (row: ModeratorRow) => row.status === "pending" && row.expires_at !== null && Date.parse(row.expires_at) <= now;
  const waitingInvitation = rows.some(row => row.status === "pending" && !expired(row));
  const activeCount = rows.filter(row => row.status === "active").length;
  const waitingOffer = handover.data?.status === "pending" ? handover.data : null;
  const active = page.status === "active";
  const cleanInvitee = invitee.trim().toLowerCase();
  const inviteProblem = cleanInvitee && (!ACCOUNT_ID.test(cleanInvitee) || cleanInvitee === account.id.toLowerCase()) ? t("community.manage.inviteInvalid") : "";
  const typed = typedName(name);

  return <>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <div className="message error" role="alert">{error}</div>}
    <section className={styles.stack} aria-labelledby="moderators-heading">
      <h2 id="moderators-heading">{t("community.manage.moderators")}</h2>
      <p className={styles.meta}>{t("community.manage.moderatorsHint")}</p>
      {moderators.isPending && <p role="status">{t("community.manage.loadingModerators")}</p>}
      {moderators.isError && !sessionLost(moderators.error) && <Failure error={moderators.error} retry={() => moderators.refetch()} />}
      {handover.isError && !sessionLost(handover.error) && <Failure error={handover.error} retry={() => handover.refetch()} />}
      {moderators.isSuccess && rows.length === 0 && <p className={styles.empty}>{t("community.manage.noModerators")}</p>}
      {rows.length > 0 && <ul className={styles.list}>
        {rows.map(row => <li key={row.id} className={styles.row}>
          <span><strong>{row.display_name}</strong>{" "}<span className={styles.meta}>
            {row.status === "active" ? t("community.manage.active")
              : expired(row) ? t("community.manage.expired")
                : t("community.manage.invited", { date: row.expires_at ? time.format(new Date(row.expires_at)) : "" })}
          </span></span>
          <div className={styles.actions}>
            {row.status === "pending"
              ? <button className="secondary-button" disabled={busy} onClick={() => setConfirm({ kind: "withdraw", row })}>{t("community.manage.withdraw")}</button>
              : <>
                {active && !waitingOffer && !offer && handover.isSuccess && <button className="secondary-button" disabled={busy} onClick={() => setConfirm({ kind: "handover", row })}>
                  <Handshake size={17} aria-hidden />{t("community.manage.handOver")}
                </button>}
                <button className="secondary-button" disabled={busy} onClick={() => setConfirm({ kind: "remove", row })}><UserMinus size={17} aria-hidden />{t("community.manage.remove")}</button>
              </>}
          </div>
        </li>)}
      </ul>}
      {confirm && confirm.kind !== "archive" && confirm.kind !== "delete" && <div className={styles.notice} role="group" aria-label={t("community.manage.moderators")}>
        <p>{confirm.kind === "withdraw" ? t("community.manage.withdrawQuestion", { name: confirm.row.display_name })
          : confirm.kind === "remove" ? t("community.manage.removeQuestion", { name: confirm.row.display_name, page: page.name })
            : confirm.kind === "handover" ? t("community.manage.handOverQuestion", { page: page.name, name: confirm.row.display_name }) : null}</p>
        <div className={styles.actions}>
          {confirm.kind === "withdraw" && <button className="primary-button" disabled={busy}
            onClick={() => run(() => withdrawModerator(account.id, page.id, confirm.row))}>{t("community.manage.withdraw")}</button>}
          {confirm.kind === "remove" && <button className="primary-button" disabled={busy}
            onClick={() => run(() => removeModerator(account.id, page.id, confirm.row))}>{t("community.manage.remove")}</button>}
          {confirm.kind === "handover" && page.etag && !offer && <button className="primary-button" disabled={busy} onClick={() => void send<OfferIntent>(
            { accountId: account.id, pageId: page.id, key: crypto.randomUUID(), etag: page.etag!, body: { to_account_id: confirm.row.account_id } },
            setOffer, offerHandover, t("community.manage.offerSent"),
          )}>{t("community.manage.offer")}</button>}
          <button className="secondary-button" disabled={busy} onClick={() => setConfirm(null)}>{t("community.manage.keep")}</button>
        </div>
      </div>}
      {offer && !busy && <div className={styles.actions}>
        <button className="primary-button" onClick={() => void send<OfferIntent>(offer, setOffer, offerHandover, t("community.manage.offerSent"))}>{t("community.manage.retryOffer")}</button>
        <button className="secondary-button" onClick={() => { setOffer(null); setError(""); refresh(); }}>{t("community.stopTracking")}</button>
      </div>}
      {waitingOffer && <div className={styles.notice} role="status">
        <p>{t("community.manage.offerWaiting", { name: waitingOffer.to_name, time: waitingOffer.expires_at ? time.format(new Date(waitingOffer.expires_at)) : "" })}</p>
        <div className={styles.actions}>
          <button className="secondary-button" disabled={busy} onClick={() => run(() => respondHandover(account.id, page.id, waitingOffer, "cancel"))}>
            {t("community.manage.cancelOffer")}
          </button>
        </div>
      </div>}
      {active && moderators.isSuccess && !waitingInvitation && activeCount < 10 && <form className={styles.form} aria-label={t("community.manage.invite")} onSubmit={event => {
        event.preventDefault();
        if (busy || invite || !cleanInvitee || inviteProblem) return;
        void send<InviteIntent>({ accountId: account.id, pageId: page.id, key: crypto.randomUUID(), body: { account_id: cleanInvitee } }, setInvite, inviteModerator, t("community.manage.invitationSent"));
      }}>
        <h3>{t("community.manage.invite")}</h3>
        <label>{t("community.manage.inviteAccount")}<input value={invitee} maxLength={64} onChange={event => setInvitee(event.target.value)} disabled={busy || Boolean(invite)}
          aria-describedby="moderator-invite-hint" aria-invalid={inviteProblem ? true : undefined} autoComplete="off" spellCheck={false} /></label>
        <span id="moderator-invite-hint" className={inviteProblem ? "field-error" : styles.meta}>{inviteProblem || t("community.manage.inviteHint")}</span>
        <div className={styles.actions}>
          {invite && !busy
            ? <>
              <button className="primary-button" type="button" onClick={() => void send<InviteIntent>(invite, setInvite, inviteModerator, t("community.manage.invitationSent"))}>{t("community.manage.retryInvitation")}</button>
              <button className="secondary-button" type="button" onClick={() => { setInvite(null); setError(""); refresh(); }}>{t("community.stopTracking")}</button>
            </>
            : <button className="primary-button" type="submit" disabled={busy || !cleanInvitee || Boolean(inviteProblem)}>
              {busy ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UserPlus size={17} aria-hidden />}{t("community.manage.sendInvitation")}
            </button>}
        </div>
      </form>}
    </section>
    <section className={styles.stack} aria-labelledby="page-state-heading">
      <h2 id="page-state-heading">{t("community.manage.archiveOrDelete")}</h2>
      <div className={styles.actions}>
        {page.status === "read_only"
          ? <button className="primary-button" disabled={busy} onClick={() => changeState(() => restorePage(account.id, page), t("community.manage.restored"))}>
            <ArchiveRestore size={17} aria-hidden />{t("community.manage.restore")}
          </button>
          : <button className="secondary-button" disabled={busy} onClick={() => setConfirm({ kind: "archive" })}><Archive size={17} aria-hidden />{t("community.manage.archive")}</button>}
        <button className="text-button" disabled={busy} onClick={() => { setName(""); setConfirm({ kind: "delete" }); }}><Trash2 size={17} aria-hidden />{t("community.manage.delete")}</button>
      </div>
      {confirm?.kind === "archive" && <div className={styles.notice} role="group" aria-label={t("community.manage.archive")}>
        <p>{t("community.manage.archiveQuestion", { name: page.name })}</p>
        <div className={styles.actions}>
          <button className="primary-button" disabled={busy} onClick={() => changeState(() => archivePage(account.id, page), t("community.manage.archived"))}>{t("community.manage.archive")}</button>
          <button className="secondary-button" disabled={busy} onClick={() => setConfirm(null)}>{t("community.manage.keep")}</button>
        </div>
      </div>}
      {confirm?.kind === "delete" && <form className={styles.form} aria-label={t("community.manage.delete")} onSubmit={event => {
        event.preventDefault();
        if (busy || typed !== page.name) return;
        void changeState(() => deletePage(account.id, page, typed), t("community.manage.deletedNotice"));
      }}>
        <p>{t("community.manage.deleteQuestion", { name: page.name })}</p>
        <label>{t("community.manage.typeName")}<input value={name} maxLength={160} onChange={event => setName(event.target.value)} disabled={busy} autoComplete="off" /></label>
        <div className={styles.actions}>
          <button className="primary-button" type="submit" disabled={busy || typed !== page.name}><Trash2 size={17} aria-hidden />{t("community.manage.delete")}</button>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => setConfirm(null)}>{t("community.manage.keep")}</button>
        </div>
      </form>}
    </section>
  </>;
}
