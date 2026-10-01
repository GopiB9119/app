"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { homeFeed, latestPosts, savedPosts } from "./client";
import type { PublicPost, ReportTarget } from "./client";
import { CommunityFrame, Failure, Loading, PostCard, ReportDialog, sessionLost, useViewer } from "./shared";
import styles from "./community.module.css";

type Tab = "following" | "latest" | "saved";
const labels: Record<Tab, string> = { following: "Following", latest: "Latest", saved: "Saved" };

export function HomeScreen() {
  const viewer = useViewer();
  if (viewer.pending) return <Loading label="Loading your home feed" />;
  if (viewer.error) return <CommunityFrame account={null} current="home"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <Home key={viewer.account?.id ?? "signed-out"} viewer={viewer.account} />;
}

function Home({ viewer }: { viewer: ReturnType<typeof useViewer>["account"] }) {
  const [tab, setTab] = useState<Tab>(viewer ? "following" : "latest");
  const [updates, setUpdates] = useState<Record<string, PublicPost>>({});
  const [report, setReport] = useState<ReportTarget | null>(null);
  const posts = useInfiniteQuery({
    queryKey: ["community", tab, viewer?.id ?? null],
    queryFn: ({ pageParam, signal }) => tab === "following" ? homeFeed(viewer!.id, pageParam, signal)
      : tab === "saved" ? savedPosts(viewer!.id, pageParam, signal) : latestPosts(viewer?.id, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next,
    networkMode: "always",
  });
  useEffect(() => { if (sessionLost(posts.error)) window.location.replace("/login"); }, [posts.error]);
  const items = posts.data?.pages.flatMap(page => page.items) ?? [];
  const empty = tab === "following" ? <>Posts from pages you follow appear here, newest first. <Link href="/app/discover">Find pages to follow</Link>.</>
    : tab === "saved" ? "Posts you save appear here. Only you can see your saved posts." : "No public posts yet.";
  return <CommunityFrame account={viewer} current="home">
    <div className={styles.heading}>
      <h1>Home</h1>
      <button className="icon-button" aria-label="Refresh posts" title="Refresh posts" disabled={posts.isFetching} onClick={() => posts.refetch()}>
        <RefreshCw size={18} className={posts.isFetching ? "spin" : ""} aria-hidden />
      </button>
    </div>
    {viewer && <div className={styles.tabs} role="group" aria-label="Home feed">
      {(Object.keys(labels) as Tab[]).map(key => <button key={key} className="secondary-button" aria-pressed={tab === key} onClick={() => { setTab(key); setUpdates({}); }}>{labels[key]}</button>)}
    </div>}
    {!viewer && <p className={styles.notice}><Link href="/login">Sign in</Link> to follow pages, like, save and comment. Public posts are shown below.</p>}
    <p className={styles.meta}>Public posts only. Your private Spaces, chats, tasks and reminders never appear in these feeds or shape their order.</p>
    {posts.isPending && <p role="status" aria-busy="true">Loading posts...</p>}
    {posts.isError && !sessionLost(posts.error) && <Failure error={posts.error} retry={() => posts.refetch()} />}
    {!posts.isPending && !posts.isError && items.length === 0 && <p className={styles.empty}>{empty}</p>}
    <div className={styles.stack}>
      {!posts.isError && items.map(post => <PostCard key={post.id} post={updates[post.id] ?? post} account={viewer}
        onChange={next => setUpdates(current => ({ ...current, [next.id]: next }))} onReport={setReport} />)}
    </div>
    {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>Load more posts</button>}
    {report && viewer && <ReportDialog account={viewer} target={report} onClose={() => setReport(null)} />}
  </CommunityFrame>;
}
