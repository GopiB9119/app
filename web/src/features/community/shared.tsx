"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Compass, Flag, Heart, LoaderCircle, LogIn, MessageCircle, Newspaper, RefreshCw, Rss, ShieldBan, ShieldCheck, UserRound } from "lucide-react";

import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useHydrated } from "@/features/platform/use-hydrated";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId } from "@/features/i18n/messages";
import { REPORT_REASONS, isUnknown, reactToPost, reportContent, termLabel, textProblem } from "./client";
import type { PublicPost, ReportReason, ReportTarget } from "./client";
import { useTaxonomy } from "./taxonomy-controls";
import styles from "./community.module.css";

export const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function useCommunityTime() {
  const { language } = useLanguage();
  return language === "en" ? time : new Intl.DateTimeFormat(language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function useViewer() {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }), retry: false });
  const hydrated = useHydrated();
  const signedOut = profile.error instanceof ApiError && profile.error.status === 401;
  return {
    account: hydrated ? profile.data?.data ?? null : null, pending: !hydrated || profile.isPending, signedOut,
    error: signedOut ? null : profile.error, retry: () => { void profile.refetch(); },
  };
}

export function sessionLost(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED");
}

export function problemText(error: unknown, fallback: string, t?: ReturnType<typeof useText>) {
  if (t && error instanceof ApiError && error.status === 0 && error.code === "OFFLINE") return t("community.offline");
  const text = error instanceof Error ? error.message : fallback;
  // The offline and service-unavailable messages already say the change is not confirmed; never say it twice.
  if (isUnknown(error) && !/not confirmed\.$/.test(text)) return t ? t("community.unconfirmed", { message: text }) : `${text} The change is not confirmed.`;
  return text;
}

export function useTextProblem() {
  const t = useText();
  return (value: string, limit: number, required = true) => {
    const problem = textProblem(value, limit, required);
    if (problem === "Enter some text first.") return t("community.textRequired");
    if (problem === `Use up to ${limit} characters.`) return t("community.textLimit", { limit });
    if (problem === "Remove control characters.") return t("community.textControl");
    return problem;
  };
}

// The public feed, page and post search, and your pages make up the Discover section (DEC-014); Blocked is under Profile.
type Section = "home" | "discover" | "pages" | "safety" | "moderation";
const sections: { key: Section; href: string; label: MessageId; icon: React.ReactNode; signedIn: boolean }[] = [
  { key: "home", href: "/app/home", label: "community.feed", icon: <Rss size={18} aria-hidden />, signedIn: true },
  { key: "discover", href: "/app/discover", label: "community.pagesAndPosts", icon: <Compass size={18} aria-hidden />, signedIn: false },
  { key: "pages", href: "/app/pages", label: "community.yourPages", icon: <Newspaper size={18} aria-hidden />, signedIn: true },
];

export function CommunityFrame({ account, current, children }: { account: Account | null; current: Section | null; children: React.ReactNode }) {
  const t = useText();
  return <Shell account={Boolean(account)}>
    <main className={styles.main}>
      {(current === "safety" || current === "moderation") && account
        ? <nav className={styles.navigation} aria-label={t("community.profile")}>
          <Link href="/app/settings/account"><UserRound size={18} aria-hidden />{t("community.account")}</Link>
          {current === "safety"
            ? <span aria-current="page"><ShieldBan size={18} aria-hidden />{t("community.blocked")}</span>
            : <Link href="/app/safety"><ShieldBan size={18} aria-hidden />{t("community.blocked")}</Link>}
          {current === "moderation" && <span aria-current="page"><ShieldCheck size={18} aria-hidden />{t("community.moderation")}</span>}
        </nav>
        : <nav className={styles.navigation} aria-label={t("community.discover")}>
          {sections.filter(item => account || !item.signedIn).map(item => item.key === current
            ? <span key={item.key} aria-current="page">{item.icon}{t(item.label)}</span>
            : <Link key={item.key} href={item.href}>{item.icon}{t(item.label)}</Link>)}
          {!account && <Link href="/login"><LogIn size={18} aria-hidden />{t("community.signIn")}</Link>}
        </nav>}
      {children}
    </main>
  </Shell>;
}

export function Loading({ label }: { label: string }) {
  return <Shell><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{label}</main></Shell>;
}

export function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useText();
  return <div className="message error" role="alert">
    {error instanceof ApiError && error.status === 0 && error.code === "OFFLINE" ? t("community.offline")
      : error instanceof Error ? error.message : t("community.somethingWrong")}
    <button className="text-button" onClick={retry}><RefreshCw size={16} aria-hidden />{t("community.retry")}</button>
  </div>;
}

export function PostCard({ post, account, onChange, onReport, linkTitle = true, pinnedMark = false, commentsPaused = false, menu, children }: {
  post: PublicPost; account: Account | null; onChange: (post: PublicPost) => void; onReport?: (target: ReportTarget) => void;
  linkTitle?: boolean; pinnedMark?: boolean; commentsPaused?: boolean; menu?: React.ReactNode; children?: React.ReactNode;
}) {
  const t = useText();
  const time = useCommunityTime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle(action: "like" | "unlike" | "save" | "unsave") {
    if (!account || busy) return;
    setBusy(true);
    setError("");
    try { onChange(await reactToPost(account.id, post.id, action)); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, t("community.changeFailed"), t));
    } finally { setBusy(false); }
  }
  const heading = post.title ?? t("community.postBy", { name: post.page_name });
  const when = post.published_at ?? post.created_at;
  const open = post.page_status === "active";
  return <article className={styles.card} aria-label={heading}>
    <div className={styles.cardHeader}>
      <Link href={`/pages/${post.page_handle}`}>{post.page_name}</Link>
      <span>@{post.page_handle}</span>
      <time dateTime={when}>{time.format(new Date(when))}</time>
      {post.edited_at && <span>{t("community.edited")}</span>}
      {pinnedMark && post.pinned && <span className={styles.badge}>{t("community.pinned")}</span>}
      {post.page_status !== "active" && <span className={styles.badge}>{t("community.manage.status.read_only")}</span>}
      {post.status === "draft" && <span className={`${styles.badge} ${styles.draftBadge}`}>{t("community.privateDraft")}</span>}
      {menu}
    </div>
    {post.title && (linkTitle && post.status === "published"
      ? <h2 className={styles.title}><Link href={`/posts/${post.id}`}>{post.title}</Link></h2>
      : <h2 className={styles.title}>{post.title}</h2>)}
    <p className={styles.body}>{post.body}</p>
    {(post.topics.length > 0 || post.interests.length > 0) && <PostTermChips post={post} />}
    {post.status === "published" && open && (post.page_limited || commentsPaused) && <p className={styles.notice} role="status">{t("community.commentsPaused")}</p>}
    {post.status === "published" && <div className={styles.actions}>
      {(open || post.liked) && <button className={`text-button ${post.liked ? styles.toggled : ""}`} aria-pressed={post.liked} disabled={!account || busy}
        onClick={() => toggle(post.liked ? "unlike" : "like")} title={account ? undefined : t("community.signInToLike")}>
        <Heart size={17} fill={post.liked ? "currentColor" : "none"} aria-hidden />{t("community.likePrefix")}<span className={styles.meta}>{post.like_count}</span>
      </button>}
      <Link className="text-button" href={`/posts/${post.id}`}><MessageCircle size={17} aria-hidden />{t("community.commentsPrefix")}<span className={styles.meta}>{post.comment_count}</span></Link>
      {account && (open || post.saved) && <button className={`text-button ${post.saved ? styles.toggled : ""}`} aria-pressed={post.saved} disabled={busy} onClick={() => toggle(post.saved ? "unsave" : "save")}>
        {post.saved ? <BookmarkCheck size={17} aria-hidden /> : <Bookmark size={17} aria-hidden />}{t(post.saved ? "community.saved" : "community.save")}
      </button>}
      {account && onReport && !post.can_manage && <button className="text-button" onClick={() => onReport({ type: "post", id: post.id, label: heading })}><Flag size={17} aria-hidden />{t("community.report")}</button>}
    </div>}
    {error && <div className="message error" role="alert">{error}</div>}
    {children}
  </article>;
}

function PostTermChips({ post }: { post: PublicPost }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  return <ul className={styles.classification} aria-label={t("community.postTerms")}>
    {post.topics.map(code => <li key={`topic:${code}`}>{termLabel(vocabulary.data ?? [], "topic", code, language)}</li>)}
    {post.interests.map(code => <li key={`interest:${code}`}>{termLabel(vocabulary.data ?? [], "interest", code, language)}</li>)}
  </ul>;
}

export function ReportDialog({ account, target, onClose }: { account: Account; target: ReportTarget; onClose: () => void }) {
  const t = useText();
  const textProblem = useTextProblem();
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
      setError(problemText(problem, t("community.reportFailed"), t));
    } finally { setBusy(false); }
  }
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id={heading}>{t(`community.reportTitle.${target.type}`)}</h2>
    <p className={styles.meta}>{target.label}</p>
    {done ? <>
      <p role="status">{t("community.reportReceived")}</p>
      <div className="dialog-actions"><button className="primary-button" onClick={onClose}>{t("community.close")}</button></div>
    </> : <form onSubmit={submit}>
      <fieldset>
        <legend>{t("community.reportWhy")}</legend>
        {REPORT_REASONS.map(item => <label key={item}><input type="radio" name="reason" value={item} checked={reason === item} onChange={() => setReason(item)} disabled={busy} />{t(`community.reason.${item}`)}</label>)}
      </fieldset>
      <label className={styles.meta} htmlFor={`${heading}-details`}>{t("community.detailsOptional")}</label>
      <textarea id={`${heading}-details`} value={details} maxLength={2000} onChange={event => setDetails(event.target.value)} disabled={busy} aria-invalid={detailProblem ? true : undefined} />
      {detailProblem && <span className="field-error">{detailProblem}</span>}
      {error && <div className="message error" role="alert">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{t("community.cancel")}</button>
        <button type="submit" className="primary-button" disabled={!reason || Boolean(detailProblem) || busy}>{busy ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Flag size={17} aria-hidden />}{t("community.sendReport")}</button>
      </div>
    </form>}
  </dialog>;
}
