"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Flag, LoaderCircle, MessageCircle, Reply, Trash2 } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { ApiError } from "@/features/identity/client";
import { useText } from "@/features/i18n/i18n";
import { block, createComment, endComment, isUnknown, postComments, readPost } from "./client";
import type { CreateIntent, PostComment, PublicPost, ReportTarget } from "./client";
import { CommunityFrame, Failure, Loading, PostCard, ReportDialog, problemText, sessionLost, useCommunityTime, useTextProblem, useViewer } from "./shared";
import styles from "./community.module.css";

type CommentIntent = CreateIntent<{ body: string; parent_id?: string }> & { postId: string };

export function PostScreen({ postId }: { postId: string }) {
  const t = useText();
  const viewer = useViewer();
  if (viewer.pending) return <Loading label={t("community.loadingPost")} />;
  if (viewer.error) return <CommunityFrame account={null} current={null}><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <PostView key={viewer.account?.id ?? "signed-out"} viewer={viewer.account} postId={postId} />;
}

function PostView({ viewer, postId }: { viewer: Account | null; postId: string }) {
  const t = useText();
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [override, setOverride] = useState<PublicPost | null>(null);
  const [pauseError, setPauseError] = useState<{ postId: string; message: string; suspended: boolean } | null>(null);
  const postKey = ["public-post", postId, viewer?.id ?? null];
  const post = useQuery({ queryKey: postKey, queryFn: ({ signal }) => readPost(postId, viewer?.id, signal), networkMode: "always" });
  const comments = useInfiniteQuery({
    queryKey: ["post-comments", postId, viewer?.id ?? null],
    queryFn: ({ pageParam, signal }) => postComments(postId, viewer?.id, pageParam, signal),
    initialPageParam: null as string | null, getNextPageParam: last => last.next,
    enabled: post.data?.status === "published", networkMode: "always",
  });
  useEffect(() => { if (sessionLost(post.error ?? comments.error)) window.location.reload(); }, [post.error, comments.error]);
  function refresh() {
    setOverride(null);
    void queryClient.invalidateQueries({ queryKey: ["public-post", postId] });
    void queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
  }
  function pauseComments(problem: ApiError) {
    setPauseError({ postId, message: problemText(problem, t("community.commentFailed"), t), suspended: problem.code === "PAGE_SUSPENDED" });
    if (problem.code === "PAGE_LIMITED") queryClient.setQueryData<PublicPost>(postKey, previous => previous ? { ...previous, page_limited: true } : previous);
    refresh();
  }
  if (post.isPending) return <CommunityFrame account={viewer} current={null}><p role="status" aria-busy="true">{t("community.loadingPostStatus")}</p></CommunityFrame>;
  if (!post.data) {
    const missing = post.error instanceof ApiError && post.error.status === 404;
    return <CommunityFrame account={viewer} current={null}>
      {missing ? <><h1>{t("community.postNotFound")}</h1><p className={styles.empty}>{t("community.postMissing")}</p></> : <Failure error={post.error} retry={() => post.refetch()} />}
    </CommunityFrame>;
  }
  const current = override ?? post.data;
  const pausedMessage = pauseError?.postId === postId ? pauseError.message : "";
  const commentsPaused = current.page_limited || Boolean(pausedMessage && pauseError?.suspended);
  const all = comments.data?.pages.flatMap(page => page.items) ?? [];
  const topLevel = all.filter(item => item.parent_id === null);
  const replies = (id: string) => all.filter(item => item.parent_id === id);
  return <CommunityFrame account={viewer} current={null}>
    <div className={styles.heading}><h1>{t("community.postFrom", { name: current.page_name })}</h1></div>
    <PostCard post={current} account={viewer} onChange={setOverride} onReport={setReport} linkTitle={false} commentsPaused={commentsPaused}>
      {current.moderation && <p className={styles.meta}>{t("community.hiddenByModerators", { reason: t(`community.reason.${current.moderation.reason}`) })}</p>}
      {current.can_manage && <p className={styles.meta}>{t("community.youOwnPageBefore")}<Link href={`/pages/${current.page_handle}`}>{t("community.editOnPage")}</Link>{t("community.sentenceEnd")}</p>}
    </PostCard>
    {pausedMessage && commentsPaused && <div className="message error" role="alert">{pausedMessage}</div>}
    {current.status === "published" && <section className={styles.stack} aria-labelledby="comments-heading">
      <h2 id="comments-heading"><MessageCircle size={20} aria-hidden /> {t("community.comments")}</h2>
      {current.page_status !== "active" ? <p className={styles.notice} role="status">{t("community.manage.readOnly")}</p>
        : !commentsPaused && (viewer ? <CommentForm account={viewer} postId={current.id} onSaved={refresh} onPaused={pauseComments} /> : <p className={styles.notice}><Link href="/login">{t("community.signIn")}</Link>{t("community.signInToCommentAfter")}</p>)}
      {comments.isPending && <p role="status" aria-busy="true">{t("community.loadingComments")}</p>}
      {comments.isError && !sessionLost(comments.error) && <Failure error={comments.error} retry={() => comments.refetch()} />}
      {!comments.isPending && !comments.isError && all.length === 0 && <p className={styles.empty}>{t("community.noComments")}</p>}
      <ul className={styles.comments} aria-label={t("community.comments")}>
        {topLevel.map(item => <li key={item.id}>
          <CommentItem comment={item} account={viewer} postId={current.id} canReply={current.page_status === "active" && !commentsPaused} onChanged={refresh} onPaused={pauseComments} onReport={setReport} />
          {replies(item.id).length > 0 && <ul className={styles.comments} aria-label={t("community.repliesTo", { name: item.author_name })}>
            {replies(item.id).map(reply => <li key={reply.id} className={styles.reply}>
              <CommentItem comment={reply} account={viewer} postId={current.id} canReply={false} onChanged={refresh} onPaused={pauseComments} onReport={setReport} />
            </li>)}
          </ul>}
        </li>)}
      </ul>
      {comments.hasNextPage && !comments.isError && <button className="secondary-button" disabled={comments.isFetchingNextPage} onClick={() => comments.fetchNextPage()}>{t("community.moreComments")}</button>}
    </section>}
    {report && viewer && <ReportDialog account={viewer} target={report} onClose={() => setReport(null)} />}
  </CommunityFrame>;
}

function CommentItem({ comment, account, postId, canReply, onChanged, onPaused, onReport }: {
  comment: PostComment; account: Account | null; postId: string; canReply: boolean; onChanged: () => void; onPaused: (problem: ApiError) => void; onReport: (target: ReportTarget) => void;
}) {
  const t = useText();
  const time = useCommunityTime();
  const [mode, setMode] = useState<"idle" | "reply" | "remove" | "block">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!canReply && mode === "reply") setMode("idle"); }, [canReply, mode]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await action(); setMode("idle"); onChanged(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, t("community.changeFailed"), t));
    } finally { setBusy(false); }
  }
  const visible = comment.status === "visible";
  return <article className={styles.comment} aria-label={t("community.commentBy", { name: comment.author_name })}>
    <div className={styles.cardHeader}>
      <strong>{comment.mine ? t("community.you") : comment.author_name}</strong>
      <time dateTime={comment.created_at}>{time.format(new Date(comment.created_at))}</time>
    </div>
    {visible ? <p className={styles.body}>{comment.body}</p>
      : <p className={styles.removed}>{t(comment.status === "removed" ? "community.commentRemoved" : "community.commentDeleted")}</p>}
    {comment.moderation && <p className={styles.meta}>{t("community.hiddenByModerators", { reason: t(`community.reason.${comment.moderation.reason}`) })}</p>}
    {account && visible && mode === "idle" && <div className={styles.actions}>
      {canReply && comment.parent_id === null && <button className="text-button" onClick={() => setMode("reply")}><Reply size={16} aria-hidden />{t("community.reply")}</button>}
      {comment.can_remove && <button className="text-button" onClick={() => setMode("remove")}><Trash2 size={16} aria-hidden />{t(comment.mine ? "community.delete" : "community.remove")}</button>}
      {!comment.mine && <button className="text-button" onClick={() => setMode("block")}><Ban size={16} aria-hidden />{t("community.blockAuthor")}</button>}
      {!comment.mine && <button className="text-button" onClick={() => onReport({ type: "comment", id: comment.id, label: t("community.commentBy", { name: comment.author_name }) })}><Flag size={16} aria-hidden />{t("community.report")}</button>}
    </div>}
    {mode === "reply" && canReply && account && <CommentForm account={account} postId={postId} parent={comment} onSaved={() => { setMode("idle"); onChanged(); }} onPaused={onPaused} onCancel={() => setMode("idle")} />}
    {mode === "remove" && account && <div className={styles.notice} role="group" aria-label={t("community.confirmCommentRemoval")}>
      <p>{t(comment.mine ? "community.deleteCommentQuestion" : "community.removeCommentQuestion")}</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => run(() => endComment(account.id, comment.id))}>{t(comment.mine ? "community.deleteComment" : "community.removeComment")}</button>
        <button className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>{t("community.keep")}</button>
      </div>
    </div>}
    {mode === "block" && account && <div className={styles.notice} role="group" aria-label={t("community.confirmBlock")}>
      <p>{t("community.blockPersonQuestion", { name: comment.author_name })}</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => run(() => block(account.id, "comment_author", comment.id))}>{t("community.blockPerson")}</button>
        <button className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>{t("community.cancel")}</button>
      </div>
    </div>}
    {error && <div className="message error" role="alert">{error}</div>}
  </article>;
}

function CommentForm({ account, postId, parent, onSaved, onPaused, onCancel }: { account: Account; postId: string; parent?: PostComment; onSaved: () => void; onPaused: (problem: ApiError) => void; onCancel?: () => void }) {
  const t = useText();
  const textProblem = useTextProblem();
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<CommentIntent | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "unknown">("idle");
  const [error, setError] = useState("");
  const invalid = textProblem(text, 2000);
  async function send(next: CommentIntent) {
    setIntent(next);
    setState("sending");
    setError("");
    try { await createComment(next); setIntent(null); setText(""); setState("idle"); onSaved(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      if (isUnknown(problem)) { setState("unknown"); setError(problemText(problem, t("community.commentUnknown"), t)); return; }
      setIntent(null); setState("idle"); setError(problemText(problem, t("community.commentFailed"), t));
      if (problem instanceof ApiError && problem.status === 409 && (problem.code === "PAGE_LIMITED" || problem.code === "PAGE_SUSPENDED")) onPaused(problem);
    }
  }
  const label = parent ? t("community.replyTo", { name: parent.author_name }) : t("community.writeComment");
  return <form className={styles.form} onSubmit={event => {
    event.preventDefault();
    if (invalid || state !== "idle") return;
    void send({ accountId: account.id, postId, key: crypto.randomUUID(), body: { body: text.trim(), ...(parent ? { parent_id: parent.id } : {}) } });
  }}>
    <label>{label}<textarea value={text} maxLength={4000} onChange={event => setText(event.target.value)} disabled={state !== "idle"} /></label>
    {text && invalid && <span className="field-error">{invalid}</span>}
    {error && <div className="message error" role="alert">{error}</div>}
    <div className={styles.actions}>
      {state === "unknown" && intent
        ? <>
          <button className="primary-button" type="button" onClick={() => send(intent)}>{t("community.retryComment")}</button>
          <button className="secondary-button" type="button" onClick={() => { setIntent(null); setState("idle"); onSaved(); }}>{t("community.stopTracking")}</button>
        </>
        : <button className="primary-button" type="submit" disabled={state !== "idle" || Boolean(invalid)}>{state === "sending" && <LoaderCircle size={17} className="spin" aria-hidden />}{t(parent ? "community.postReply" : "community.postComment")}</button>}
      {onCancel && state === "idle" && <button className="secondary-button" type="button" onClick={onCancel}>{t("community.cancel")}</button>}
    </div>
  </form>;
}
