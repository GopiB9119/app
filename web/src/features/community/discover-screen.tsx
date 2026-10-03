"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Plus, Search, UserCheck, UserPlus, VolumeX } from "lucide-react";

import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { discoverPages, followPage, interestPosts, readInterests, searchPosts, suggestedPages, termLabel, termName } from "./client";
import type { DiscoverFilters, PublicPage, PublicPost, ReportTarget, SuggestedPage, TaxonomyTerm } from "./client";
import { CommunityFrame, Failure, Loading, PostCard, ReportDialog, problemText, sessionLost, useViewer } from "./shared";
import { FeedControlFeedback, FeedMenu, PostFeedMenu, useFeedControlActions } from "./feed-controls";
import type { FeedControlActions } from "./feed-controls";
import { TaxonomyStatus, TopicSelect, useTaxonomy } from "./taxonomy-controls";
import styles from "./community.module.css";

type Kind = "pages" | "posts";

export function DiscoverScreen() {
  const t = useText();
  const viewer = useViewer();
  if (viewer.pending) return <Loading label={t("community.loadingDiscover")} />;
  if (viewer.error) return <CommunityFrame account={null} current="discover"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <Discover key={viewer.account?.id ?? "signed-out"} viewer={viewer.account} />;
}

function Discover({ viewer }: { viewer: ReturnType<typeof useViewer>["account"] }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const vocabulary = useTaxonomy();
  const controls = useFeedControlActions(viewer?.id);
  const terms = vocabulary.data ?? [];
  const [kind, setKind] = useState<Kind>("pages");
  const [draft, setDraft] = useState<{ q: string; filters: DiscoverFilters }>({ q: "", filters: {} });
  const [search, setSearch] = useState(draft);
  const [updates, setUpdates] = useState<Record<string, PublicPage>>({});
  const [postUpdates, setPostUpdates] = useState<Record<string, PublicPost>>({});
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pages = useInfiniteQuery({
    queryKey: ["discover", search.q, search.filters, viewer?.id ?? null],
    queryFn: ({ pageParam, signal }) => discoverPages(viewer?.id, search.q, search.filters, pageParam, signal),
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
  const suggestions = useQuery({
    queryKey: ["suggested-pages", viewer?.id ?? null],
    queryFn: ({ signal }) => suggestedPages(viewer!.id, 6, signal),
    enabled: Boolean(viewer) && kind === "pages", networkMode: "always", retry: false,
  });
  useEffect(() => {
    if (sessionLost(pages.error) || sessionLost(posts.error) || sessionLost(suggestions.error)) {
      queryClient.clear(); window.location.replace("/login");
    }
  }, [pages.error, posts.error, suggestions.error, queryClient]);
  async function follow(page: PublicPage) {
    if (!viewer || busy) return;
    setBusy(page.id);
    setError("");
    try {
      const next = await followPage(viewer.id, page.id, !page.following);
      setUpdates(current => ({ ...current, [next.id]: next }));
      void queryClient.invalidateQueries({ queryKey: ["suggested-pages", viewer.id] });
      void queryClient.invalidateQueries({ queryKey: ["following", viewer.id] });
    }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(problemText(problem, t("community.followFailed"), t));
    } finally { setBusy(null); }
  }
  const items = pages.data?.pages.flatMap(page => page.items) ?? [];
  const postItems = posts.data?.pages.flatMap(page => page.items) ?? [];
  return <CommunityFrame account={viewer} current="discover">
    <div className={styles.heading}>
      <h1>{t("community.discover")}</h1>
      {viewer && <Link className="secondary-button" href="/app/pages"><Plus size={17} aria-hidden />{t("community.createAPage")}</Link>}
    </div>
    <div className={styles.tabs} role="group" aria-label={t("community.searchFor")}>
      {(["pages", "posts"] as Kind[]).map(key => <button key={key} type="button" className="secondary-button" aria-pressed={kind === key} onClick={() => setKind(key)}>
        {t(key === "pages" ? "community.pages" : "community.posts")}
      </button>)}
    </div>
    <p className={styles.meta}>{t(kind === "pages" ? "community.searchPagesHint" : "community.searchPostsHint")}</p>
    {kind === "pages" && <TaxonomyStatus vocabulary={vocabulary} />}
    <form className={kind === "pages" ? styles.search : `${styles.search} ${styles.searchText}`} role="search"
      onSubmit={event => { event.preventDefault(); setUpdates({}); setPostUpdates({}); setSearch({ q: draft.q.trim(), filters: { ...draft.filters } }); }}>
      <label>{t(kind === "pages" ? "community.searchPages" : "community.searchPosts")}<input type="search" value={draft.q} maxLength={80} onChange={event => setDraft({ ...draft, q: event.target.value })} /></label>
      {kind === "pages" && <TopicSelect terms={terms} value={draft.filters.topic ?? ""} all disabled={!vocabulary.data || vocabulary.isError}
        onChange={topic => setDraft({ ...draft, filters: { ...draft.filters, topic } })} />}
      <button className="primary-button" type="submit"><Search size={17} aria-hidden />{t("community.search")}</button>
      {kind === "pages" && <details className={`${styles.taxonomyDetails} ${styles.extraFilters}`}>
        <summary>{t("community.taxonomy.moreFilters")}</summary>
        <div>{(["interest", "language", "place", "community_type", "audience", "activity", "content_kind"] as const).map(dimension => <label key={dimension}>
          {t(`community.taxonomy.filter.${dimension}`)}
          <select aria-label={t(`community.taxonomy.filter.${dimension}`)} value={draft.filters[dimension] ?? ""} disabled={!vocabulary.data || vocabulary.isError}
            onChange={event => setDraft({ ...draft, filters: { ...draft.filters, [dimension]: event.target.value } })}>
            <option value="">{t("community.taxonomy.any")}</option>
            {terms.filter(term => term.dimension === dimension && term.status === "active").map(term => <option key={term.code} value={term.code}>{termName(term, language)}</option>)}
          </select>
        </label>)}</div>
      </details>}
    </form>
    <FeedControlFeedback controls={controls} />
    {kind === "posts" && <>
      {posts.isPending && <p role="status" aria-busy="true">{t("community.searching")}</p>}
      {posts.isError && !sessionLost(posts.error) && <Failure error={posts.error} retry={() => posts.refetch()} />}
      {!posts.isPending && !posts.isError && postItems.length === 0 && <p className={styles.empty}>{t(search.q ? "community.noMatchingPosts" : "community.noPublicPosts")}</p>}
      <section className={styles.stack} aria-label={t("community.posts")}>
        {!posts.isError && postItems.map(post => <PostCard key={post.id} post={postUpdates[post.id] ?? post} account={viewer}
          menu={!search.q && <PostFeedMenu post={postUpdates[post.id] ?? post} controls={controls} why={t("community.feedControls.whyLatest")} />}
          onChange={next => setPostUpdates(current => ({ ...current, [next.id]: next }))} onReport={setReport} />)}
      </section>
      {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>{t("community.morePosts")}</button>}
      {report && viewer && <ReportDialog account={viewer} target={report} onClose={() => setReport(null)} />}
    </>}
    {kind === "pages" && <>
      {error && <div className="message error" role="alert">{error}</div>}
      {viewer && <section className={styles.stack} aria-labelledby="suggested-pages-heading">
        <div className={styles.heading}><h2 id="suggested-pages-heading">{t("community.interests.suggested")}</h2>
          <Link className="text-button" href="/app/settings/interests">{t("community.interests.choose")}</Link>
        </div>
        {suggestions.isPending && <p role="status" aria-busy="true">{t("community.interests.suggestionsLoading")}</p>}
        {suggestions.isError && !sessionLost(suggestions.error) && <Failure error={suggestions.error} retry={() => suggestions.refetch()} />}
        {suggestions.isSuccess && suggestions.data.items.length === 0 && <p className={styles.empty}>{t("community.interests.noSuggestions")}</p>}
        {!suggestions.isError && <ul className={styles.list} aria-label={t("community.interests.suggested")}>
          {suggestions.data?.items.map(item => <PageResult key={item.page.id} page={updates[item.page.id] ?? item.page} terms={terms} viewer={viewer}
            reasons={item.reasons} busy={busy !== null || controls.busy} follow={follow} controls={controls} />)}
        </ul>}
      </section>}
      {viewer && <InterestPostsSection account={viewer} terms={terms} controls={controls} />}
      {pages.isPending && <p role="status" aria-busy="true">{t("community.searching")}</p>}
      {pages.isError && !sessionLost(pages.error) && <Failure error={pages.error} retry={() => pages.refetch()} />}
      {!pages.isPending && !pages.isError && items.length === 0 && <p className={styles.empty}>{t("community.noMatchingPages")}</p>}
      <ul className={styles.list} aria-label={t("community.pages")}>
        {!pages.isError && items.map(item => <PageResult key={item.id} page={updates[item.id] ?? item} terms={terms} viewer={viewer} busy={busy !== null} follow={follow} />)}
      </ul>
      {pages.hasNextPage && !pages.isError && <button className="secondary-button" disabled={pages.isFetchingNextPage} onClick={() => pages.fetchNextPage()}>{t("community.morePages")}</button>}
    </>}
  </CommunityFrame>;
}

function InterestPostsSection({ account, terms, controls }: { account: Account; terms: TaxonomyTerm[]; controls: FeedControlActions }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [updates, setUpdates] = useState<Record<string, PublicPost>>({});
  const [report, setReport] = useState<ReportTarget | null>(null);
  const interests = useQuery({
    queryKey: ["interests", account.id], queryFn: ({ signal }) => readInterests(account.id, signal), networkMode: "always", retry: false,
  });
  const hasChoices = Boolean(interests.data && (interests.data.topics.length || interests.data.interests.length));
  const posts = useInfiniteQuery({
    queryKey: ["interest-posts", account.id, interests.data?.etag ?? null],
    queryFn: ({ pageParam, signal }) => interestPosts(account.id, pageParam, signal),
    initialPageParam: null as string | null, getNextPageParam: last => last.next,
    enabled: hasChoices && !interests.isError, networkMode: "always", retry: false,
  });
  const denied = sessionLost(interests.error) || sessionLost(posts.error);
  const restarting = posts.error instanceof ApiError && posts.error.code === "CURSOR_INVALID" && Boolean(posts.data);
  useEffect(() => {
    if (denied) { queryClient.clear(); window.location.replace("/login"); }
  }, [denied, queryClient]);
  useEffect(() => {
    if (!restarting) return;
    setUpdates({});
    void queryClient.resetQueries({ queryKey: ["interest-posts", account.id] });
    void queryClient.invalidateQueries({ queryKey: ["interests", account.id], exact: true });
  }, [restarting, account.id, queryClient]);
  const items = [...new Map(posts.data?.pages.flatMap(page => page.items).map(item => [item.post.id, item]) ?? []).values()];
  if (denied) return null;
  return <section className={styles.stack} aria-labelledby="interest-posts-heading">
    <h2 id="interest-posts-heading">{t("community.interestPosts.title")}</h2>
    {(interests.isPending || restarting || (hasChoices && posts.isPending)) && <p role="status" aria-busy="true">{t("community.loadingPosts")}</p>}
    {interests.isError && <Failure error={interests.error} retry={() => interests.refetch()} />}
    {interests.isSuccess && !hasChoices && <p className={styles.empty}>
      {t("community.interestPosts.noChoices")} <Link href="/app/settings/interests">{t("community.interests.choose")}</Link>
    </p>}
    {hasChoices && !interests.isError && !restarting && <>
      {posts.isError && <Failure error={posts.error} retry={() => posts.isFetchNextPageError ? posts.fetchNextPage() : posts.refetch()} />}
      {posts.isSuccess && items.length === 0 && <p className={styles.empty}>{t("community.interestPosts.empty")}</p>}
      {!posts.isError && items.map(item => <PostCard key={item.post.id} post={updates[item.post.id] ?? item.post} account={account}
        menu={<PostFeedMenu post={updates[item.post.id] ?? item.post} controls={controls} why={t("community.interestPosts.because", {
          names: item.reasons.map(reason => termLabel(terms, reason.dimension, reason.code, language)).join(", "),
        })} />}
        onChange={next => setUpdates(current => ({ ...current, [next.id]: next }))} onReport={setReport}>
        <p className={styles.matchReasons}>{t("community.interestPosts.because", {
          names: item.reasons.map(reason => termLabel(terms, reason.dimension, reason.code, language)).join(", "),
        })}</p>
      </PostCard>)}
      {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetching} onClick={() => posts.fetchNextPage()}>
        <Plus size={17} aria-hidden />{t("community.interestPosts.more")}
      </button>}
    </>}
    {report && <ReportDialog account={account} target={report} onClose={() => setReport(null)} />}
  </section>;
}

function PageResult({ page, terms, viewer, busy, follow, reasons, controls }: {
  page: PublicPage; terms: TaxonomyTerm[]; viewer: ReturnType<typeof useViewer>["account"]; busy: boolean;
  follow: (page: PublicPage) => void; reasons?: SuggestedPage["reasons"]; controls?: FeedControlActions;
}) {
  const t = useText();
  const { language } = useLanguage();
  const explanation = reasons && <ul className={styles.matchReasons}>{reasons.map(reason => <li key={`${reason.dimension}:${reason.code}`}>
    {t("community.taxonomy.match", {
      kind: t(reason.dimension === "topic" ? "community.topic" : `community.taxonomy.filter.${reason.dimension}`),
      name: termLabel(terms, reason.dimension, reason.code, language),
    })}
  </li>)}</ul>;
  return <li className={styles.card}>
    <div className={styles.cardHeader}>
      <Link href={`/pages/${page.handle}`}>{page.name}</Link><span>@{page.handle}</span>
      <span className={styles.badge}>{termLabel(terms, "topic", page.topic, language)}</span>
      <span>{page.follower_count === 1 ? t("community.followers.one") : t("community.followers.other", { count: page.follower_count })}</span>
      {controls && reasons && <FeedMenu busy={busy} why={explanation} actions={page.can_manage ? [] : [
        { id: "hide_suggestion", label: t("community.feedControls.notInterested"), icon: <EyeOff size={17} aria-hidden />,
          run: () => { void controls.add({ kind: "hide_suggestion", page_id: page.id }); } },
        { id: "mute_page", label: t("community.feedControls.mute"), icon: <VolumeX size={17} aria-hidden />,
          run: () => { void controls.add({ kind: "mute_page", page_id: page.id }); } },
      ]} />}
    </div>
    {page.description && <p className={styles.body}>{page.description}</p>}
    {explanation}
    {viewer && !page.can_manage && <div className={styles.actions}>
      <button className={page.following ? "secondary-button" : "primary-button"} aria-pressed={page.following} disabled={busy} onClick={() => follow(page)} aria-label={t(page.following ? "community.unfollowPage" : "community.followPage", { name: page.name })}>
        {page.following ? <UserCheck size={17} aria-hidden /> : <UserPlus size={17} aria-hidden />}{t(page.following ? "community.following" : "community.follow")}
      </button>
    </div>}
  </li>;
}
