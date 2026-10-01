"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Flag, LoaderCircle, Pencil, Send, Trash2, UserCheck, UserPlus } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { ApiError } from "@/features/identity/client";
import {
  TOPICS, block, createPost, deletePost, drafts, followPage, isUnknown, myBlocks, pagePosts, publishPost, readPage,
  textProblem, topicLabels, unblock, updatePage, updatePost,
} from "./client";
import type { CreateIntent, PublicPage, PublicPost, ReportTarget, Topic } from "./client";
import { CommunityFrame, Failure, Loading, PostCard, ReportDialog, problemText, sessionLost, useViewer } from "./shared";
import styles from "./community.module.css";

export function PublicPageScreen({ reference }: { reference: string }) {
  const viewer = useViewer();
  if (viewer.pending) return <Loading label="Loading page" />;
  if (viewer.error) return <CommunityFrame account={null} current={null}><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <PageView key={viewer.account?.id ?? "signed-out"} viewer={viewer.account} reference={reference} />;
}

function PageView({ viewer, reference }: { viewer: Account | null; reference: string }) {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [updates, setUpdates] = useState<Record<string, PublicPost>>({});
  const page = useQuery({ queryKey: ["public-page", reference, viewer?.id ?? null], queryFn: ({ signal }) => readPage(reference, viewer?.id, signal), networkMode: "always" });
  const current = page.data;
  const posts = useInfiniteQuery({
    queryKey: ["page-posts", current?.id, viewer?.id ?? null],
    queryFn: ({ pageParam, signal }) => pagePosts(current!.id, viewer?.id, pageParam, signal),
    initialPageParam: null as string | null, getNextPageParam: last => last.next,
    enabled: Boolean(current && !current.blocked), networkMode: "always",
  });
  const draftList = useQuery({
    queryKey: ["page-drafts", current?.id, viewer?.id ?? null],
    queryFn: ({ signal }) => drafts(viewer!.id, current!.id, signal),
    enabled: Boolean(viewer && current?.can_manage), networkMode: "always",
  });
  const blocks = useQuery({
    queryKey: ["blocks", viewer?.id ?? null], queryFn: ({ signal }) => myBlocks(viewer!.id, signal),
    enabled: Boolean(viewer && current?.blocked), networkMode: "always",
  });
  const problem = page.error ?? posts.error ?? draftList.error ?? blocks.error;
  useEffect(() => { if (sessionLost(problem)) window.location.reload(); }, [problem]);
  function refresh() {
    setUpdates({});
    void queryClient.invalidateQueries({ queryKey: ["public-page", reference] });
    void queryClient.invalidateQueries({ queryKey: ["page-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["page-drafts"] });
    void queryClient.invalidateQueries({ queryKey: ["blocks"] });
  }
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); refresh(); }
    catch (failure) {
      if (sessionLost(failure)) { window.location.reload(); return; }
      setError(problemText(failure, "The change failed."));
      refresh();
    } finally { setBusy(false); setConfirmBlock(false); }
  }

  if (page.isPending) return <CommunityFrame account={viewer} current={null}><p role="status" aria-busy="true">Loading page...</p></CommunityFrame>;
  if (!current) {
    const missing = page.error instanceof ApiError && page.error.status === 404;
    return <CommunityFrame account={viewer} current={null}>
      {missing ? <><h1>Page not found</h1><p className={styles.empty}>This page does not exist or is no longer public.</p></> : <Failure error={page.error} retry={() => page.refetch()} />}
    </CommunityFrame>;
  }
  const blockId = blocks.data?.find(item => item.page_id === current.id)?.id;
  const items = posts.data?.pages.flatMap(item => item.items) ?? [];
  return <CommunityFrame account={viewer} current={current.can_manage ? "pages" : null}>
    <header className={styles.pageHeader}>
      <h1>{current.name}</h1>
      <span className={styles.handle}>@{current.handle}</span>
      <div className={styles.actions}>
        <span className={styles.badge}>{topicLabels[current.topic]}</span>
        <span className={styles.meta}>{current.follower_count === 1 ? "1 follower" : `${current.follower_count} followers`}</span>
        {current.can_manage && <span className={styles.badge}>You own this page</span>}
      </div>
      {current.description && <p className={styles.description}>{current.description}</p>}
      {viewer && !current.can_manage && <div className={styles.actions}>
        {!current.blocked && <button className={current.following ? "secondary-button" : "primary-button"} aria-pressed={current.following} disabled={busy}
          onClick={() => run(() => followPage(viewer.id, current.id, !current.following))}>
          {current.following ? <UserCheck size={17} aria-hidden /> : <UserPlus size={17} aria-hidden />}{current.following ? "Following" : "Follow"}
        </button>}
        {current.blocked
          ? <button className="secondary-button" disabled={busy || !blockId} onClick={() => blockId && run(() => unblock(viewer.id, blockId))}>Unblock page</button>
          : <button className="text-button" disabled={busy} onClick={() => setConfirmBlock(true)}><Ban size={17} aria-hidden />Block page</button>}
        <button className="text-button" onClick={() => setReport({ type: "page", id: current.id, label: current.name })}><Flag size={17} aria-hidden />Report page</button>
      </div>}
      {confirmBlock && viewer && <div className={styles.notice} role="group" aria-label="Confirm block">
        <p>Block {current.name}? Its posts are hidden from you everywhere and you stop following it. The page is not told.</p>
        <div className={styles.actions}>
          <button className="primary-button" disabled={busy} onClick={() => run(() => block(viewer.id, "page", current.id))}>Block</button>
          <button className="secondary-button" disabled={busy} onClick={() => setConfirmBlock(false)}>Cancel</button>
        </div>
      </div>}
      {!viewer && <p className={styles.meta}>Sign in to follow this page, like, save or comment.</p>}
      {current.can_manage && !editing && <div className={styles.actions}><button className="secondary-button" onClick={() => setEditing(true)}><Pencil size={17} aria-hidden />Edit page</button></div>}
    </header>
    {error && <div className="message error" role="alert">{error}</div>}
    {current.can_manage && viewer && editing && <PageEditor account={viewer} page={current} onDone={() => { setEditing(false); refresh(); }} />}
    {current.can_manage && viewer && <Composer account={viewer} page={current} onCreated={refresh} />}
    {current.can_manage && viewer && <section className={styles.stack} aria-labelledby="drafts-heading">
      <h2 id="drafts-heading">Drafts</h2>
      {draftList.isPending && <p role="status">Loading drafts...</p>}
      {draftList.isError && !sessionLost(draftList.error) && <Failure error={draftList.error} retry={() => draftList.refetch()} />}
      {draftList.data?.length === 0 && <p className={styles.empty}>No drafts. New posts start as private drafts.</p>}
      {draftList.data?.map(post => <PostCard key={post.id} post={post} account={viewer} onChange={refresh}>
        <PostManager account={viewer} post={post} onChanged={refresh} />
      </PostCard>)}
    </section>}
    <section className={styles.stack} aria-labelledby="posts-heading">
      <h2 id="posts-heading">Posts</h2>
      {current.blocked && <p className={styles.notice}>You blocked this page. Its posts are hidden from you.</p>}
      {posts.isPending && !current.blocked && <p role="status" aria-busy="true">Loading posts...</p>}
      {posts.isError && !sessionLost(posts.error) && <Failure error={posts.error} retry={() => posts.refetch()} />}
      {!current.blocked && !posts.isPending && !posts.isError && items.length === 0 && <p className={styles.empty}>No published posts yet.</p>}
      {items.map(item => {
        const post = updates[item.id] ?? item;
        return <PostCard key={post.id} post={post} account={viewer} onChange={next => setUpdates(value => ({ ...value, [next.id]: next }))} onReport={setReport}>
          {post.can_manage && viewer && <PostManager account={viewer} post={post} onChanged={refresh} />}
        </PostCard>;
      })}
      {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>Load more posts</button>}
    </section>
    {report && viewer && <ReportDialog account={viewer} target={report} onClose={() => setReport(null)} />}
  </CommunityFrame>;
}

function PageEditor({ account, page: shown, onDone }: { account: Account; page: PublicPage; onDone: () => void }) {
  // Saved against the version the editor opened with, so a newer version is refused instead of overwritten.
  const [page] = useState(shown);
  const [name, setName] = useState(page.name);
  const [description, setDescription] = useState(page.description);
  const [topic, setTopic] = useState<Topic>(page.topic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invalid = textProblem(name, 80) ?? textProblem(description, 500, false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || busy) return;
    const changes: Partial<Pick<PublicPage, "name" | "description" | "topic">> = {};
    if (name.trim() !== page.name) changes.name = name.trim();
    if (description.trim() !== page.description) changes.description = description.trim();
    if (topic !== page.topic) changes.topic = topic;
    if (Object.keys(changes).length === 0) { onDone(); return; }
    setBusy(true);
    setError("");
    try { await updatePage(account.id, page, changes); onDone(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problem instanceof ApiError && problem.status === 412 ? "This page changed since you opened the editor. Close it and reload before editing again."
        : isUnknown(problem) ? "The change is not confirmed. Close the editor and reload the page to check it." : problemText(problem, "The page was not saved."));
    } finally { setBusy(false); }
  }
  return <form className={styles.form} onSubmit={save} aria-label="Edit page">
    <h2>Edit page</h2>
    <label>Name<input value={name} maxLength={160} onChange={event => setName(event.target.value)} disabled={busy} /></label>
    <label>Topic<select aria-label="Topic" value={topic} onChange={event => setTopic(event.target.value as Topic)} disabled={busy}>
      {TOPICS.map(item => <option key={item} value={item}>{topicLabels[item]}</option>)}
    </select></label>
    <label>Description<textarea value={description} maxLength={1000} onChange={event => setDescription(event.target.value)} disabled={busy} /></label>
    {invalid && <span className="field-error">{invalid}</span>}
    {error && <div className="message error" role="alert">{error}</div>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={busy || Boolean(invalid)}>{busy && <LoaderCircle size={17} className="spin" aria-hidden />}Save page</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={onDone}>Close editor</button>
    </div>
  </form>;
}

type DraftIntent = CreateIntent<{ title: string | null; body: string }> & { pageId: string };

function Composer({ account, page, onCreated }: { account: Account; page: PublicPage; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [intent, setIntent] = useState<DraftIntent | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "unknown">("idle");
  const [error, setError] = useState("");
  const invalid = textProblem(body, 5000) ?? textProblem(title, 120, false);
  async function send(next: DraftIntent) {
    setIntent(next);
    setState("sending");
    setError("");
    try {
      await createPost(next);
      setIntent(null); setTitle(""); setBody(""); setState("idle");
      onCreated();
    } catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      if (isUnknown(problem)) { setState("unknown"); setError(problemText(problem, "The draft was not confirmed.")); return; }
      setIntent(null); setState("idle"); setError(problemText(problem, "The draft was not saved."));
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || state !== "idle") return;
    void send({ accountId: account.id, pageId: page.id, key: crypto.randomUUID(), body: { title: title.trim() || null, body: body.trim() } });
  }
  const locked = state !== "idle";
  return <form className={styles.form} onSubmit={submit} aria-label="New post">
    <h2>New post</h2>
    <p className={styles.meta}>Saved as a private draft. Nothing is public until you publish it.</p>
    <label>Title (optional)<input value={title} maxLength={240} onChange={event => setTitle(event.target.value)} disabled={locked} /></label>
    <label>Text<textarea value={body} maxLength={10000} onChange={event => setBody(event.target.value)} disabled={locked} /></label>
    {body && invalid && <span className="field-error">{invalid}</span>}
    {error && <div className="message error" role="alert">{error}</div>}
    <div className={styles.actions}>
      {state === "unknown" && intent
        ? <>
          <button className="primary-button" type="button" onClick={() => send(intent)}>Retry saving draft</button>
          <button className="secondary-button" type="button" onClick={() => { if (window.confirm("The draft may already be saved. Stop tracking this attempt?")) { setIntent(null); setState("idle"); onCreated(); } }}>Stop tracking</button>
        </>
        : <button className="primary-button" type="submit" disabled={locked || Boolean(invalid)}>{state === "sending" ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Pencil size={17} aria-hidden />}Save draft</button>}
    </div>
  </form>;
}

function PostManager({ account, post, onChanged }: { account: Account; post: PublicPost; onChanged: () => void }) {
  const [mode, setMode] = useState<"idle" | "edit" | "publish" | "delete">("idle");
  // The editor starts from the post shown when Edit is chosen and saves against that version only.
  const [base, setBase] = useState(post);
  const [title, setTitle] = useState(post.title ?? "");
  const [body, setBody] = useState(post.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invalid = textProblem(body, 5000) ?? textProblem(title, 120, false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await action(); setMode("idle"); onChanged(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problem instanceof ApiError && problem.status === 412 ? "This post changed since you opened it. Reload to review the current version."
        : isUnknown(problem) ? "Not confirmed. Reload to check the current post before trying again." : problemText(problem, "The change failed."));
    } finally { setBusy(false); }
  }
  const label = post.title ?? "this post";
  function edit() {
    setBase(post);
    setTitle(post.title ?? "");
    setBody(post.body);
    setMode("edit");
  }
  return <div className={styles.stack}>
    {mode === "idle" && <div className={styles.actions}>
      <button className="text-button" onClick={edit}><Pencil size={16} aria-hidden />Edit</button>
      {post.status === "draft" && <button className="text-button" onClick={() => setMode("publish")}><Send size={16} aria-hidden />Publish</button>}
      <button className="text-button" onClick={() => setMode("delete")}><Trash2 size={16} aria-hidden />Delete</button>
    </div>}
    {mode === "edit" && <form className={styles.form} aria-label={`Edit ${label}`} onSubmit={event => {
      event.preventDefault();
      if (invalid || busy) return;
      const changes: { title?: string | null; body?: string } = {};
      if ((title.trim() || null) !== base.title) changes.title = title.trim() || null;
      if (body.trim() !== base.body) changes.body = body.trim();
      if (Object.keys(changes).length === 0) { setMode("idle"); return; }
      void run(() => updatePost(account.id, base, changes));
    }}>
      <label>Title (optional)<input value={title} maxLength={240} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
      <label>Text<textarea value={body} maxLength={10000} onChange={event => setBody(event.target.value)} disabled={busy} /></label>
      {invalid && <span className="field-error">{invalid}</span>}
      {post.status === "published" && <p className={styles.meta}>Saving changes the public post and marks it as edited.</p>}
      <div className={styles.actions}>
        <button className="primary-button" type="submit" disabled={busy || Boolean(invalid)}>Save changes</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => setMode("idle")}>Cancel</button>
      </div>
    </form>}
    {mode === "publish" && <div className={styles.notice} role="group" aria-label="Confirm publication">
      <p>Publish {label}? Anyone can see it, including people who are not signed in, and followers see it in Home.</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => run(() => publishPost(account.id, post))}>Publish now</button>
        <button className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>Keep as draft</button>
      </div>
    </div>}
    {mode === "delete" && <div className={styles.notice} role="group" aria-label="Confirm deletion">
      <p>Delete {label}? It is removed for everyone, with its comments. Copies people already saw or saved elsewhere cannot be recalled.</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => run(() => deletePost(account.id, post))}>Delete post</button>
        <button className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>Keep post</button>
      </div>
    </div>}
    {error && <div className="message error" role="alert">{error}</div>}
  </div>;
}
