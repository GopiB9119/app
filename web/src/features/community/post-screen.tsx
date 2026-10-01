"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Flag, LoaderCircle, MessageCircle, Reply, Trash2 } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { ApiError } from "@/features/identity/client";
import { block, createComment, endComment, isUnknown, postComments, readPost, reasonLabels, textProblem } from "./client";
import type { CreateIntent, PostComment, PublicPost, ReportTarget } from "./client";
import { CommunityFrame, Failure, Loading, PostCard, ReportDialog, problemText, sessionLost, time, useViewer } from "./shared";
import styles from "./community.module.css";

type CommentIntent = CreateIntent<{ body: string; parent_id?: string }> & { postId: string };

export function PostScreen({ postId }: { postId: string }) {
  const viewer = useViewer();
  if (viewer.pending) return <Loading label="Loading post" />;
  if (viewer.error) return <CommunityFrame account={null} current={null}><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <PostView key={viewer.account?.id ?? "signed-out"} viewer={viewer.account} postId={postId} />;
}

function PostView({ viewer, postId }: { viewer: Account | null; postId: string }) {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [override, setOverride] = useState<PublicPost | null>(null);
  const post = useQuery({ queryKey: ["public-post", postId, viewer?.id ?? null], queryFn: ({ signal }) => readPost(postId, viewer?.id, signal), networkMode: "always" });
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
  if (post.isPending) return <CommunityFrame account={viewer} current={null}><p role="status" aria-busy="true">Loading post...</p></CommunityFrame>;
  if (!post.data) {
    const missing = post.error instanceof ApiError && post.error.status === 404;
    return <CommunityFrame account={viewer} current={null}>
      {missing ? <><h1>Post not found</h1><p className={styles.empty}>This post was deleted, is not public, or is hidden because you blocked its page.</p></> : <Failure error={post.error} retry={() => post.refetch()} />}
    </CommunityFrame>;
  }
  const current = override ?? post.data;
  const all = comments.data?.pages.flatMap(page => page.items) ?? [];
  const topLevel = all.filter(item => item.parent_id === null);
  const replies = (id: string) => all.filter(item => item.parent_id === id);
  return <CommunityFrame account={viewer} current={null}>
    <div className={styles.heading}><h1>Post from {current.page_name}</h1></div>
    <PostCard post={current} account={viewer} onChange={setOverride} onReport={setReport} linkTitle={false}>
      {current.moderation && <p className={styles.meta}>Hidden by moderators: {reasonLabels[current.moderation.reason]}. Only you can see it.</p>}
      {current.can_manage && <p className={styles.meta}>You own this page. <Link href={`/pages/${current.page_handle}`}>Edit or delete this post on the page</Link>.</p>}
    </PostCard>
    {current.status === "published" && <section className={styles.stack} aria-labelledby="comments-heading">
      <h2 id="comments-heading"><MessageCircle size={20} aria-hidden /> Comments</h2>
      {viewer ? <CommentForm account={viewer} postId={current.id} onSaved={refresh} /> : <p className={styles.notice}><Link href="/login">Sign in</Link> to comment.</p>}
      {comments.isPending && <p role="status" aria-busy="true">Loading comments...</p>}
      {comments.isError && !sessionLost(comments.error) && <Failure error={comments.error} retry={() => comments.refetch()} />}
      {!comments.isPending && !comments.isError && all.length === 0 && <p className={styles.empty}>No comments yet.</p>}
      <ul className={styles.comments} aria-label="Comments">
        {topLevel.map(item => <li key={item.id}>
          <CommentItem comment={item} account={viewer} postId={current.id} onChanged={refresh} onReport={setReport} />
          {replies(item.id).length > 0 && <ul className={styles.comments} aria-label={`Replies to ${item.author_name}`}>
            {replies(item.id).map(reply => <li key={reply.id} className={styles.reply}>
              <CommentItem comment={reply} account={viewer} postId={current.id} onChanged={refresh} onReport={setReport} />
            </li>)}
          </ul>}
        </li>)}
      </ul>
      {comments.hasNextPage && !comments.isError && <button className="secondary-button" disabled={comments.isFetchingNextPage} onClick={() => comments.fetchNextPage()}>Load more comments</button>}
    </section>}
    {report && viewer && <ReportDialog account={viewer} target={report} onClose={() => setReport(null)} />}
  </CommunityFrame>;
}

function CommentItem({ comment, account, postId, onChanged, onReport }: {
  comment: PostComment; account: Account | null; postId: string; onChanged: () => void; onReport: (target: ReportTarget) => void;
}) {
  const [mode, setMode] = useState<"idle" | "reply" | "remove" | "block">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await action(); setMode("idle"); onChanged(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, "The change failed."));
    } finally { setBusy(false); }
  }
  const visible = comment.status === "visible";
  return <article className={styles.comment} aria-label={`Comment by ${comment.author_name}`}>
    <div className={styles.cardHeader}>
      <strong>{comment.mine ? "You" : comment.author_name}</strong>
      <time dateTime={comment.created_at}>{time.format(new Date(comment.created_at))}</time>
    </div>
    {visible ? <p className={styles.body}>{comment.body}</p>
      : <p className={styles.removed}>{comment.status === "removed" ? "Removed by the page owner" : "Comment deleted"}</p>}
    {comment.moderation && <p className={styles.meta}>Hidden by moderators: {reasonLabels[comment.moderation.reason]}. Only you can see it.</p>}
    {account && visible && mode === "idle" && <div className={styles.actions}>
      {comment.parent_id === null && <button className="text-button" onClick={() => setMode("reply")}><Reply size={16} aria-hidden />Reply</button>}
      {comment.can_remove && <button className="text-button" onClick={() => setMode("remove")}><Trash2 size={16} aria-hidden />{comment.mine ? "Delete" : "Remove"}</button>}
      {!comment.mine && <button className="text-button" onClick={() => setMode("block")}><Ban size={16} aria-hidden />Block author</button>}
      {!comment.mine && <button className="text-button" onClick={() => onReport({ type: "comment", id: comment.id, label: `Comment by ${comment.author_name}` })}><Flag size={16} aria-hidden />Report</button>}
    </div>}
    {mode === "reply" && account && <CommentForm account={account} postId={postId} parent={comment} onSaved={() => { setMode("idle"); onChanged(); }} onCancel={() => setMode("idle")} />}
    {mode === "remove" && account && <div className={styles.notice} role="group" aria-label="Confirm comment removal">
      <p>{comment.mine ? "Delete your comment? Everyone will see that it was deleted." : "Remove this comment from your page? Everyone will see that the page owner removed it."}</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => run(() => endComment(account.id, comment.id))}>{comment.mine ? "Delete comment" : "Remove comment"}</button>
        <button className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>Keep</button>
      </div>
    </div>}
    {mode === "block" && account && <div className={styles.notice} role="group" aria-label="Confirm block">
      <p>Block {comment.author_name}? Their comments are hidden from you, and they cannot comment on pages you own. They are not told.</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => run(() => block(account.id, "comment_author", comment.id))}>Block person</button>
        <button className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>Cancel</button>
      </div>
    </div>}
    {error && <div className="message error" role="alert">{error}</div>}
  </article>;
}

function CommentForm({ account, postId, parent, onSaved, onCancel }: { account: Account; postId: string; parent?: PostComment; onSaved: () => void; onCancel?: () => void }) {
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
      if (isUnknown(problem)) { setState("unknown"); setError(problemText(problem, "The comment was not confirmed.")); return; }
      setIntent(null); setState("idle"); setError(problemText(problem, "The comment was not posted."));
    }
  }
  const label = parent ? `Reply to ${parent.author_name}` : "Write a comment";
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
          <button className="primary-button" type="button" onClick={() => send(intent)}>Retry comment</button>
          <button className="secondary-button" type="button" onClick={() => { setIntent(null); setState("idle"); onSaved(); }}>Stop tracking</button>
        </>
        : <button className="primary-button" type="submit" disabled={state !== "idle" || Boolean(invalid)}>{state === "sending" && <LoaderCircle size={17} className="spin" aria-hidden />}{parent ? "Post reply" : "Post comment"}</button>}
      {onCancel && state === "idle" && <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}
