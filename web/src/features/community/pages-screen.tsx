"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, UserMinus } from "lucide-react";

import type { Account } from "@/features/identity/client";
import { HANDLE_PATTERN, TOPICS, createPage, followPage, followingPages, isUnknown, myPages, textProblem, topicLabels } from "./client";
import type { CreateIntent, Topic } from "./client";
import { CommunityFrame, Failure, Loading, problemText, sessionLost, useViewer } from "./shared";
import styles from "./community.module.css";

type PageIntent = CreateIntent<{ handle: string; name: string; description: string; topic: Topic }>;

export function MyPagesScreen() {
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) return <Loading label="Loading your pages" />;
  if (!viewer.account) return <CommunityFrame account={null} current="pages"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <MyPages key={viewer.account.id} account={viewer.account} />;
}

function MyPages({ account }: { account: Account }) {
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
    catch (problem) { setError(problemText(problem, "Unfollow failed.")); }
    finally { setBusy(null); }
  }
  const followed = following.data?.pages.flatMap(page => page.items) ?? [];
  return <CommunityFrame account={account} current="pages">
    <div className={styles.heading}><h1>Your pages</h1></div>
    <p className={styles.meta}>A public page is visible to everyone, including people who are not signed in. Keep private family matters in your Spaces.</p>
    <section className={styles.stack} aria-labelledby="owned-heading">
      <h2 id="owned-heading">Pages you own</h2>
      {owned.isPending && <p role="status">Loading...</p>}
      {owned.isError && !sessionLost(owned.error) && <Failure error={owned.error} retry={() => owned.refetch()} />}
      {owned.data?.length === 0 && <p className={styles.empty}>You do not own a page yet.</p>}
      <ul className={styles.list}>
        {owned.data?.map(page => <li key={page.id} className={styles.row}>
          <span><Link href={`/pages/${page.handle}`}>{page.name}</Link> <span className={styles.meta}>@{page.handle} / {topicLabels[page.topic]} / {page.follower_count} followers</span></span>
        </li>)}
      </ul>
      {owned.data && owned.data.length < 5 && <CreatePageForm account={account} onCreated={() => queryClient.invalidateQueries({ queryKey: ["my-pages", account.id] })} />}
      {owned.data?.length === 5 && <p className={styles.meta}>You own the maximum of 5 pages in this local build.</p>}
    </section>
    <section className={styles.stack} aria-labelledby="following-heading">
      <h2 id="following-heading">Pages you follow</h2>
      {error && <div className="message error" role="alert">{error}</div>}
      {following.isPending && <p role="status">Loading pages you follow...</p>}
      {following.isError && !sessionLost(following.error) && <Failure error={following.error} retry={() => following.refetch()} />}
      {following.isSuccess && followed.length === 0 && <p className={styles.empty}>You do not follow any pages. <Link href="/app/discover">Discover pages</Link>.</p>}
      <ul className={styles.list}>
        {followed.map(page => <li key={page.id} className={styles.row}>
          <span><Link href={`/pages/${page.handle}`}>{page.name}</Link> <span className={styles.meta}>@{page.handle}</span></span>
          <button className="secondary-button" disabled={busy !== null} onClick={() => unfollow(page.id)} aria-label={`Unfollow ${page.name}`}><UserMinus size={17} aria-hidden />Unfollow</button>
        </li>)}
      </ul>
      {following.hasNextPage && <button className="secondary-button" disabled={following.isFetchingNextPage} onClick={() => following.fetchNextPage()}>Load more</button>}
    </section>
  </CommunityFrame>;
}

function CreatePageForm({ account, onCreated }: { account: Account; onCreated: () => void }) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState<Topic>("community");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<PageIntent | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "unknown">("idle");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const cleanHandle = handle.trim().toLowerCase();
  const handleProblem = cleanHandle && !HANDLE_PATTERN.test(cleanHandle) ? "Use 3 to 30 lowercase letters or digits, with single hyphens between them." : null;
  const invalid = !cleanHandle || handleProblem || textProblem(name, 80) || textProblem(description, 500, false);
  async function send(next: PageIntent) {
    setIntent(next);
    setState("sending");
    setError("");
    try {
      const page = await createPage(next);
      setIntent(null); setState("idle"); setHandle(""); setName(""); setDescription(""); setCreated(page.handle);
      onCreated();
    } catch (problem) {
      if (sessionLost(problem)) { window.location.reload(); return; }
      if (isUnknown(problem)) { setState("unknown"); setError(problemText(problem, "The page was not confirmed.")); return; }
      setIntent(null); setState("idle"); setError(problemText(problem, "The page was not created."));
    }
  }
  const locked = state !== "idle";
  return <form className={styles.form} aria-label="Create a public page" onSubmit={event => {
    event.preventDefault();
    if (invalid || locked) return;
    setCreated(null);
    void send({ accountId: account.id, key: crypto.randomUUID(), body: { handle: cleanHandle, name: name.trim(), description: description.trim(), topic } });
  }}>
    <h2>Create a public page</h2>
    <label>Handle<input value={handle} maxLength={30} onChange={event => setHandle(event.target.value)} disabled={locked} aria-describedby="handle-help" aria-invalid={handleProblem ? true : undefined} /></label>
    <span id="handle-help" className={handleProblem ? "field-error" : styles.meta}>{handleProblem ?? "Your page address: /pages/your-handle. It cannot be changed later."}</span>
    <label>Page name<input value={name} maxLength={160} onChange={event => setName(event.target.value)} disabled={locked} /></label>
    <label>Topic<select aria-label="Topic" value={topic} onChange={event => setTopic(event.target.value as Topic)} disabled={locked}>
      {TOPICS.map(item => <option key={item} value={item}>{topicLabels[item]}</option>)}
    </select></label>
    <label>Description (optional)<textarea value={description} maxLength={1000} onChange={event => setDescription(event.target.value)} disabled={locked} /></label>
    {error && <div className="message error" role="alert">{error}</div>}
    {created && <p className={styles.notice} role="status">Page created. <Link href={`/pages/${created}`}>Open @{created}</Link> to write your first post.</p>}
    <div className={styles.actions}>
      {state === "unknown" && intent
        ? <>
          <button className="primary-button" type="button" onClick={() => send(intent)}>Retry creating page</button>
          <button className="secondary-button" type="button" onClick={() => { setIntent(null); setState("idle"); onCreated(); }}>Stop tracking</button>
        </>
        : <button className="primary-button" type="submit" disabled={locked || Boolean(invalid)}>{state === "sending" ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Plus size={17} aria-hidden />}Create page</button>}
    </div>
  </form>;
}
