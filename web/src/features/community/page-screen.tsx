"use client";

import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronDown, ChevronUp, Flag, LoaderCircle, Pencil, Pin, PinOff, RefreshCw, Send, Trash2, UserCheck, UserPlus } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { ApiError } from "@/features/identity/client";
import { useLanguage, useText } from "@/features/i18n/i18n";
import {
  POST_TERM_LIMITS, block, createPost, deletePost, drafts, followPage, isUnknown, myBlocks, myModeratorRoles, pageInsights, pagePosts, pinPost, pinnedPosts, publishPost, readPage, termLabel,
  unblock, updatePage, updatePost,
} from "./client";
import type { Classification, CreateIntent, PageChanges, PublicPage, PublicPost, ReportTarget, Topic } from "./client";
import { ModeratorPin, PageManagement, PageStateNotice } from "./page-management";
import { CommunityFrame, Failure, Loading, PostCard, ReportDialog, problemText, sessionLost, useCommunityTime, useTextProblem, useViewer } from "./shared";
import { ClassificationChips, ClassificationEditor, TaxonomyStatus, TermMultiPicker, TopicSelect, unavailableTerms, useTaxonomy } from "./taxonomy-controls";
import styles from "./community.module.css";

export function PublicPageScreen({ reference }: { reference: string }) {
  const t = useText();
  const viewer = useViewer();
  if (viewer.pending) return <Loading label={t("community.loadingPage")} />;
  if (viewer.error) return <CommunityFrame account={null} current={null}><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <PageView key={viewer.account?.id ?? "signed-out"} viewer={viewer.account} reference={reference} />;
}

function PageView({ viewer, reference }: { viewer: Account | null; reference: string }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [updates, setUpdates] = useState<Record<string, PublicPost>>({});
  const page = useQuery({ queryKey: ["public-page", reference, viewer?.id ?? null], queryFn: ({ signal }) => readPage(reference, viewer?.id, signal), networkMode: "always" });
  const current = page.data;
  // A deleted page shows its owner only how to restore it, so its posts are not asked for.
  const listed = Boolean(current && !current.blocked && current.status !== "deleted");
  const posts = useInfiniteQuery({
    queryKey: ["page-posts", current?.id, viewer?.id ?? null],
    queryFn: ({ pageParam, signal }) => pagePosts(current!.id, viewer?.id, pageParam, signal),
    initialPageParam: null as string | null, getNextPageParam: last => last.next,
    enabled: listed, networkMode: "always",
  });
  const pinned = useQuery({
    queryKey: ["pinned-posts", current?.id, viewer?.id ?? null],
    queryFn: ({ signal }) => pinnedPosts(current!, viewer?.id, signal),
    enabled: listed, networkMode: "always",
  });
  const draftList = useQuery({
    queryKey: ["page-drafts", current?.id, viewer?.id ?? null],
    queryFn: ({ signal }) => drafts(viewer!.id, current!.id, signal),
    enabled: Boolean(viewer && current?.can_manage && current.status !== "deleted"), networkMode: "always",
  });
  const blocks = useQuery({
    queryKey: ["blocks", viewer?.id ?? null], queryFn: ({ signal }) => myBlocks(viewer!.id, signal),
    enabled: Boolean(viewer && current?.blocked), networkMode: "always",
  });
  // Someone else may moderate this page, which lets them pin its posts. A failed list only hides those controls.
  const roles = useQuery({
    queryKey: ["moderator-roles", viewer?.id ?? null], queryFn: ({ signal }) => myModeratorRoles(viewer!.id, signal),
    enabled: Boolean(viewer && current && !current.can_manage && !current.blocked), networkMode: "always",
  });
  const moderating = Boolean(current && roles.data?.some(role => role.page_id === current.id && role.status === "active"));
  const problem = page.error ?? posts.error ?? pinned.error ?? draftList.error ?? blocks.error;
  useEffect(() => { if (sessionLost(problem ?? roles.error)) window.location.reload(); }, [problem, roles.error]);
  function refresh() {
    setUpdates({});
    void queryClient.invalidateQueries({ queryKey: ["public-page", reference] });
    void queryClient.invalidateQueries({ queryKey: ["page-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["pinned-posts"] });
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
      setError(problemText(failure, t("community.changeFailed"), t));
      refresh();
    } finally { setBusy(false); setConfirmBlock(false); }
  }

  if (page.isPending) return <CommunityFrame account={viewer} current={null}><p role="status" aria-busy="true">{t("community.loadingPageStatus")}</p></CommunityFrame>;
  if (!current) {
    const missing = page.error instanceof ApiError && page.error.status === 404;
    return <CommunityFrame account={viewer} current={null}>
      {missing ? <><h1>{t("community.pageNotFound")}</h1><p className={styles.empty}>{t("community.pageMissing")}</p></> : <Failure error={page.error} retry={() => page.refetch()} />}
    </CommunityFrame>;
  }
  const blockId = blocks.data?.find(item => item.page_id === current.id)?.id;
  const items = posts.data?.pages.flatMap(item => item.items) ?? [];
  // Pinned posts also come in the date-ordered list; they show only once, at the top, while the pinned list loads.
  const pinnedIds = new Set(pinned.data?.map(item => item.id) ?? []);
  const shown = items.filter(item => !pinnedIds.has(item.id));
  // Only an active page takes new posts, edits, pins, likes or follows; an archived one can still be unfollowed.
  const active = current.status === "active";
  const pagePaused = current.limited || Boolean(current.moderation?.hidden);
  const canPublish = active && !pagePaused;
  const deleted = current.status === "deleted";
  return <CommunityFrame account={viewer} current={current.can_manage ? "pages" : null}>
    <header className={styles.pageHeader}>
      <h1>{current.name}</h1>
      <span className={styles.handle}>@{current.handle}</span>
      <div className={styles.actions}>
        <span className={styles.badge}>{termLabel(vocabulary.data ?? [], "topic", current.topic, language)}</span>
        <span className={styles.meta}>{current.follower_count === 1 ? t("community.followers.one") : t("community.followers.other", { count: current.follower_count })}</span>
        {current.can_manage && <span className={styles.badge}>{t("community.youOwnPage")}</span>}
        {moderating && <span className={styles.badge}>{t("community.roles.youModerate")}</span>}
        {current.status !== "active" && <span className={styles.badge}>{t(`community.manage.status.${current.status}`)}</span>}
      </div>
      {current.description && <p className={styles.description}>{current.description}</p>}
      <ClassificationChips terms={vocabulary.data ?? []} value={current.classification} />
      {current.moderation && <p className={styles.meta}>{t("community.hiddenByModerators", { reason: t(`community.reason.${current.moderation.reason}`) })}</p>}
      {current.can_manage && current.limited && current.limit && <p className={styles.meta}>{t("community.limitedByModerators", { reason: t(`community.reason.${current.limit.reason}`) })}</p>}
      {viewer && !current.can_manage && <div className={styles.actions}>
        {!current.blocked && (active || current.following) && <button className={current.following ? "secondary-button" : "primary-button"} aria-pressed={current.following} disabled={busy}
          onClick={() => run(() => followPage(viewer.id, current.id, !current.following))}>
          {current.following ? <UserCheck size={17} aria-hidden /> : <UserPlus size={17} aria-hidden />}{t(current.following ? "community.following" : "community.follow")}
        </button>}
        {current.blocked
          ? <button className="secondary-button" disabled={busy || !blockId} onClick={() => blockId && run(() => unblock(viewer.id, blockId))}>{t("community.unblockPage")}</button>
          : <button className="text-button" disabled={busy} onClick={() => setConfirmBlock(true)}><Ban size={17} aria-hidden />{t("community.blockPage")}</button>}
        <button className="text-button" onClick={() => setReport({ type: "page", id: current.id, label: current.name })}><Flag size={17} aria-hidden />{t("community.reportPage")}</button>
      </div>}
      {confirmBlock && viewer && <div className={styles.notice} role="group" aria-label={t("community.confirmBlock")}>
        <p>{t("community.blockPageQuestion", { name: current.name })}</p>
        <div className={styles.actions}>
          <button className="primary-button" disabled={busy} onClick={() => run(() => block(viewer.id, "page", current.id))}>{t("community.block")}</button>
          <button className="secondary-button" disabled={busy} onClick={() => setConfirmBlock(false)}>{t("community.cancel")}</button>
        </div>
      </div>}
      {!viewer && <p className={styles.meta}>{t("community.signInForPage")}</p>}
      {current.can_manage && active && !editing && <div className={styles.actions}><button className="secondary-button" onClick={() => setEditing(true)}><Pencil size={17} aria-hidden />{t("community.editPage")}</button></div>}
    </header>
    <PageStateNotice page={current} />
    {current.limited && <p className={styles.notice} role="status">{t("community.pageLimited")}</p>}
    {current.rules && !deleted && <section className={styles.stack} aria-labelledby="rules-heading">
      <h2 id="rules-heading">{t("community.rules")}</h2>
      <p className={styles.body}>{current.rules}</p>
    </section>}
    {error && <div className="message error" role="alert">{error}</div>}
    {current.can_manage && viewer && active && editing && <PageEditor account={viewer} page={current} onDone={() => { setEditing(false); refresh(); }} />}
    {current.can_manage && viewer && active && <Composer account={viewer} page={current} onCreated={refresh} />}
    {current.can_manage && viewer && !deleted && <section className={styles.stack} aria-labelledby="drafts-heading">
      <h2 id="drafts-heading">{t("community.drafts")}</h2>
      {draftList.isPending && <p role="status">{t("community.loadingDrafts")}</p>}
      {draftList.isError && !sessionLost(draftList.error) && <Failure error={draftList.error} retry={() => draftList.refetch()} />}
      {draftList.data?.length === 0 && <p className={styles.empty}>{t("community.noDrafts")}</p>}
      {draftList.data?.map(post => <PostCard key={post.id} post={post} account={viewer} onChange={refresh}>
        {post.moderation && <p className={styles.meta}>{t("community.hiddenByModerators", { reason: t(`community.reason.${post.moderation.reason}`) })}</p>}
        {active && <PostManager account={viewer} post={post} canPublish={canPublish} onChanged={refresh} />}
      </PostCard>)}
    </section>}
    {current.can_manage && viewer && !deleted && <PageInsightsSection key={`insights-${current.id}`} account={viewer} pageId={current.id} />}
    {current.can_manage && viewer && <PageManagement key={current.id} account={viewer} page={current} onChanged={updated => {
      if (updated) queryClient.setQueryData(["public-page", reference, viewer.id], updated);
      refresh();
    }} />}
    {listed && pinned.isError && !sessionLost(pinned.error) && <Failure error={pinned.error} retry={() => pinned.refetch()} />}
    {listed && pinned.data && pinned.data.length > 0 && <section className={styles.stack} aria-labelledby="pinned-heading">
      <h2 id="pinned-heading">{t("community.pinned")}</h2>
      {pinned.data.map(item => {
        const post = updates[item.id] ?? item;
        return <PostCard key={post.id} post={post} account={viewer} pinnedMark commentsPaused={pagePaused} onChange={next => setUpdates(value => ({ ...value, [next.id]: next }))} onReport={setReport}>
          {post.moderation && <p className={styles.meta}>{t("community.hiddenByModerators", { reason: t(`community.reason.${post.moderation.reason}`) })}</p>}
          {post.can_manage && viewer && active && <PostManager account={viewer} post={post} canPublish={canPublish} onChanged={refresh} />}
          {!post.can_manage && viewer && active && moderating && <ModeratorPin account={viewer} post={post} onChanged={refresh} />}
        </PostCard>;
      })}
    </section>}
    {!deleted && <section className={styles.stack} aria-labelledby="posts-heading">
      <h2 id="posts-heading">{t("community.posts")}</h2>
      {current.blocked && <p className={styles.notice}>{t("community.pageBlocked")}</p>}
      {posts.isPending && !current.blocked && <p role="status" aria-busy="true">{t("community.loadingPosts")}</p>}
      {posts.isError && !sessionLost(posts.error) && <Failure error={posts.error} retry={() => posts.refetch()} />}
      {!current.blocked && !posts.isPending && !posts.isError && shown.length === 0 && !posts.hasNextPage && <p className={styles.empty}>{t(items.length === 0 ? "community.noPublishedPosts" : "community.noOtherPosts")}</p>}
      {shown.map(item => {
        const post = updates[item.id] ?? item;
        return <PostCard key={post.id} post={post} account={viewer} commentsPaused={pagePaused} onChange={next => setUpdates(value => ({ ...value, [next.id]: next }))} onReport={setReport}>
          {post.moderation && <p className={styles.meta}>{t("community.hiddenByModerators", { reason: t(`community.reason.${post.moderation.reason}`) })}</p>}
          {post.can_manage && viewer && active && <PostManager account={viewer} post={post} canPublish={canPublish} onChanged={refresh} />}
          {!post.can_manage && viewer && active && moderating && <ModeratorPin account={viewer} post={post} onChanged={refresh} />}
        </PostCard>;
      })}
      {posts.hasNextPage && !posts.isError && <button className="secondary-button" disabled={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>{t("community.morePosts")}</button>}
    </section>}
    {report && viewer && <ReportDialog account={viewer} target={report} onClose={() => setReport(null)} />}
  </CommunityFrame>;
}

function PageInsightsSection({ account, pageId }: { account: Account; pageId: string }) {
  const text = useText();
  const time = useCommunityTime();
  const numbers = new Intl.NumberFormat(time.resolvedOptions().locale);
  const heading = useId();
  const [open, setOpen] = useState(false);
  const insights = useQuery({
    queryKey: ["page-insights", pageId, account.id],
    queryFn: ({ signal }) => pageInsights(account.id, pageId, signal),
    enabled: open, networkMode: "always", retry: false, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  useEffect(() => { if (sessionLost(insights.error)) window.location.reload(); }, [insights.error]);
  const totals = insights.isError ? undefined : insights.data;
  const failure = insights.error instanceof ApiError && insights.error.status === 0 ? insights.error
    : new Error(text(insights.error instanceof ApiError && [403, 404].includes(insights.error.status)
      ? "community.insights.unavailable" : "community.insights.failed"));
  return <section className={`${styles.stack} ${styles.insights}`} aria-labelledby={heading}>
    <div className={styles.actions}>
      <h2 id={heading}>{text("community.insights.title")}</h2>
      <button type="button" className="secondary-button" aria-expanded={open} aria-controls={`${heading}-content`} onClick={() => setOpen(value => !value)}>
        {open ? <ChevronUp size={17} aria-hidden /> : <ChevronDown size={17} aria-hidden />}
        {text(open ? "community.insights.hide" : "community.insights.show")}
      </button>
    </div>
    <div id={`${heading}-content`} className={styles.stack} hidden={!open}>
      {open && <>
        {insights.isFetching && <p role="status" aria-busy="true">{text("community.insights.loading")}</p>}
        {insights.isError && !sessionLost(insights.error) && <Failure error={failure} retry={() => { void insights.refetch(); }} />}
        {totals && <>
          <div className={styles.actions}>
            <p>{text("community.insights.followers", { count: numbers.format(totals.follower_count) })}</p>
            <button type="button" className="text-button" disabled={insights.isFetching} onClick={() => { void insights.refetch(); }}>
              <RefreshCw size={17} aria-hidden />{text("community.insights.refresh")}
            </button>
          </div>
          <p className={styles.meta}>{text("community.insights.asOf", { time: time.format(new Date(totals.as_of)) })}</p>
          <div className={styles.insightsScroll} role="region" aria-labelledby={`${heading}-caption`} tabIndex={0}>
            {/* Explicit roles keep it a table for screen readers when narrow screens show each period as a block. */}
            <table role="table" className={styles.insightsTable} aria-describedby={`${heading}-note`}>
              <caption id={`${heading}-caption`}>{text("community.insights.caption")}</caption>
              <thead role="rowgroup"><tr role="row">
                <th role="columnheader" scope="col">{text("community.insights.period")}</th>
                <th role="columnheader" scope="col">{text("community.insights.newFollowers")}</th>
                <th role="columnheader" scope="col">{text("community.posts")}</th>
                <th role="columnheader" scope="col">{text("community.comments")}</th>
                <th role="columnheader" scope="col">{text("community.insights.likes")}</th>
              </tr></thead>
              <tbody role="rowgroup">{totals.periods.map(period => <tr role="row" key={period.start}>
                <th role="rowheader" scope="row">{time.formatRange(new Date(period.start), new Date(period.end))}</th>
                <td role="cell" data-label={text("community.insights.newFollowers")}>{numbers.format(period.new_followers)}</td>
                <td role="cell" data-label={text("community.posts")}>{numbers.format(period.posts)}</td>
                <td role="cell" data-label={text("community.comments")}>{numbers.format(period.comments)}</td>
                <td role="cell" data-label={text("community.insights.likes")}>{numbers.format(period.likes)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
        <p id={`${heading}-note`} className={styles.meta}>{text("community.insights.note")}</p>
      </>}
    </div>
  </section>;
}

function PageEditor({ account, page: shown, onDone }: { account: Account; page: PublicPage; onDone: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  const textProblem = useTextProblem();
  // Saved against the version the editor opened with, so a newer version is refused instead of overwritten.
  const [page] = useState(shown);
  const [name, setName] = useState(page.name);
  const [description, setDescription] = useState(page.description);
  const [rules, setRules] = useState(page.rules);
  const [topic, setTopic] = useState<Topic>(page.topic);
  const [classification, setClassification] = useState(page.classification);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invalid = textProblem(name, 80) ?? textProblem(description, 500, false) ?? textProblem(rules, 2000, false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || busy) return;
    const changes: PageChanges = {};
    if (name.trim() !== page.name) changes.name = name.trim();
    if (description.trim() !== page.description) changes.description = description.trim();
    if (rules.replace(/\r\n/g, "\n").trim() !== page.rules) changes.rules = rules.replace(/\r\n/g, "\n").trim();
    if (topic !== page.topic) changes.topic = topic;
    const changedClassification: Partial<Classification> = {};
    for (const field of Object.keys(classification) as (keyof Classification)[]) {
      if (JSON.stringify(classification[field]) !== JSON.stringify(page.classification[field])) changedClassification[field] = classification[field];
    }
    if (Object.keys(changedClassification).length) changes.classification = changedClassification;
    if (Object.keys(changes).length === 0) { onDone(); return; }
    setBusy(true);
    setError("");
    try { await updatePage(account.id, page, changes); onDone(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(unavailableTerms(problem, vocabulary.data ?? [], language, t)
        ?? (problem instanceof ApiError && problem.status === 412 ? t("community.pageEditConflict")
          : isUnknown(problem) ? t("community.pageEditUnknown") : problemText(problem, t("community.pageSaveFailed"), t)));
      if (problem instanceof ApiError && problem.code === "TERM_UNAVAILABLE") void vocabulary.refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }
  return <form className={`${styles.form} ${styles.vocabularyForm}`} onSubmit={save} aria-label={t("community.editPage")}>
    <h2>{t("community.editPage")}</h2>
    <label>{t("community.name")}<input value={name} maxLength={160} onChange={event => setName(event.target.value)} disabled={busy} /></label>
    <TaxonomyStatus vocabulary={vocabulary} />
    <TopicSelect terms={vocabulary.data ?? []} value={topic} disabled={busy || !vocabulary.data || vocabulary.isError} onChange={code => {
      setTopic(code); setClassification(current => ({ ...current, other_topics: current.other_topics.filter(topic => topic !== code) }));
    }} />
    <label>{t("community.description")}<textarea value={description} maxLength={1000} onChange={event => setDescription(event.target.value)} disabled={busy} /></label>
    <label>{t("community.rulesOptional")}<textarea value={rules} maxLength={4000} aria-describedby="page-rules-hint" onChange={event => setRules(event.target.value)} disabled={busy} /></label>
    <p id="page-rules-hint" className={styles.meta}>{t("community.rulesHint")}</p>
    <ClassificationEditor terms={vocabulary.data ?? []} value={classification} topic={topic} onChange={setClassification} disabled={busy || !vocabulary.data || vocabulary.isError} />
    {invalid && <span className="field-error">{invalid}</span>}
    {error && <div className="message error" role="alert">{error}</div>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={busy || Boolean(invalid)}>{busy && <LoaderCircle size={17} className="spin" aria-hidden />}{t("community.savePage")}</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={onDone}>{t("community.closeEditor")}</button>
    </div>
  </form>;
}

type PostTerms = Pick<PublicPost, "topics" | "interests">;
type DraftIntent = CreateIntent<{ title: string | null; body: string } & PostTerms> & { pageId: string };

function PostTermsEditor({ vocabulary, value, onChange, disabled }: {
  vocabulary: ReturnType<typeof useTaxonomy>; value: PostTerms; onChange: (value: PostTerms) => void; disabled: boolean;
}) {
  const t = useText();
  const locked = disabled || !vocabulary.data || vocabulary.isError;
  return <details className={styles.taxonomyDetails}>
    <summary>{t("community.postTerms")}</summary>
    <div className={styles.stack}>
      <TaxonomyStatus vocabulary={vocabulary} />
      <TermMultiPicker terms={vocabulary.data ?? []} dimension="topic" label={t("community.taxonomy.topics")} selected={value.topics}
        maximum={POST_TERM_LIMITS.topics} disabled={locked} onChange={topics => onChange({ ...value, topics })} />
      <TermMultiPicker terms={vocabulary.data ?? []} dimension="interest" label={t("community.taxonomy.interests")} selected={value.interests}
        maximum={POST_TERM_LIMITS.interests} disabled={locked} onChange={interests => onChange({ ...value, interests })} />
    </div>
  </details>;
}

function Composer({ account, page, onCreated }: { account: Account; page: PublicPage; onCreated: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  const textProblem = useTextProblem();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [terms, setTerms] = useState<PostTerms>({ topics: [], interests: [] });
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
      setTerms({ topics: [], interests: [] });
      onCreated();
    } catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      if (isUnknown(problem)) { setState("unknown"); setError(problemText(problem, t("community.draftUnknown"), t)); return; }
      setIntent(null); setState("idle");
      setError(unavailableTerms(problem, vocabulary.data ?? [], language, t) ?? problemText(problem, t("community.draftSaveFailed"), t));
      if (problem instanceof ApiError && problem.code === "TERM_UNAVAILABLE") void vocabulary.refresh().catch(() => undefined);
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || state !== "idle") return;
    void send({ accountId: account.id, pageId: page.id, key: crypto.randomUUID(), body: { title: title.trim() || null, body: body.trim(), ...terms } });
  }
  const locked = state !== "idle";
  return <form className={`${styles.form} ${styles.vocabularyForm}`} onSubmit={submit} aria-label={t("community.newPost")}>
    <h2>{t("community.newPost")}</h2>
    <p className={styles.meta}>{t("community.privateDraftHint")}</p>
    {(page.limited || page.moderation?.hidden) && <p className={styles.meta}>{t(page.moderation?.hidden ? "community.suspendedDraftHint" : "community.limitedDraftHint")}</p>}
    <label>{t("community.titleOptional")}<input value={title} maxLength={240} onChange={event => setTitle(event.target.value)} disabled={locked} /></label>
    <label>{t("community.text")}<textarea value={body} maxLength={10000} onChange={event => setBody(event.target.value)} disabled={locked} /></label>
    <PostTermsEditor vocabulary={vocabulary} value={terms} onChange={setTerms} disabled={locked} />
    {body && invalid && <span className="field-error">{invalid}</span>}
    {error && <div className="message error" role="alert">{error}</div>}
    <div className={styles.actions}>
      {state === "unknown" && intent
        ? <>
          <button className="primary-button" type="button" onClick={() => send(intent)}>{t("community.retryDraft")}</button>
          <button className="secondary-button" type="button" onClick={() => { if (window.confirm(t("community.stopDraftQuestion"))) { setIntent(null); setState("idle"); onCreated(); } }}>{t("community.stopTracking")}</button>
        </>
        : <button className="primary-button" type="submit" disabled={locked || Boolean(invalid)}>{state === "sending" ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Pencil size={17} aria-hidden />}{t("community.saveDraft")}</button>}
    </div>
  </form>;
}

function PostManager({ account, post, canPublish, onChanged }: { account: Account; post: PublicPost; canPublish: boolean; onChanged: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  const textProblem = useTextProblem();
  const [mode, setMode] = useState<"idle" | "edit" | "publish" | "delete">("idle");
  // The editor starts from the post shown when Edit is chosen and saves against that version only.
  const [base, setBase] = useState(post);
  const [title, setTitle] = useState(post.title ?? "");
  const [body, setBody] = useState(post.body);
  const [terms, setTerms] = useState<PostTerms>({ topics: post.topics, interests: post.interests });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invalid = textProblem(body, 5000) ?? textProblem(title, 120, false);
  const publishable = canPublish && !post.page_limited;
  useEffect(() => { if (!publishable && mode === "publish") setMode("idle"); }, [publishable, mode]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await action(); setMode("idle"); onChanged(); }
    catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      setError(unavailableTerms(problem, vocabulary.data ?? [], language, t)
        ?? (problem instanceof ApiError && problem.status === 412 ? t("community.postEditConflict")
          : isUnknown(problem) ? t("community.postEditUnknown") : problemText(problem, t("community.changeFailed"), t)));
      if (problem instanceof ApiError && problem.status === 409 && (problem.code === "PAGE_LIMITED" || problem.code === "PAGE_SUSPENDED")) {
        setMode("idle");
        onChanged();
      }
      if (problem instanceof ApiError && problem.code === "TERM_UNAVAILABLE") void vocabulary.refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }
  const label = post.title ?? t("community.thisPost");
  function edit() {
    setBase(post);
    setTitle(post.title ?? "");
    setBody(post.body);
    setTerms({ topics: post.topics, interests: post.interests });
    setMode("edit");
  }
  return <div className={styles.stack}>
    {mode === "idle" && <div className={styles.actions}>
      <button className="text-button" onClick={edit}><Pencil size={16} aria-hidden />{t("community.edit")}</button>
      {post.status === "draft" && publishable && <button className="text-button" onClick={() => setMode("publish")}><Send size={16} aria-hidden />{t("community.publish")}</button>}
      {post.status === "published" && <button className="text-button" disabled={busy} onClick={() => void run(() => pinPost(account.id, post.id, !post.pinned))}>
        {post.pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}{t(post.pinned ? "community.unpin" : "community.pin")}
      </button>}
      <button className="text-button" onClick={() => setMode("delete")}><Trash2 size={16} aria-hidden />{t("community.delete")}</button>
    </div>}
    {mode === "edit" && <form className={`${styles.form} ${styles.vocabularyForm}`} aria-label={t("community.editPostLabel", { name: label })} onSubmit={event => {
      event.preventDefault();
      if (invalid || busy) return;
      const changes: { title?: string | null; body?: string } & Partial<PostTerms> = {};
      if ((title.trim() || null) !== base.title) changes.title = title.trim() || null;
      if (body.trim() !== base.body) changes.body = body.trim();
      for (const field of ["topics", "interests"] as const) {
        if (JSON.stringify(terms[field]) !== JSON.stringify(base[field])) changes[field] = terms[field];
      }
      if (Object.keys(changes).length === 0) { setMode("idle"); return; }
      void run(() => updatePost(account.id, base, changes));
    }}>
      <label>{t("community.titleOptional")}<input value={title} maxLength={240} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
      <label>{t("community.text")}<textarea value={body} maxLength={10000} onChange={event => setBody(event.target.value)} disabled={busy} /></label>
      <PostTermsEditor vocabulary={vocabulary} value={terms} onChange={setTerms} disabled={busy} />
      {invalid && <span className="field-error">{invalid}</span>}
      {post.status === "published" && <p className={styles.meta}>{t("community.editPublishedHint")}</p>}
      <div className={styles.actions}>
        <button className="primary-button" type="submit" disabled={busy || Boolean(invalid)}>{t("community.saveChanges")}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => setMode("idle")}>{t("community.cancel")}</button>
      </div>
    </form>}
    {mode === "publish" && publishable && <div className={styles.notice} role="group" aria-label={t("community.confirmPublication")}>
      <p>{t("community.publishQuestion", { name: label })}</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => run(() => publishPost(account.id, post))}>{t("community.publishNow")}</button>
        <button className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>{t("community.keepDraft")}</button>
      </div>
    </div>}
    {mode === "delete" && <div className={styles.notice} role="group" aria-label={t("community.confirmDeletion")}>
      <p>{t("community.deletePostQuestion", { name: label })}</p>
      <div className={styles.actions}>
        <button className="primary-button" disabled={busy} onClick={() => run(() => deletePost(account.id, post))}>{t("community.deletePost")}</button>
        <button className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>{t("community.keepPost")}</button>
      </div>
    </div>}
    {error && <div className="message error" role="alert">{error}</div>}
  </div>;
}
