"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Compass, Flag, Heart, LoaderCircle, LogIn, MessageCircle, Newspaper, RefreshCw, Rss, ShieldBan, UserRound } from "lucide-react";

import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { REPORT_REASONS, isUnknown, reactToPost, reasonLabels, reportContent, textProblem } from "./client";
import type { PublicPost, ReportReason, ReportTarget } from "./client";
import styles from "./community.module.css";

export const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function useViewer() {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }), retry: false });
  const signedOut = profile.error instanceof ApiError && profile.error.status === 401;
  return {
    account: profile.data?.data ?? null, pending: profile.isPending, signedOut,
    error: signedOut ? null : profile.error, retry: () => { void profile.refetch(); },
  };
}

export function sessionLost(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED");
}

export function problemText(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : fallback;
  // The offline and service-unavailable messages already say the change is not confirmed; never say it twice.
  if (isUnknown(error) && !/not confirmed\.$/.test(text)) return `${text} The change is not confirmed.`;
  return text;
}

// The public feed, page and post search, and your pages make up the Discover section (DEC-014); Blocked is under Profile.
type Section = "home" | "discover" | "pages" | "safety";
const sections: { key: Section; href: string; label: string; icon: React.ReactNode; signedIn: boolean }[] = [
  { key: "home", href: "/app/home", label: "Feed", icon: <Rss size={18} aria-hidden />, signedIn: true },
  { key: "discover", href: "/app/discover", label: "Pages and posts", icon: <Compass size={18} aria-hidden />, signedIn: false },
  { key: "pages", href: "/app/pages", label: "Your pages", icon: <Newspaper size={18} aria-hidden />, signedIn: true },
];

export function CommunityFrame({ account, current, children }: { account: Account | null; current: Section | null; children: React.ReactNode }) {
  return <Shell account={Boolean(account)}>
    <main className={styles.main}>
      {current === "safety" && account
        ? <nav className={styles.navigation} aria-label="Profile">
          <Link href="/app/settings/account"><UserRound size={18} aria-hidden />Account</Link>
          <span aria-current="page"><ShieldBan size={18} aria-hidden />Blocked</span>
        </nav>
        : <nav className={styles.navigation} aria-label="Discover">
          {sections.filter(item => account || !item.signedIn).map(item => item.key === current
            ? <span key={item.key} aria-current="page">{item.icon}{item.label}</span>
            : <Link key={item.key} href={item.href}>{item.icon}{item.label}</Link>)}
          {!account && <Link href="/login"><LogIn size={18} aria-hidden />Sign in</Link>}
        </nav>}
      {children}
    </main>
  </Shell>;
}

export function Loading({ label }: { label: string }) {
  return <Shell><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{label}</main></Shell>;
}

export function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="message error" role="alert">
    {error instanceof Error ? error.message : "Something went wrong."}
    <button className="text-button" onClick={retry}><RefreshCw size={16} aria-hidden />Retry</button>
  </div>;
}

export function PostCard({ post, account, onChange, onReport, linkTitle = true, children }: {
  post: PublicPost; account: Account | null; onChange: (post: PublicPost) => void; onReport?: (target: ReportTarget) => void;
  linkTitle?: boolean; children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle(action: "like" | "unlike" | "save" | "unsave") {
    if (!account || busy) return;
    setBusy(true);
    setError("");
    try { onChange(await reactToPost(account.id, post.id, action)); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, "The change failed."));
    } finally { setBusy(false); }
  }
  const heading = post.title ?? `Post by ${post.page_name}`;
  const when = post.published_at ?? post.created_at;
  return <article className={styles.card} aria-label={heading}>
    <div className={styles.cardHeader}>
      <Link href={`/pages/${post.page_handle}`}>{post.page_name}</Link>
      <span>@{post.page_handle}</span>
      <time dateTime={when}>{time.format(new Date(when))}</time>
      {post.edited_at && <span>Edited</span>}
      {post.status === "draft" && <span className={`${styles.badge} ${styles.draftBadge}`}>Draft, only you can see it</span>}
    </div>
    {post.title && (linkTitle && post.status === "published"
      ? <h2 className={styles.title}><Link href={`/posts/${post.id}`}>{post.title}</Link></h2>
      : <h2 className={styles.title}>{post.title}</h2>)}
    <p className={styles.body}>{post.body}</p>
    {post.status === "published" && <div className={styles.actions}>
      <button className={`text-button ${post.liked ? styles.toggled : ""}`} aria-pressed={post.liked} disabled={!account || busy}
        onClick={() => toggle(post.liked ? "unlike" : "like")} title={account ? undefined : "Sign in to like posts"}>
        <Heart size={17} fill={post.liked ? "currentColor" : "none"} aria-hidden />{"Like "}<span className={styles.meta}>{post.like_count}</span>
      </button>
      <Link className="text-button" href={`/posts/${post.id}`}><MessageCircle size={17} aria-hidden />{"Comments "}<span className={styles.meta}>{post.comment_count}</span></Link>
      {account && <button className={`text-button ${post.saved ? styles.toggled : ""}`} aria-pressed={post.saved} disabled={busy} onClick={() => toggle(post.saved ? "unsave" : "save")}>
        {post.saved ? <BookmarkCheck size={17} aria-hidden /> : <Bookmark size={17} aria-hidden />}{post.saved ? "Saved" : "Save"}
      </button>}
      {account && onReport && !post.can_manage && <button className="text-button" onClick={() => onReport({ type: "post", id: post.id, label: heading })}><Flag size={17} aria-hidden />Report</button>}
    </div>}
    {error && <div className="message error" role="alert">{error}</div>}
    {children}
  </article>;
}

export function ReportDialog({ account, target, onClose }: { account: Account; target: ReportTarget; onClose: () => void }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const heading = useId();
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  const detailProblem = textProblem(details, 1000, false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason || detailProblem || busy) return;
    setBusy(true);
    setError("");
    try { await reportContent(account.id, target, reason, details.trim()); setDone(true); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      // Reporting the same target again returns the first open report, so a retry is safe.
      setError(problemText(problem, "The report was not sent."));
    } finally { setBusy(false); }
  }
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id={heading}>Report {target.type}</h2>
    <p className={styles.meta}>{target.label}</p>
    {done ? <>
      <p role="status">Report received. It is stored for review; the person you reported is not told who sent it. Moderator review tools are not built yet.</p>
      <div className="dialog-actions"><button className="primary-button" onClick={onClose}>Close</button></div>
    </> : <form onSubmit={submit}>
      <fieldset>
        <legend>Why are you reporting this?</legend>
        {REPORT_REASONS.map(item => <label key={item}><input type="radio" name="reason" value={item} checked={reason === item} onChange={() => setReason(item)} disabled={busy} />{reasonLabels[item]}</label>)}
      </fieldset>
      <label className={styles.meta} htmlFor={`${heading}-details`}>Details (optional)</label>
      <textarea id={`${heading}-details`} value={details} maxLength={2000} onChange={event => setDetails(event.target.value)} disabled={busy} aria-invalid={detailProblem ? true : undefined} />
      {detailProblem && <span className="field-error">{detailProblem}</span>}
      {error && <div className="message error" role="alert">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="primary-button" disabled={!reason || Boolean(detailProblem) || busy}>{busy ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Flag size={17} aria-hidden />}Send report</button>
      </div>
    </form>}
  </dialog>;
}
