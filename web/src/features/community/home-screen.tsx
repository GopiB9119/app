"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { useText } from "@/features/i18n/i18n";
import type { MessageId } from "@/features/i18n/messages";
import { homeFeed, latestPosts, savedPosts } from "./client";
import type { PublicPost, ReportTarget } from "./client";
import { CommunityFrame, Failure, Loading, PostCard, ReportDialog, sessionLost, useViewer } from "./shared";
import styles from "./community.module.css";

type Tab = "following" | "latest" | "saved";
const labels: Record<Tab, MessageId> = { following: "community.following", latest: "community.latest", saved: "community.savedTab" };

export function HomeScreen() {
  const t = useText();
  const viewer = useViewer();
  if (viewer.pending) return <Loading label={t("community.loadingFeed")} />;
  if (viewer.error) return <CommunityFrame account={null} current="home"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <Home key={viewer.account?.id ?? "signed-out"} viewer={viewer.account} />;
}

function Home({ viewer }: { viewer: ReturnType<typeof useViewer>["account"] }) {
  const t = useText();
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
  const empty = tab === "following" ? <>{t("community.followingEmptyBefore")}<Link href="/app/discover">{t("community.findPagesToFollow")}</Link>{t("community.sentenceEnd")}</>
    : t(tab === "saved" ? "community.savedEmpty" : "community.noPublicPosts");
  return <CommunityFrame account={viewer} current="home">
    <div className={styles.heading}>
      <h1>{t("community.feed")}</h1>
      <button className="icon-button" aria-label={t("community.refreshPosts")} title={t("community.refreshPosts")} disabled={posts.isFetching} onClick={() => posts.refetch()}>
        <RefreshCw size={18} className={posts.isFetching ? "spin" : ""} aria-hidden />
      </button>
    </div>
    {viewer && <div className={styles.tabs} role="group" aria-label={t("community.feed")}>
      {(Object.keys(labels) as Tab[]).map(key => <button key={key} className="secondary-button" aria-pressed={tab === key} onClick={() => { setTab(key); setUpdates({}); }}>{t(labels[key])}</button>)}
    </div>}
    {!viewer && <p className={styles.notice}><Link href="/login">{t("community.signIn")}</Link>{t("community.signedOutFeedAfter")}</p>}
    <p className={styles.meta}>{t("community.feedPrivacy")}</p>
    {posts.isPending && <p role="status" aria-busy="true">{t("community.loadingPosts")}</p>}
    {posts.isError && !sessionLost(posts.error) && <Failure error={posts.error} retry={() => posts.refetch()} />}
    {!posts.isPending && !posts.isError && items.length === 0 && <p className={styles.empty}>{empty}</p>}
    <div className={styles.stack}>
      {!posts.isError && items.map(post => <PostCard key={post.id} post={updates[post.id] ?? post} account={viewer}
        onChange={next => setUpdates(current => ({ ...current, [next.id]: next }))} onReport={setReport} />)}
    </div>
    {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>{t("community.morePosts")}</button>}
    {report && viewer && <ReportDialog account={viewer} target={report} onClose={() => setReport(null)} />}
  </CommunityFrame>;
}
