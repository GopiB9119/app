"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, UserMinus } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { ApiError } from "@/features/identity/client";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { HANDLE_PATTERN, createPage, emptyClassification, followPage, followingPages, isUnknown, myPages, termLabel } from "./client";
import type { Classification, CreateIntent, Topic } from "./client";
import { PageRoles } from "./page-roles";
import { HelpReviewQueue, MyHelpPosts } from "./help-posts";
import { MyPageEvents } from "./page-events";
import { CommunityFrame, Failure, Loading, problemText, sessionLost, useTextProblem, useViewer } from "./shared";
import { ClassificationEditor, TaxonomyStatus, TopicSelect, unavailableTerms, useTaxonomy } from "./taxonomy-controls";
import styles from "./community.module.css";

type PageIntent = CreateIntent<{ handle: string; name: string; description: string; topic: Topic; classification?: Classification }>;

export function MyPagesScreen() {
  const t = useText();
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) return <Loading label={t("community.loadingYourPages")} />;
  if (!viewer.account) return <CommunityFrame account={null} current="pages"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <MyPages key={viewer.account.id} account={viewer.account} />;
}

function MyPages({ account }: { account: Account }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  const queryClient = useQueryClient();
  const owned = useQuery({ queryKey: ["my-pages", account.id], queryFn: ({ signal }) => myPages(account.id, signal), networkMode: "always" });
  const following = useInfiniteQuery({
    queryKey: ["following", account.id], queryFn: ({ pageParam, signal }) => followingPages(account.id, pageParam, signal),
    initialPageParam: null as string | null, getNextPageParam: last => last.next, networkMode: "always",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (sessionLost(owned.error ?? following.error)) window.location.replace("/login"); }, [owned.error, following.error]);
  async function unfollow(pageId: string) {
    setBusy(pageId);
    setError("");
    try { await followPage(account.id, pageId, false); await queryClient.invalidateQueries({ queryKey: ["following", account.id] }); }
    catch (problem) { setError(problemText(problem, t("community.unfollowFailed"), t)); }
    finally { setBusy(null); }
  }
  const followed = following.data?.pages.flatMap(page => page.items) ?? [];
  return <CommunityFrame account={account} current="pages">
    <div className={styles.heading}><h1>{t("community.yourPages")}</h1></div>
    <p className={styles.meta}>{t("community.publicPageWarning")}</p>
    <section className={styles.stack} aria-labelledby="owned-heading">
      <h2 id="owned-heading">{t("community.ownedPages")}</h2>
      {owned.isPending && <p role="status">{t("community.loading")}</p>}
      {owned.isError && !sessionLost(owned.error) && <Failure error={owned.error} retry={() => owned.refetch()} />}
      {owned.data?.length === 0 && <p className={styles.empty}>{t("community.noOwnedPages")}</p>}
      <ul className={styles.list}>
        {owned.data?.map(page => <li key={page.id} className={styles.row}>
          <span><Link href={`/pages/${page.handle}`}>{page.name}</Link> <span className={styles.meta}>{t("community.ownedSummary", { handle: page.handle, topic: termLabel(vocabulary.data ?? [], "topic", page.topic, language), count: page.follower_count })}</span>
            {page.status !== "active" && <>{" "}<span className={styles.badge}>{t(`community.manage.status.${page.status}`)}</span></>}
            {page.moderation && <span className={styles.meta}>{" "}{t("community.hiddenByModerators", { reason: t(`community.reason.${page.moderation.reason}`) })}</span>}
          </span>
        </li>)}
      </ul>
      {owned.data && owned.data.length < 5 && <CreatePageForm account={account} onCreated={() => queryClient.invalidateQueries({ queryKey: ["my-pages", account.id] })} />}
      {owned.data?.length === 5 && <p className={styles.meta}>{t("community.ownedLimit")}</p>}
    </section>
    <PageRoles account={account} />
    <HelpReviewQueue account={account} />
    <MyPageEvents account={account} />
    <MyHelpPosts account={account} />
    <section className={styles.stack} aria-labelledby="following-heading">
      <h2 id="following-heading">{t("community.followingPages")}</h2>
      {error && <div className="message error" role="alert">{error}</div>}
      {following.isPending && <p role="status">{t("community.loadingFollowingPages")}</p>}
      {following.isError && !sessionLost(following.error) && <Failure error={following.error} retry={() => following.refetch()} />}
      {following.isSuccess && followed.length === 0 && <p className={styles.empty}>{t("community.noFollowingPagesBefore")}<Link href="/app/discover">{t("community.discoverPages")}</Link>{t("community.sentenceEnd")}</p>}
      <ul className={styles.list}>
        {followed.map(page => <li key={page.id} className={styles.row}>
          <span><Link href={`/pages/${page.handle}`}>{page.name}</Link> <span className={styles.meta}>@{page.handle}</span></span>
          <button className="secondary-button" disabled={busy !== null} onClick={() => unfollow(page.id)} aria-label={t("community.unfollowPage", { name: page.name })}><UserMinus size={17} aria-hidden />{t("community.unfollow")}</button>
        </li>)}
      </ul>
      {following.hasNextPage && <button className="secondary-button" disabled={following.isFetchingNextPage} onClick={() => following.fetchNextPage()}>{t("community.more")}</button>}
    </section>
  </CommunityFrame>;
}

function CreatePageForm({ account, onCreated }: { account: Account; onCreated: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  const textProblem = useTextProblem();
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState<Topic>("");
  const [classification, setClassification] = useState(emptyClassification);
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<PageIntent | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "unknown">("idle");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  useEffect(() => {
    if (!topic && vocabulary.data) setTopic(vocabulary.data.find(term => term.dimension === "topic" && term.status === "active")?.code ?? "");
  }, [topic, vocabulary.data]);
  const cleanHandle = handle.trim().toLowerCase();
  const handleProblem = cleanHandle && !HANDLE_PATTERN.test(cleanHandle) ? t("community.handleInvalid") : null;
  const invalid = !cleanHandle || handleProblem || textProblem(name, 80) || textProblem(description, 500, false)
    || vocabulary.isError || !vocabulary.data?.some(term => term.dimension === "topic" && term.code === topic && term.status === "active");
  async function send(next: PageIntent) {
    setIntent(next);
    setState("sending");
    setError("");
    try {
      const page = await createPage(next);
      setIntent(null); setState("idle"); setHandle(""); setName(""); setDescription(""); setClassification(emptyClassification()); setCreated(page.handle);
      onCreated();
    } catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      if (isUnknown(problem)) { setState("unknown"); setError(problemText(problem, t("community.createPageUnknown"), t)); return; }
      setIntent(null); setState("idle"); setError(unavailableTerms(problem, vocabulary.data ?? [], language, t) ?? problemText(problem, t("community.createPageFailed"), t));
      if (problem instanceof ApiError && problem.code === "TERM_UNAVAILABLE") void vocabulary.refresh().catch(() => undefined);
    }
  }
  const locked = state !== "idle";
  return <form className={`${styles.form} ${styles.vocabularyForm}`} aria-label={t("community.createPublicPage")} onSubmit={event => {
    event.preventDefault();
    if (invalid || locked) return;
    setCreated(null);
    void send({ accountId: account.id, key: crypto.randomUUID(), body: { handle: cleanHandle, name: name.trim(), description: description.trim(), topic,
      ...(Object.values(classification).some(codes => codes.length) ? { classification } : {}),
    } });
  }}>
    <h2>{t("community.createPublicPage")}</h2>
    <label>{t("community.handle")}<input value={handle} maxLength={30} onChange={event => setHandle(event.target.value)} disabled={locked} aria-describedby="handle-help" aria-invalid={handleProblem ? true : undefined} /></label>
    <span id="handle-help" className={handleProblem ? "field-error" : styles.meta}>{handleProblem ?? t("community.handleHelp")}</span>
    <label>{t("community.pageName")}<input value={name} maxLength={160} onChange={event => setName(event.target.value)} disabled={locked} /></label>
    <TaxonomyStatus vocabulary={vocabulary} />
    <TopicSelect terms={vocabulary.data ?? []} value={topic} disabled={locked || !vocabulary.data || vocabulary.isError} onChange={code => {
      setTopic(code); setClassification(current => ({ ...current, other_topics: current.other_topics.filter(topic => topic !== code) }));
    }} />
    <label>{t("community.descriptionOptional")}<textarea value={description} maxLength={1000} onChange={event => setDescription(event.target.value)} disabled={locked} /></label>
    <ClassificationEditor terms={vocabulary.data ?? []} value={classification} topic={topic} onChange={setClassification} disabled={locked || !vocabulary.data || vocabulary.isError} />
    {error && <div className="message error" role="alert">{error}</div>}
    {created && <p className={styles.notice} role="status">{t("community.pageCreatedBefore")}<Link href={`/pages/${created}`}>{t("community.openHandle", { handle: created })}</Link>{t("community.firstPostAfter")}</p>}
    <div className={styles.actions}>
      {state === "unknown" && intent
        ? <>
          <button className="primary-button" type="button" onClick={() => send(intent)}>{t("community.retryCreatePage")}</button>
          <button className="secondary-button" type="button" onClick={() => { setIntent(null); setState("idle"); onCreated(); }}>{t("community.stopTracking")}</button>
        </>
        : <button className="primary-button" type="submit" disabled={locked || Boolean(invalid)}>{state === "sending" ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Plus size={17} aria-hidden />}{t("community.createPage")}</button>}
    </div>
  </form>;
}
