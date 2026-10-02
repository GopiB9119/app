"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Globe, LoaderCircle, RefreshCw, Search, Send, UndoDot, UsersRound } from "lucide-react";

import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId, MessageValues } from "@/features/i18n/messages";
import { askToJoin, cancelJoinRequest, characters, findGroups, lengthProblem, myJoinRequests } from "./client";
import type { DirectoryEntry, JoinIntent, JoinRequest } from "./client";
import styles from "./spaces.module.css";

const NOTE_LIMIT = 280;
const statusLabels: Record<JoinRequest["status"], MessageId> = {
  pending: "spaces.groups.status.pending", approved: "spaces.groups.status.approved", declined: "spaces.groups.status.declined",
  cancelled: "spaces.groups.status.cancelled", closed: "spaces.groups.status.closed", expired: "spaces.groups.status.expired",
};

export function DiscoverScreen() {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) window.location.replace("/login");
  }, [profile.error]);
  if (profile.isPending) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("spaces.groups.loadingScreen")}</main></Shell>;
  }
  if (!profile.data || profile.isError) {
    return <Shell account><main className={styles.main}><h1>{t("spaces.groups.unavailable")}</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />{t("spaces.retry")}</button></main></Shell>;
  }
  return <FindGroups key={profile.data.data.id} user={profile.data.data} />;
}

function FindGroups({ user }: { user: Account }) {
  const t = useText();
  const { language } = useLanguage();
  // English keeps the browser's own date format.
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium" }), [language]);
  const cache = useQueryClient();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<DirectoryEntry | null>(null);
  const [note, setNote] = useState("");
  const [intent, setIntent] = useState<JoinIntent | null>(null);
  const [notice, setNotice] = useState<{ id: MessageId; values?: MessageValues } | null>(null);
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
      setNotice({ id: "spaces.groups.sent", values: { name: request.space_name } });
      await refresh();
    },
    onError: error => {
      // A refused request is final; only an unconfirmed one keeps its key for an exact retry.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) setIntent(null);
    },
  });
  const withdraw = useMutation({
    retry: false, networkMode: "always", mutationFn: (requestId: string) => cancelJoinRequest(user.id, requestId),
    onSuccess: async request => { setNotice({ id: "spaces.groups.withdrawn", values: { name: request.space_name } }); await refresh(); },
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
  const noteProblem = lengthProblem(note, NOTE_LIMIT);
  function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asking || busy || (!intent && noteProblem !== null)) return;
    const pending = intent ?? { accountId: user.id, spaceId: asking.id, note: note.trim(), key: crypto.randomUUID() };
    setIntent(pending); setNotice(null); ask.mutate(pending);
  }
  const [emptyStart, emptyEnd = ""] = t("spaces.groups.emptyText").split("{link}");
  return <Shell account>
    <main className={styles.main}>
      <nav className={styles.navigation} aria-label={t("spaces.workspace")}>
        <Link href="/app/spaces"><ArrowLeft size={18} aria-hidden />{t("spaces.yours")}</Link>
        <span aria-current="page"><Globe size={18} aria-hidden />{t("spaces.findGroups")}</span>
      </nav>
      <div className={styles.heading}>
        <div><span className="section-kicker">{t("spaces.groups.kicker")}</span><h1>{t("spaces.findGroups")}</h1>
          <p className={styles.description}>{t("spaces.groups.intro")}</p></div>
      </div>
      {notice && <div className="message success" role="status"><Check size={18} aria-hidden />{t(notice.id, notice.values)}</div>}
      {problem && !(problem instanceof ApiError && problem.status === 401) && <div className="message error" role="alert">{problem.message}</div>}
      <form className={styles.searchForm} role="search" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setNotice(null); }}>
        <label>{t("spaces.groups.search")}<input type="search" name="group_search" maxLength={80} value={draft} onChange={event => setDraft(event.target.value)} placeholder={t("spaces.groups.searchPlaceholder")} /></label>
        <button className="primary-button" type="submit" disabled={groups.isFetching}><Search size={17} aria-hidden />{t("spaces.groups.searchAction")}</button>
      </form>
      <section aria-labelledby="results-title">
        <div className={styles.sectionHeading}>
          <h2 id="results-title">{query ? t("spaces.groups.matching", { query }) : t("spaces.groups.newest")}</h2>
          <button className="icon-button" title={t("spaces.groups.refresh")} aria-label={t("spaces.groups.refresh")} disabled={groups.isFetching} onClick={() => groups.refetch()}><RefreshCw size={18} className={groups.isFetching ? "spin" : ""} aria-hidden /></button>
        </div>
        {groups.isPending && <p role="status" aria-busy="true">{t("spaces.groups.loading")}</p>}
        {groups.isSuccess && entries.length === 0 && <div className={styles.empty}><Globe size={32} strokeWidth={1.5} aria-hidden /><h3>{query ? t("spaces.groups.noMatch") : t("spaces.groups.none")}</h3>
          <p>{emptyStart}<Link href="/app/spaces">{t("spaces.yours")}</Link>{emptyEnd}</p></div>}
        {entries.length > 0 && <ul className={styles.groupGrid}>{entries.map(entry => <li key={entry.id} className={styles.groupCard}>
          <h3>{entry.name}</h3>
          {entry.description && <p>{entry.description}</p>}
          <div className={styles.groupMeta}>
            <span><UsersRound size={15} aria-hidden />{entry.member_count === 1 ? t("spaces.groups.memberOne") : t("spaces.groups.memberOther", { count: entry.member_count })}</span>
            {entry.viewer_role && <span className={styles.chip}>{t(entry.viewer_role === "owner" ? "spaces.groups.youOwn" : entry.viewer_role === "admin" ? "spaces.groups.youAdmin" : "spaces.groups.youMember")}</span>}
            {entry.pending_request_id && <span className={styles.chip}>{t("spaces.groups.requestSent")}</span>}
            {!entry.viewer_role && !entry.pending_request_id && !entry.can_request && <span>{t("spaces.groups.notAccepting")}</span>}
          </div>
          {asking?.id === entry.id ? <form className={styles.noteForm} onSubmit={send}>
            <label>{t("spaces.groups.note")}<textarea className={styles.textArea} name="join_note" maxLength={NOTE_LIMIT * 2} value={intent?.note ?? note} disabled={intent !== null} onChange={event => { setNote(event.target.value); ask.reset(); }} placeholder={t("spaces.groups.notePlaceholder")} /></label>
            <span className={styles.counter}>{characters(intent?.note ?? note)}/{NOTE_LIMIT}</span>
            {!intent && noteProblem && <span className="field-error">{noteProblem}</span>}
            {intent && !ask.isPending && ask.isError && <p role="status">{t("spaces.groups.unconfirmed")}</p>}
            <div className={styles.groupActions}>
              <button type="button" className="secondary-button" disabled={ask.isPending} onClick={() => { setAsking(null); setIntent(null); setNote(""); ask.reset(); }}>{t("spaces.cancel")}</button>
              <button type="submit" className="primary-button" disabled={ask.isPending || (!intent && noteProblem !== null)}>
                {ask.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <Send size={17} aria-hidden />}{intent && !ask.isPending ? t("spaces.groups.retryRequest") : t("spaces.groups.sendRequest")}
              </button>
            </div>
          </form> : <div className={styles.groupActions}>
            {entry.viewer_role && <Link className="secondary-button" href="/app/spaces">{t("spaces.groups.openInSpaces")}</Link>}
            {entry.can_request && <button className="primary-button" disabled={busy || asking !== null} onClick={() => { setAsking(entry); setNote(""); setIntent(null); setNotice(null); ask.reset(); }}><Send size={17} aria-hidden />{t("spaces.groups.ask")}</button>}
            {entry.pending_request_id && <button className="secondary-button" disabled={busy} onClick={() => withdraw.mutate(entry.pending_request_id!)}>
              {withdraw.isPending && withdraw.variables === entry.pending_request_id ? <LoaderCircle size={17} className="spin" aria-hidden /> : <UndoDot size={17} aria-hidden />}{t("spaces.groups.withdrawRequest")}
            </button>}
          </div>}
        </li>)}</ul>}
        {groups.hasNextPage && <div className={styles.loadMore}><button className="secondary-button" disabled={groups.isFetchingNextPage} onClick={() => groups.fetchNextPage()}>
          {groups.isFetchingNextPage ? <LoaderCircle size={17} className="spin" aria-hidden /> : null}{t("spaces.groups.more")}</button></div>}
      </section>
      <section className={styles.invitationSection} aria-labelledby="my-requests-title">
        <div className={styles.sectionHeading}><h2 id="my-requests-title">{t("spaces.groups.myRequests")}</h2></div>
        {requests.isSuccess && requests.data.length === 0 && <p className={styles.emptyNote}>{t("spaces.groups.noRequests")}</p>}
        {requests.data && requests.data.length > 0 && <ul className={styles.invitationList}>{requests.data.map(request => <li key={request.id}>
          <div className={styles.invitationDetails}>
            <p><strong>{request.space_name}</strong></p>
            <span>{t("spaces.groups.asked", { status: t(statusLabels[request.status]), date: dateFormat.format(new Date(request.created_at)) })}</span>
            {request.note && <blockquote className={styles.requestNote}>{request.note}</blockquote>}
          </div>
          <div className={styles.invitationActions}>
            {request.status === "approved" && <Link className="secondary-button" href="/app/spaces">{t("spaces.groups.open")}</Link>}
            {request.status === "pending" && <button className="secondary-button" disabled={busy} onClick={() => withdraw.mutate(request.id)}><UndoDot size={17} aria-hidden />{t("spaces.groups.withdraw")}</button>}
          </div>
        </li>)}</ul>}
      </section>
    </main>
  </Shell>;
}
