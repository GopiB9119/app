"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, RefreshCw, UserCheck, UserX, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId, MessageValues } from "@/features/i18n/messages";
import { decideJoinRequest, pendingJoinRequests } from "./client";
import type { FamilySpace, JoinReview } from "./client";
import styles from "./spaces.module.css";

export function ManageJoinRequests({ user, space, onClose }: { user: Account; space: FamilySpace; onClose: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  // English keeps the browser's own date format.
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium" }), [language]);
  const cache = useQueryClient();
  const heading = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [notice, setNotice] = useState<{ id: MessageId; values: MessageValues } | null>(null);
  const [declining, setDeclining] = useState<JoinReview | null>(null);
  const queue = useQuery({
    queryKey: ["joinRequests", user.id, space.id], retry: false, refetchOnWindowFocus: true,
    queryFn: ({ signal }) => pendingJoinRequests(user.id, space.id, signal),
  });
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  // Approving or declining twice gives the same answer, so a failed attempt can simply be repeated.
  const decide = useMutation({
    retry: false, networkMode: "always",
    mutationFn: ({ review, action }: { review: JoinReview; action: "approve" | "decline" }) => decideJoinRequest(user.id, space.id, review, action),
    onSuccess: async (_result, { review, action }) => {
      setDeclining(null);
      setNotice(action === "approve" ? { id: "spaces.requests.joined", values: { name: review.display_name, space: space.name } }
        : { id: "spaces.requests.declined", values: { name: review.display_name } });
      await cache.invalidateQueries({ predicate: query => query.queryKey.includes(user.id) });
    },
    onError: async error => {
      if (error instanceof ApiError && [404, 409, 410].includes(error.status)) await queue.refetch();
    },
  });
  const problem = decide.error ?? queue.error;
  useEffect(() => {
    if (problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED")) {
      cache.clear(); window.location.replace(problem.status === 401 ? "/login" : "/app/spaces");
    }
  }, [problem, cache]);
  const busy = decide.isPending;
  const waiting = queue.data ?? [];
  return <dialog ref={setDialog} className={styles.invitationDialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading">
      <h2 id={heading}>{t("spaces.requests.title", { name: space.name })}</h2>
      <button className="icon-button" aria-label={t("spaces.requests.close")} title={t("spaces.requests.close")} disabled={busy} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    <p className={styles.description}>{space.visibility === "public" ? t("spaces.requests.publicIntro") : t("spaces.requests.privateIntro")}</p>
    {problem && <p className="message error" role="alert">{problem.message}</p>}
    {notice && <p className="message success" role="status"><Check size={17} aria-hidden />{t(notice.id, notice.values)}</p>}
    {queue.isPending && <p role="status" aria-busy="true">{t("spaces.requests.loading")}</p>}
    {queue.isSuccess && waiting.length === 0 && <p className={styles.emptyNote}>{t("spaces.requests.none")}</p>}
    {waiting.length > 0 && <ul className={styles.invitationList}>{waiting.map(review => <li key={review.id}>
      <div className={styles.invitationDetails}>
        <p><strong>{review.display_name}</strong></p>
        {review.note && <blockquote className={styles.requestNote}>{review.note}</blockquote>}
        <span>{t("spaces.requests.dates", { asked: dateFormat.format(new Date(review.created_at)), expires: dateFormat.format(new Date(review.expires_at)) })}</span>
      </div>
      <div className={styles.invitationActions}>
        {declining?.id === review.id ? <>
          <button className="secondary-button" disabled={busy} onClick={() => setDeclining(null)}>{t("spaces.requests.keep")}</button>
          <button className="primary-button" disabled={busy} onClick={() => decide.mutate({ review, action: "decline" })}>
            {busy ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UserX size={17} aria-hidden />}{t("spaces.requests.confirmDecline")}
          </button>
        </> : <>
          <button className="secondary-button" disabled={busy} onClick={() => { setDeclining(review); setNotice(null); }} aria-label={t("spaces.requests.declineFor", { name: review.display_name })}><UserX size={17} aria-hidden />{t("spaces.requests.decline")}</button>
          <button className="primary-button" disabled={busy} onClick={() => { setNotice(null); decide.mutate({ review, action: "approve" }); }} aria-label={t("spaces.requests.approveFor", { name: review.display_name })}>
            {busy && decide.variables?.review.id === review.id ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UserCheck size={17} aria-hidden />}{t("spaces.requests.approve")}
          </button>
        </>}
      </div>
    </li>)}</ul>}
    <button className="text-button" disabled={queue.isFetching || busy} onClick={() => queue.refetch()}><RefreshCw size={16} aria-hidden className={queue.isFetching ? "spin" : ""} />{t("spaces.requests.refresh")}</button>
  </dialog>;
}
