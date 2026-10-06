"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, LoaderCircle } from "lucide-react";
import type { Account } from "@/features/identity/client";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { PublicPage } from "./client";
import {
  HELP_KINDS, HELP_REPORT_REASONS, approveHelpPost, createHelpPost, deleteHelpPost, endHelpReply, hasContactDetails, helpPosts, helpReplies, helpReportNotes, keepHelpPost,
  myHelpPosts, removeHelpPost, replyToHelpPost, reportHelpPost, helpReviewQueue,
  resolveHelpPost, setHelpOpen,
} from "./help-client";
import type { HelpKind, HelpPost, HelpReportReason } from "./help-client";
import { problemText, sessionLost, useTextProblem } from "./shared";
import styles from "./community.module.css";

type Run = (action: () => Promise<unknown>) => Promise<void>;

function useRunner(fallback: string, onDone: () => void): [Run, boolean, string] {
  const t = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run: Run = async action => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); onDone(); }
    catch (failure) {
      if (sessionLost(failure)) { window.location.reload(); return; }
      setError(problemText(failure, fallback, t));
      onDone();
    } finally { setBusy(false); }
  };
  return [run, busy, error];
}

/** Requests for help and offers of help on a page (D3). Replies stay private to the people involved. */
export function HelpSection({ viewer, page, onPageChanged }: { viewer: Account | null; page: PublicPage; onPageChanged: (page: PublicPage) => void }) {
  const t = useText();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"open" | "all">("open");
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["help-posts", page.id] }); };
  const [run, busy, error] = useRunner(t("community.help.changeFailed"), refresh);
  const posts = useInfiniteQuery({
    queryKey: ["help-posts", page.id, viewer?.id ?? null, state],
    queryFn: ({ pageParam, signal }) => helpPosts(page.id, viewer?.id, state, pageParam, signal),
    initialPageParam: null as string | null, getNextPageParam: last => last.next,
    enabled: !page.blocked && page.status !== "deleted", networkMode: "always",
  });
  const items = posts.data?.pages.flatMap(item => item.items) ?? [];
  const active = page.status === "active";
  if (page.blocked || page.status === "deleted" || (!page.help_open && !page.can_manage && items.length === 0)) return null;
  const canPost = Boolean(viewer && active && page.help_open && (page.following || page.can_manage));
  return <section className={styles.stack} aria-labelledby="help-heading">
    <h2 id="help-heading">{t("community.help.heading")}</h2>
    <p className={styles.meta}>{t("community.help.intro")}</p>
    {page.can_manage && viewer && active && <div className={styles.actions}>
      {!page.help_open && <p className={styles.meta}>{t("community.help.offNotice")}</p>}
      <button className="secondary-button" disabled={busy} aria-pressed={page.help_open}
        onClick={() => run(async () => onPageChanged(await setHelpOpen(viewer.id, page, !page.help_open)))}>
        {t(page.help_open ? "community.help.turnOff" : "community.help.turnOn")}
      </button>
    </div>}
    {page.help_open && active && !viewer && <p className={styles.meta}>{t("community.help.signInToPost")}</p>}
    {page.help_open && active && viewer && !canPost && <p className={styles.meta}>{t("community.help.followToPost")}</p>}
    {canPost && viewer && <HelpComposer account={viewer} pageId={page.id} onCreated={refresh} />}
    {error && <div className="message error" role="alert">{error}</div>}
    <div className={styles.actions} role="group" aria-label={t("community.help.heading")}>
      {(["open", "all"] as const).map(value => <button key={value} className={state === value ? "primary-button" : "secondary-button"} aria-pressed={state === value}
        onClick={() => setState(value)}>{t(value === "open" ? "community.help.showOpen" : "community.help.showAll")}</button>)}
    </div>
    {posts.isPending && <p role="status" aria-busy="true">{t("community.help.loading")}</p>}
    {posts.isError && !sessionLost(posts.error) && <div className="message error" role="alert">{problemText(posts.error, t("community.help.changeFailed"), t)}</div>}
    {!posts.isPending && !posts.isError && items.length === 0 && <p className={styles.empty}>{t(state === "open" ? "community.help.empty" : "community.help.emptyAll")}</p>}
    {items.map(post => <HelpCard key={post.id} viewer={viewer} post={post} pageActive={active} onChanged={refresh} />)}
    {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>{t("community.help.more")}</button>}
  </section>;
}

function HelpComposer({ account, pageId, onCreated }: { account: Account; pageId: string; onCreated: () => void }) {
  const t = useText();
  const [kind, setKind] = useState<HelpKind>("request");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [needBy, setNeedBy] = useState("");
  // One key per post, kept across retries, so a lost answer never creates a second post.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [run, busy, error] = useRunner(t("community.help.postFailed"), () => undefined);
  const contact = hasContactDetails(title) || hasContactDetails(details);
  const ready = title.trim().length > 0 && !contact;
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    void run(async () => {
      await createHelpPost({ accountId: account.id, key, pageId, body: { kind, title, details, ...(kind === "request" && needBy ? { need_by: needBy } : {}) } });
      setTitle(""); setDetails(""); setNeedBy(""); setKey(crypto.randomUUID());
      onCreated();
    });
  }
  return <form className={styles.form} onSubmit={submit} aria-label={t("community.help.new")}>
    <h3>{t("community.help.new")}</h3>
    <div className={styles.actions} role="group" aria-label={t("community.help.kind")}>
      {HELP_KINDS.map(value => <button key={value} type="button" className={kind === value ? "primary-button" : "secondary-button"} aria-pressed={kind === value}
        disabled={busy} onClick={() => setKind(value)}>{t(`community.help.kind.${value}`)}</button>)}
    </div>
    <label>{t("community.help.title")}<input value={title} maxLength={240} required aria-describedby="help-public-hint" onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
    <label>{t("community.help.details")}<textarea value={details} maxLength={2000} aria-describedby="help-public-hint" onChange={event => setDetails(event.target.value)} disabled={busy} /></label>
    {kind === "request" && <label>{t("community.help.needBy")}<input type="date" value={needBy} onChange={event => setNeedBy(event.target.value)} disabled={busy} /></label>}
    <p id="help-public-hint" className={styles.meta}>{t("community.help.publicHint")}</p>
    {contact && <p className="message error" role="alert">{t("community.help.contactProblem")}</p>}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={busy || !ready}>{busy && <LoaderCircle size={17} className="spin" aria-hidden />}{t("community.help.post")}</button>
    </div>
  </form>;
}

function HelpCard({ viewer, post, pageActive, onChanged }: { viewer: Account | null; post: HelpPost; pageActive: boolean; onChanged: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [body, setBody] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const insider = post.mine || post.can_manage;
  const replies = useQuery({
    queryKey: ["help-replies", post.id, viewer?.id ?? null],
    queryFn: ({ signal }) => helpReplies(viewer!.id, post.id, signal),
    enabled: Boolean(viewer && (showReplies || post.replied)), networkMode: "always",
  });
  const [run, busy, error] = useRunner(t("community.help.changeFailed"), () => {
    void queryClient.invalidateQueries({ queryKey: ["help-replies", post.id] });
    onChanged();
  });
  const open = post.status === "open";
  const reasonText = useReasonText();
  const notes = useQuery({
    queryKey: ["help-report-notes", post.id, viewer?.id ?? null],
    queryFn: ({ signal }) => helpReportNotes(viewer!.id, post.id, signal),
    enabled: Boolean(viewer && showNotes && post.reports?.length), networkMode: "always",
  });
  const own = replies.data?.find(item => item.mine && item.status === "active");
  const heading = `help-${post.id}`;
  const needBy = post.need_by && new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${post.need_by}T00:00:00Z`));
  const facts = [t("community.help.by", { name: post.author_name })];
  if (needBy) facts.push(t("community.help.neededBy", { date: needBy }));
  if (insider) facts.push(post.reply_count === 1 ? t("community.help.replies.one") : t("community.help.replies.other", { count: post.reply_count }));
  return <article className={styles.card} aria-labelledby={heading}>
    <div className={styles.actions}>
      <span className={styles.badge}>{t(`community.help.badge.${post.kind}`)}</span>
      {post.status !== "open" && <span className={styles.badge}>{t(`community.help.status.${post.status}`)}</span>}
      {post.author_new && <span className={styles.badge}>{t("community.help.newAccount")}</span>}
    </div>
    <h3 id={heading}>{post.title}</h3>
    {post.details && <p className={styles.body}>{post.details}</p>}
    <p className={styles.meta}>{facts.join(" · ")}</p>
    {post.status === "pending" && post.mine && <p className={styles.notice}>{t("community.help.pendingNotice")}</p>}
    {post.reports && post.reports.length > 0 && viewer && <div className={styles.notice} role="note">
      <p>{t("community.help.reportsWaiting", { list: post.reports.map(item => `${reasonText(item.reason)} (${item.count})`).join(", ") })}</p>
      {showNotes && notes.data && (notes.data.some(item => item.details)
        ? <ul className={styles.list}>{notes.data.filter(item => item.details).map(item => <li key={item.id}>{reasonText(item.reason)}: {item.details}</li>)}</ul>
        : <p className={styles.meta}>{t("community.help.noReportNotes")}</p>)}
      <div className={styles.actions}>
        <button className="secondary-button" disabled={busy} onClick={() => run(() => keepHelpPost(viewer.id, post))}>{t("community.help.keep")}</button>
        <button className="text-button" aria-expanded={showNotes} onClick={() => setShowNotes(value => !value)}>
          {t(showNotes ? "community.help.hideReportNotes" : "community.help.reportNotes")}</button>
      </div>
    </div>}
    {error && <div className="message error" role="alert">{error}</div>}
    <div className={styles.actions}>
      {viewer && !post.mine && open && pageActive && !post.replied && !replying &&
        <button className="primary-button" onClick={() => setReplying(true)}>{t(`community.help.reply.${post.kind}`)}</button>}
      {post.replied && <span className={styles.meta}>{t("community.help.replied")}</span>}
      {own && <button className="text-button" disabled={busy} onClick={() => run(() => endHelpReply(viewer!.id, own.id))}>{t("community.help.withdraw")}</button>}
      {post.mine && open && pageActive && <button className="secondary-button" disabled={busy} onClick={() => run(() => resolveHelpPost(viewer!.id, post, "helped"))}>{t("community.help.markHelped")}</button>}
      {post.mine && open && pageActive && <button className="secondary-button" disabled={busy} onClick={() => run(() => resolveHelpPost(viewer!.id, post, "closed"))}>{t("community.help.close")}</button>}
      {post.mine && <button className="text-button" disabled={busy}
        onClick={() => { if (window.confirm(t("community.help.confirmDelete"))) void run(() => deleteHelpPost(viewer!.id, post)); }}>{t("community.help.delete")}</button>}
      {post.can_manage && post.status === "pending" && <button className="primary-button" disabled={busy} onClick={() => run(() => approveHelpPost(viewer!.id, post))}>{t("community.help.approve")}</button>}
      {post.can_manage && !post.mine && post.status !== "removed" && <button className="text-button" disabled={busy} onClick={() => run(() => removeHelpPost(viewer!.id, post))}>{t("community.help.remove")}</button>}
      {insider && viewer && <button className="text-button" aria-expanded={showReplies} onClick={() => setShowReplies(value => !value)}>
        {t(showReplies ? "community.help.hideReplies" : "community.help.showReplies")}</button>}
      {viewer && !post.mine && !post.can_manage && post.status !== "removed" && (post.reported
        ? <span className={styles.meta}>{t("community.help.reported")}</span>
        : <button className="text-button" onClick={() => setReporting(true)}><Flag size={16} aria-hidden />{t("community.report")}</button>)}
    </div>
    {reporting && viewer && <HelpReportDialog account={viewer} post={post} onClose={() => { setReporting(false); onChanged(); }} />}
    {replying && viewer && <form className={styles.form} aria-label={t("community.help.replyLabel")} onSubmit={event => {
      event.preventDefault();
      if (!body.trim()) return;
      void run(async () => {
        await replyToHelpPost({ accountId: viewer.id, key, postId: post.id, body: { body } });
        setBody(""); setKey(crypto.randomUUID()); setReplying(false);
      });
    }}>
      <label>{t("community.help.replyLabel")}<textarea value={body} maxLength={1000} aria-describedby={`${heading}-reply-hint`} onChange={event => setBody(event.target.value)} disabled={busy} /></label>
      <p id={`${heading}-reply-hint`} className={styles.meta}>{t("community.help.replyHint")}</p>
      <div className={styles.actions}>
        <button className="primary-button" type="submit" disabled={busy || !body.trim()}>{t("community.help.send")}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => setReplying(false)}>{t("community.cancel")}</button>
      </div>
    </form>}
    {insider && showReplies && <div className={styles.stack}>
      {replies.isPending && <p role="status" aria-busy="true">{t("community.help.loading")}</p>}
      {replies.data?.length === 0 && <p className={styles.empty}>{t("community.help.noReplies")}</p>}
      {replies.data?.map(item => <div key={item.id} className={styles.notice}>
        <p className={styles.meta}>{item.author_name}{item.author_new ? ` · ${t("community.help.newAccount")}` : ""}{item.helped ? ` · ${t("community.help.helpedMark")}` : ""}</p>
        {item.body && <p className={styles.body}>{item.body}</p>}
        <div className={styles.actions}>
          {post.mine && open && item.status === "active" && <button className="secondary-button" disabled={busy}
            onClick={() => run(() => resolveHelpPost(viewer!.id, post, "helped", item.id))}>{t("community.help.thisHelped")}</button>}
          {!item.mine && item.status === "active" && <button className="text-button" disabled={busy}
            onClick={() => run(() => endHelpReply(viewer!.id, item.id))}>{t("community.help.removeReply")}</button>}
        </div>
      </div>)}
    </div>}
  </article>;
}

function useReasonText() {
  const t = useText();
  return (reason: HelpReportReason) => reason === "scam" ? t("community.help.reasonScam") : t(`community.reason.${reason}`);
}

function HelpReportDialog({ account, post, onClose }: { account: Account; post: HelpPost; onClose: () => void }) {
  const t = useText();
  const textProblem = useTextProblem();
  const reasonText = useReasonText();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [reason, setReason] = useState<HelpReportReason | "">("");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);
  const heading = useId();
  const [run, busy, error] = useRunner(t("community.reportFailed"), () => undefined);
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  const detailProblem = textProblem(details, 1000, false);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason || detailProblem) return;
    void run(async () => { await reportHelpPost(account.id, post.id, reason, details.trim()); setDone(true); });
  }
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id={heading}>{t("community.help.reportTitle")}</h2>
    <p className={styles.meta}>{post.title}</p>
    {done ? <>
      <p role="status">{t("community.help.reportReceived")}</p>
      <div className="dialog-actions"><button className="primary-button" onClick={onClose}>{t("community.close")}</button></div>
    </> : <form onSubmit={submit}>
      <fieldset>
        <legend>{t("community.reportWhy")}</legend>
        {HELP_REPORT_REASONS.map(item => <label key={item}><input type="radio" name="reason" value={item} checked={reason === item} onChange={() => setReason(item)} disabled={busy} />{reasonText(item)}</label>)}
      </fieldset>
      <label className={styles.meta} htmlFor={`${heading}-details`}>{t("community.detailsOptional")}</label>
      <textarea id={`${heading}-details`} value={details} maxLength={2000} aria-describedby={`${heading}-hint`} onChange={event => setDetails(event.target.value)} disabled={busy} aria-invalid={detailProblem ? true : undefined} />
      <p id={`${heading}-hint`} className={styles.meta}>{t("community.help.reportHint")}</p>
      {detailProblem && <span className="field-error">{detailProblem}</span>}
      {error && <div className="message error" role="alert">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{t("community.cancel")}</button>
        <button type="submit" className="primary-button" disabled={!reason || Boolean(detailProblem) || busy}>{busy ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Flag size={17} aria-hidden />}{t("community.sendReport")}</button>
      </div>
    </form>}
  </dialog>;
}

/** Held posts and reported posts on the pages the person runs; nothing shows when there is nothing to review. */
export function HelpReviewQueue({ account }: { account: Account }) {
  const t = useText();
  const queue = useQuery({
    queryKey: ["help-review", account.id],
    queryFn: ({ signal }) => helpReviewQueue(account.id, signal), networkMode: "always",
  });
  if (queue.isError && !sessionLost(queue.error)) {
    return <div className="message error" role="alert">{problemText(queue.error, t("community.help.changeFailed"), t)}</div>;
  }
  if (!queue.data?.length) return null;
  return <section className={styles.stack} aria-labelledby="help-review-heading">
    <h2 id="help-review-heading">{t("community.help.reviewQueue")}</h2>
    <ul className={styles.list}>
      {queue.data.map(post => {
        const reports = post.reports?.reduce((total, item) => total + item.count, 0) ?? 0;
        const facts = [post.page_name];
        if (post.status === "pending") facts.push(t("community.help.status.pending"));
        if (reports > 0) facts.push(t("community.help.reportCount", { count: reports }));
        return <li key={post.id} className={styles.row}>
          <span><Link href={`/pages/${post.page_handle}`}>{post.title}</Link>{" "}<span className={styles.meta}>{facts.join(" · ")}</span></span>
        </li>;
      })}
    </ul>
  </section>;
}

/** The person's own requests and offers on every page, so new replies are easy to find. */
export function MyHelpPosts({ account }: { account: Account }) {
  const t = useText();
  const posts = useInfiniteQuery({
    queryKey: ["my-help-posts", account.id],
    queryFn: ({ pageParam, signal }) => myHelpPosts(account.id, pageParam, signal),
    initialPageParam: null as string | null, getNextPageParam: last => last.next, networkMode: "always",
  });
  const items = posts.data?.pages.flatMap(item => item.items) ?? [];
  const progress = (post: HelpPost) => post.status !== "open" ? t(`community.help.status.${post.status}`)
    : post.reply_count === 1 ? t("community.help.replies.one") : t("community.help.replies.other", { count: post.reply_count });
  return <section className={styles.stack} aria-labelledby="my-help-heading">
    <h2 id="my-help-heading">{t("community.help.mine")}</h2>
    {posts.isPending && <p role="status" aria-busy="true">{t("community.help.loading")}</p>}
    {posts.isError && !sessionLost(posts.error) && <div className="message error" role="alert">{problemText(posts.error, t("community.help.changeFailed"), t)}</div>}
    {posts.isSuccess && items.length === 0 && <p className={styles.empty}>{t("community.help.mineEmpty")}</p>}
    {items.length > 0 && <ul className={styles.list}>
      {items.map(post => <li key={post.id} className={styles.row}>
        <span><Link href={`/pages/${post.page_handle}`}>{post.title}</Link>{" "}
          <span className={styles.meta}>{[post.page_name, t(`community.help.badge.${post.kind}`), progress(post)].join(" · ")}</span></span>
      </li>)}
    </ul>}
    {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>{t("community.help.more")}</button>}
  </section>;
}
