"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Globe, LoaderCircle, RefreshCw, Search, Send, UndoDot, UsersRound } from "lucide-react";

import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { askToJoin, cancelJoinRequest, findGroups, joinStatusLabels, myJoinRequests } from "./client";
import type { DirectoryEntry, JoinIntent } from "./client";
import styles from "./spaces.module.css";

const NOTE_LIMIT = 280;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function DiscoverScreen() {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) window.location.replace("/login");
  }, [profile.error]);
  if (profile.isPending) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading groups</main></Shell>;
  }
  if (!profile.data || profile.isError) {
    return <Shell account><main className={styles.main}><h1>Groups unavailable</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />Retry</button></main></Shell>;
  }
  return <FindGroups key={profile.data.data.id} user={profile.data.data} />;
}

function FindGroups({ user }: { user: Account }) {
  const cache = useQueryClient();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<DirectoryEntry | null>(null);
  const [note, setNote] = useState("");
  const [intent, setIntent] = useState<JoinIntent | null>(null);
  const [notice, setNotice] = useState("");
  const groups = useInfiniteQuery({
    queryKey: ["groups", user.id, query], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => findGroups(user.id, query, pageParam, signal),
    getNextPageParam: page => page.pagination.has_more ? page.pagination.next_cursor : undefined,
  });
  const requests = useQuery({ queryKey: ["myJoinRequests", user.id], queryFn: ({ signal }) => myJoinRequests(user.id, signal) });
  const refresh = () => cache.invalidateQueries({ predicate: item => item.queryKey.includes(user.id) });
  const ask = useMutation({
    retry: false, networkMode: "always", mutationFn: askToJoin,
    onSuccess: async request => {
      setIntent(null); setAsking(null); setNote("");
      setNotice(`Request sent to ${request.space_name}. The owner will review it.`);
      await refresh();
    },
    onError: error => {
      // A refused request is final; only an unconfirmed one keeps its key for an exact retry.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) setIntent(null);
    },
  });
  const withdraw = useMutation({
    retry: false, networkMode: "always", mutationFn: (requestId: string) => cancelJoinRequest(user.id, requestId),
    onSuccess: async request => { setNotice(`Request to ${request.space_name} withdrawn.`); await refresh(); },
  });
  const problem = ask.error ?? withdraw.error ?? groups.error ?? requests.error;
  useEffect(() => {
    if (problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED")) {
      cache.clear(); window.location.replace(problem.status === 401 ? "/login" : "/app/spaces/discover");
    }
  }, [problem, cache]);
  useEffect(() => {
    if (!intent && !note.trim()) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [intent, note]);

  const entries = groups.data?.pages.flatMap(page => page.data) ?? [];
  const busy = ask.isPending || withdraw.isPending;
  function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asking || busy) return;
    const pending = intent ?? { accountId: user.id, spaceId: asking.id, note: note.trim(), key: crypto.randomUUID() };
    setIntent(pending); setNotice(""); ask.mutate(pending);
  }
  return <Shell account>
    <main className={styles.main}>
      <nav className={styles.navigation} aria-label="Workspace">
        <Link href="/app/spaces"><ArrowLeft size={18} aria-hidden />Your Spaces</Link>
        <span aria-current="page"><Globe size={18} aria-hidden />Find groups</span>
      </nav>
      <div className={styles.heading}>
        <div><span className="section-kicker">PUBLIC GROUPS</span><h1>Find groups</h1>
          <p className={styles.description}>Groups whose owners made them public. You see only a group&apos;s name, description and size; its chats, events and members stay private to its members.</p></div>
      </div>
      {notice && <div className="message success" role="status"><Check size={18} aria-hidden />{notice}</div>}
      {problem && !(problem instanceof ApiError && problem.status === 401) && <div className="message error" role="alert">{problem.message}</div>}
      <form className={styles.searchForm} role="search" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setNotice(""); }}>
        <label>Search by name or description<input type="search" name="group_search" maxLength={80} value={draft} onChange={event => setDraft(event.target.value)} placeholder="For example: hiking, book club" /></label>
        <button className="primary-button" type="submit" disabled={groups.isFetching}><Search size={17} aria-hidden />Search</button>
      </form>
      <section aria-labelledby="results-title">
        <div className={styles.sectionHeading}>
          <h2 id="results-title">{query ? `Groups matching "${query}"` : "Newest public groups"}</h2>
          <button className="icon-button" title="Refresh groups" aria-label="Refresh groups" disabled={groups.isFetching} onClick={() => groups.refetch()}><RefreshCw size={18} className={groups.isFetching ? "spin" : ""} aria-hidden /></button>
        </div>
        {groups.isPending && <p role="status" aria-busy="true">Loading groups...</p>}
        {groups.isSuccess && entries.length === 0 && <div className={styles.empty}><Globe size={32} strokeWidth={1.5} aria-hidden /><h3>{query ? "No public groups match that search." : "No public groups yet."}</h3>
          <p>Create a group on <Link href="/app/spaces">Your Spaces</Link> and make it public to let people find it.</p></div>}
        {entries.length > 0 && <ul className={styles.groupGrid}>{entries.map(entry => <li key={entry.id} className={styles.groupCard}>
          <h3>{entry.name}</h3>
          {entry.description && <p>{entry.description}</p>}
          <div className={styles.groupMeta}>
            <span><UsersRound size={15} aria-hidden />{entry.member_count === 1 ? "1 member" : `${entry.member_count} members`}</span>
            {entry.viewer_role && <span className={styles.chip}>{entry.viewer_role === "owner" ? "You own this group" : "You are a member"}</span>}
            {entry.pending_request_id && <span className={styles.chip}>Request sent</span>}
            {!entry.viewer_role && !entry.pending_request_id && !entry.can_request && <span>Not accepting your request right now</span>}
          </div>
          {asking?.id === entry.id ? <form className={styles.noteForm} onSubmit={send}>
            <label>Note to the owner (optional)<textarea className={styles.textArea} name="join_note" maxLength={NOTE_LIMIT} value={intent?.note ?? note} disabled={intent !== null} onChange={event => { setNote(event.target.value); ask.reset(); }} placeholder="Say who you are and why you would like to join." /></label>
            <span className={styles.counter}>{(intent?.note ?? note).length}/{NOTE_LIMIT}</span>
            {intent && !ask.isPending && ask.isError && <p role="status">The request was not confirmed. Retrying sends exactly the same request.</p>}
            <div className={styles.groupActions}>
              <button type="button" className="secondary-button" disabled={ask.isPending} onClick={() => { setAsking(null); setIntent(null); setNote(""); ask.reset(); }}>Cancel</button>
              <button type="submit" className="primary-button" disabled={ask.isPending}>
                {ask.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <Send size={17} aria-hidden />}{intent && !ask.isPending ? "Retry request" : "Send request"}
              </button>
            </div>
          </form> : <div className={styles.groupActions}>
            {entry.viewer_role && <Link className="secondary-button" href="/app/spaces">Open in Your Spaces</Link>}
            {entry.can_request && <button className="primary-button" disabled={busy || asking !== null} onClick={() => { setAsking(entry); setNote(""); setIntent(null); setNotice(""); ask.reset(); }}><Send size={17} aria-hidden />Ask to join</button>}
            {entry.pending_request_id && <button className="secondary-button" disabled={busy} onClick={() => withdraw.mutate(entry.pending_request_id!)}>
              {withdraw.isPending && withdraw.variables === entry.pending_request_id ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UndoDot size={17} aria-hidden />}Withdraw request
            </button>}
          </div>}
        </li>)}</ul>}
        {groups.hasNextPage && <div className={styles.loadMore}><button className="secondary-button" disabled={groups.isFetchingNextPage} onClick={() => groups.fetchNextPage()}>
          {groups.isFetchingNextPage ? <LoaderCircle size={17} className="spin" aria-hidden /> : null}Show more groups</button></div>}
      </section>
      <section className={styles.invitationSection} aria-labelledby="my-requests-title">
        <div className={styles.sectionHeading}><h2 id="my-requests-title">Your join requests</h2></div>
        {requests.isSuccess && requests.data.length === 0 && <p className={styles.emptyNote}>You have not asked to join any group.</p>}
        {requests.data && requests.data.length > 0 && <ul className={styles.invitationList}>{requests.data.map(request => <li key={request.id}>
          <div className={styles.invitationDetails}>
            <p><strong>{request.space_name}</strong></p>
            <span>{joinStatusLabels[request.status]} · asked {dateFormat.format(new Date(request.created_at))}</span>
            {request.note && <blockquote className={styles.requestNote}>{request.note}</blockquote>}
          </div>
          <div className={styles.invitationActions}>
            {request.status === "approved" && <Link className="secondary-button" href="/app/spaces">Open</Link>}
            {request.status === "pending" && <button className="secondary-button" disabled={busy} onClick={() => withdraw.mutate(request.id)}><UndoDot size={17} aria-hidden />Withdraw</button>}
          </div>
        </li>)}</ul>}
      </section>
    </main>
  </Shell>;
}
