"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, X } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { useText } from "@/features/i18n/i18n";
import { acceptModerator, declineModerator, myHandoverOffers, myModeratorRoles, respondHandover, stepDownModerator } from "./client";
import type { Handover, ModeratorRole } from "./client";
import { Failure, problemText, sessionLost, useCommunityTime } from "./shared";
import styles from "./community.module.css";

type Confirm = { kind: "take-over"; offer: Handover } | { kind: "accept" | "step-down"; role: ModeratorRole };

/** Pages offered to you, your invitations to moderate a page, and the pages you moderate (DEC-025 parts 3 and 4). */
export function PageRoles({ account }: { account: Account }) {
  const t = useText();
  const time = useCommunityTime();
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ["moderator-roles", account.id], queryFn: ({ signal }) => myModeratorRoles(account.id, signal), networkMode: "always" });
  const offers = useQuery({ queryKey: ["handover-offers", account.id], queryFn: ({ signal }) => myHandoverOffers(account.id, signal), networkMode: "always" });
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (sessionLost(roles.error ?? offers.error)) window.location.replace("/login"); }, [roles.error, offers.error]);
  async function run(action: () => Promise<unknown>, done = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); setConfirm(null); setNotice(done); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, t("community.changeFailed"), t));
    } finally {
      setBusy(false);
      // Taking over a page adds it to the pages you own.
      void queryClient.invalidateQueries({ queryKey: ["moderator-roles", account.id] });
      void queryClient.invalidateQueries({ queryKey: ["handover-offers", account.id] });
      void queryClient.invalidateQueries({ queryKey: ["my-pages", account.id] });
    }
  }
  const when = (value: string | null) => value ? time.format(new Date(value)) : "";
  const none = roles.isSuccess && offers.isSuccess && roles.data.length === 0 && offers.data.length === 0;
  return <section className={styles.stack} aria-labelledby="moderating-heading">
    <h2 id="moderating-heading">{t("community.roles.heading")}</h2>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <div className="message error" role="alert">{error}</div>}
    {(roles.isPending || offers.isPending) && <p role="status">{t("community.roles.loading")}</p>}
    {offers.isError && !sessionLost(offers.error) && <Failure error={offers.error} retry={() => offers.refetch()} />}
    {roles.isError && !sessionLost(roles.error) && <Failure error={roles.error} retry={() => roles.refetch()} />}
    {none && <p className={styles.empty}>{t("community.roles.none")}</p>}
    {((offers.data?.length ?? 0) > 0 || (roles.data?.length ?? 0) > 0) && <ul className={styles.list}>
      {offers.data?.map(offer => <li key={offer.id} className={styles.row}>
        <span>{t("community.roles.offer", { name: offer.from_name, page: offer.page_name, time: when(offer.expires_at) })}</span>
        <div className={styles.actions}>
          <button className="primary-button" disabled={busy} onClick={() => setConfirm({ kind: "take-over", offer })}><Check size={17} aria-hidden />{t("community.roles.takeOver")}</button>
          <button className="secondary-button" disabled={busy} onClick={() => run(() => respondHandover(account.id, offer.page_id, offer, "decline"))}><X size={17} aria-hidden />{t("community.roles.decline")}</button>
        </div>
      </li>)}
      {roles.data?.map(role => <li key={role.id} className={styles.row}>
        {role.status === "pending"
          ? <>
            <span>{t("community.roles.invitation", { page: role.page_name, date: when(role.expires_at) })}</span>
            <div className={styles.actions}>
              <button className="primary-button" disabled={busy} onClick={() => setConfirm({ kind: "accept", role })}><Check size={17} aria-hidden />{t("community.roles.accept")}</button>
              <button className="secondary-button" disabled={busy} onClick={() => run(() => declineModerator(account.id, role.page_id, role))}><X size={17} aria-hidden />{t("community.roles.decline")}</button>
            </div>
          </>
          : <>
            <span><Link href={`/pages/${role.page_handle}`}>{role.page_name}</Link> <span className={styles.meta}>@{role.page_handle}</span></span>
            <div className={styles.actions}>
              <button className="secondary-button" disabled={busy} onClick={() => setConfirm({ kind: "step-down", role })}><LogOut size={17} aria-hidden />{t("community.roles.stepDown")}</button>
            </div>
          </>}
      </li>)}
    </ul>}
    {confirm && <div className={styles.notice} role="group" aria-label={t("community.roles.heading")}>
      <p>{confirm.kind === "take-over" ? t("community.roles.acceptOfferQuestion", { page: confirm.offer.page_name, name: confirm.offer.from_name })
        : confirm.kind === "accept" ? t("community.roles.acceptQuestion", { page: confirm.role.page_name })
          : t("community.roles.stepDownQuestion", { page: confirm.role.page_name })}</p>
      <div className={styles.actions}>
        {confirm.kind === "take-over" && <button className="primary-button" disabled={busy}
          onClick={() => run(() => respondHandover(account.id, confirm.offer.page_id, confirm.offer, "accept"), t("community.roles.accepted"))}>{t("community.roles.takeOver")}</button>}
        {confirm.kind === "accept" && <button className="primary-button" disabled={busy}
          onClick={() => run(() => acceptModerator(account.id, confirm.role.page_id, confirm.role))}>{t("community.roles.accept")}</button>}
        {confirm.kind === "step-down" && <button className="primary-button" disabled={busy}
          onClick={() => run(() => stepDownModerator(account.id, confirm.role.page_id, confirm.role))}>{t("community.roles.stepDown")}</button>}
        <button className="secondary-button" disabled={busy} onClick={() => setConfirm(null)}>{t("community.roles.keep")}</button>
      </div>
    </div>}
  </section>;
}
