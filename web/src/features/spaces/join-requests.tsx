"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, RefreshCw, UserCheck, UserX, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { decideJoinRequest, pendingJoinRequests } from "./client";
import type { FamilySpace, JoinReview } from "./client";
import styles from "./spaces.module.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function ManageJoinRequests({ user, space, onClose }: { user: Account; space: FamilySpace; onClose: () => void }) {
  const cache = useQueryClient();
  const heading = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [notice, setNotice] = useState("");
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
      setNotice(action === "approve" ? `${review.display_name} joined ${space.name}.` : `You declined ${review.display_name}. They can ask again in 7 days.`);
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
      <h2 id={heading}>Join requests: {space.name}</h2>
      <button className="icon-button" aria-label="Close join requests" title="Close join requests" disabled={busy} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    <p className={styles.description}>{space.visibility === "public"
      ? "People who found this group in Find groups. Approving adds them as members from now on; they do not see earlier chats or events."
      : "This group is private, so nobody can ask to join. Make it public in Space settings to accept requests."}</p>
    {problem && <p className="message error" role="alert">{problem.message}</p>}
    {notice && <p className="message success" role="status"><Check size={17} aria-hidden />{notice}</p>}
    {queue.isPending && <p role="status" aria-busy="true">Loading requests...</p>}
    {queue.isSuccess && waiting.length === 0 && <p className={styles.emptyNote}>Nobody is waiting.</p>}
    {waiting.length > 0 && <ul className={styles.invitationList}>{waiting.map(review => <li key={review.id}>
      <div className={styles.invitationDetails}>
        <p><strong>{review.display_name}</strong></p>
        {review.note && <blockquote className={styles.requestNote}>{review.note}</blockquote>}
        <span>Asked {dateFormat.format(new Date(review.created_at))} · expires {dateFormat.format(new Date(review.expires_at))}</span>
      </div>
      <div className={styles.invitationActions}>
        {declining?.id === review.id ? <>
          <button className="secondary-button" disabled={busy} onClick={() => setDeclining(null)}>Keep</button>
          <button className="primary-button" disabled={busy} onClick={() => decide.mutate({ review, action: "decline" })}>
            {busy ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UserX size={17} aria-hidden />}Confirm decline
          </button>
        </> : <>
          <button className="secondary-button" disabled={busy} onClick={() => { setDeclining(review); setNotice(""); }} aria-label={`Decline ${review.display_name}`}><UserX size={17} aria-hidden />Decline</button>
          <button className="primary-button" disabled={busy} onClick={() => { setNotice(""); decide.mutate({ review, action: "approve" }); }} aria-label={`Approve ${review.display_name}`}>
            {busy && decide.variables?.review.id === review.id ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UserCheck size={17} aria-hidden />}Approve
          </button>
        </>}
      </div>
    </li>)}</ul>}
    <button className="text-button" disabled={queue.isFetching || busy} onClick={() => queue.refetch()}><RefreshCw size={16} aria-hidden className={queue.isFetching ? "spin" : ""} />Refresh</button>
  </dialog>;
}
