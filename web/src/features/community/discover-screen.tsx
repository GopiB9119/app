"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Plus, Search, UserCheck, UserPlus } from "lucide-react";

import { TOPICS, discoverPages, followPage, searchPosts, topicLabels } from "./client";
import type { PublicPage, PublicPost, ReportTarget, Topic } from "./client";
import { CommunityFrame, Failure, Loading, PostCard, ReportDialog, problemText, sessionLost, useViewer } from "./shared";
import styles from "./community.module.css";

type Kind = "pages" | "posts";

export function DiscoverScreen() {
  const viewer = useViewer();
  if (viewer.pending) return <Loading label="Loading Discover" />;
  if (viewer.error) return <CommunityFrame account={null} current="discover"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <Discover key={viewer.account?.id ?? "signed-out"} viewer={viewer.account} />;
}

function Discover({ viewer }: { viewer: ReturnType<typeof useViewer>["account"] }) {
  const [kind, setKind] = useState<Kind>("pages");
  const [draft, setDraft] = useState({ q: "", topic: "" as Topic | "" });
  const [search, setSearch] = useState(draft);
  const [updates, setUpdates] = useState<Record<string, PublicPage>>({});
  const [postUpdates, setPostUpdates] = useState<Record<string, PublicPost>>({});
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pages = useInfiniteQuery({
    queryKey: ["discover", search.q, search.topic, viewer?.id ?? null],
    queryFn: ({ pageParam, signal }) => discoverPages(viewer?.id, search.q, search.topic, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next,
    enabled: kind === "pages",
    networkMode: "always",
  });
  const posts = useInfiniteQuery({
    queryKey: ["discover-posts", search.q, viewer?.id ?? null],
    queryFn: ({ pageParam, signal }) => searchPosts(viewer?.id, search.q, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next,
    enabled: kind === "posts",
    networkMode: "always",
  });
  useEffect(() => { if (sessionLost(pages.error) || sessionLost(posts.error)) window.location.replace("/login"); }, [pages.error, posts.error]);
  async function follow(page: PublicPage) {
    if (!viewer || busy) return;
    setBusy(page.id);
    setError("");
    try { const next = await followPage(viewer.id, page.id, !page.following); setUpdates(current => ({ ...current, [next.id]: next })); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, "The follow change failed."));
    } finally { setBusy(null); }
  }
  const items = pages.data?.pages.flatMap(page => page.items) ?? [];
  const postItems = posts.data?.pages.flatMap(page => page.items) ?? [];
  return <CommunityFrame account={viewer} current="discover">
    <div className={styles.heading}>
      <h1>Discover</h1>
      {viewer && <Link className="secondary-button" href="/app/pages"><Plus size={17} aria-hidden />Create a page</Link>}
    </div>
    <div className={styles.tabs} role="group" aria-label="Search for">
      {(["pages", "posts"] as Kind[]).map(key => <button key={key} type="button" className="secondary-button" aria-pressed={kind === key} onClick={() => setKind(key)}>
        {key === "pages" ? "Pages" : "Posts"}
      </button>)}
    </div>
    <p className={styles.meta}>{kind === "pages"
      ? "Search public pages by name, handle or description. Results rank by followers; private Spaces and chats are never searched."
      : "Search published public posts by title or text, newest first. Drafts, private Spaces and chats are never searched."}</p>
    <form className={kind === "pages" ? styles.search : `${styles.search} ${styles.searchText}`} role="search"
      onSubmit={event => { event.preventDefault(); setUpdates({}); setPostUpdates({}); setSearch({ q: draft.q.trim(), topic: draft.topic }); }}>
      <label>{kind === "pages" ? "Search pages" : "Search posts"}<input type="search" value={draft.q} maxLength={80} onChange={event => setDraft({ ...draft, q: event.target.value })} /></label>
      {kind === "pages" && <label>Topic<select aria-label="Topic" value={draft.topic} onChange={event => setDraft({ ...draft, topic: event.target.value as Topic | "" })}>
        <option value="">All topics</option>
        {TOPICS.map(topic => <option key={topic} value={topic}>{topicLabels[topic]}</option>)}
      </select></label>}
      <button className="primary-button" type="submit"><Search size={17} aria-hidden />Search</button>
    </form>
    {kind === "posts" && <>
      {posts.isPending && <p role="status" aria-busy="true">Searching...</p>}
      {posts.isError && !sessionLost(posts.error) && <Failure error={posts.error} retry={() => posts.refetch()} />}
      {!posts.isPending && !posts.isError && postItems.length === 0 && <p className={styles.empty}>{search.q ? "No posts match. Try another word." : "No public posts yet."}</p>}
      <section className={styles.stack} aria-label="Posts">
        {!posts.isError && postItems.map(post => <PostCard key={post.id} post={postUpdates[post.id] ?? post} account={viewer}
          onChange={next => setPostUpdates(current => ({ ...current, [next.id]: next }))} onReport={setReport} />)}
      </section>
      {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>Load more posts</button>}
      {report && viewer && <ReportDialog account={viewer} target={report} onClose={() => setReport(null)} />}
    </>}
    {kind === "pages" && <>
      {error && <div className="message error" role="alert">{error}</div>}
      {pages.isPending && <p role="status" aria-busy="true">Searching...</p>}
      {pages.isError && !sessionLost(pages.error) && <Failure error={pages.error} retry={() => pages.refetch()} />}
      {!pages.isPending && !pages.isError && items.length === 0 && <p className={styles.empty}>No pages match. Try another word or topic.</p>}
      <ul className={styles.list} aria-label="Pages">
        {!pages.isError && items.map(item => {
          const page = updates[item.id] ?? item;
          return <li key={page.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <Link href={`/pages/${page.handle}`}>{page.name}</Link><span>@{page.handle}</span>
              <span className={styles.badge}>{topicLabels[page.topic]}</span>
              <span>{page.follower_count === 1 ? "1 follower" : `${page.follower_count} followers`}</span>
            </div>
            {page.description && <p className={styles.body}>{page.description}</p>}
            {viewer && !page.can_manage && <div className={styles.actions}>
              <button className={page.following ? "secondary-button" : "primary-button"} aria-pressed={page.following} disabled={busy !== null} onClick={() => follow(page)} aria-label={`${page.following ? "Unfollow" : "Follow"} ${page.name}`}>
                {page.following ? <UserCheck size={17} aria-hidden /> : <UserPlus size={17} aria-hidden />}{page.following ? "Following" : "Follow"}
              </button>
            </div>}
          </li>;
        })}
      </ul>
      {pages.hasNextPage && !pages.isError && <button className="secondary-button" disabled={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()}>Load more pages</button>}
    </>}
  </CommunityFrame>;
}
