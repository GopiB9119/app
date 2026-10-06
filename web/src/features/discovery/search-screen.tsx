"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";

import { api } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { Language } from "@/features/i18n/messages";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { subscribeLive } from "@/features/realtime/live";
import { spacesSchema } from "@/features/spaces/client";
import { FIRST_PAGE, MAX_QUERY, MAX_RESULTS, PAGE_STEP, documentLink, eventLink, highlight, normalizeQuery, queryProblem, searchSpaces, searchWords, taskLink } from "./client";
import styles from "./search.module.css";

type Submitted = { q: string; spaceId: string };
type Kind = "documents" | "tasks" | "events";

// Live hints that arrive close together read the results once, and a notice stays long enough to be read.
const LIVE_WAIT_MILLISECONDS = 400;
const NOTICE_MILLISECONDS = 6000;

const addressOf = (value: Submitted) => `/app/search?${new URLSearchParams(value.spaceId ? { q: value.q, space_id: value.spaceId } : { q: value.q })}`;

function wallTime(local: string, language: Language = "en") {
  const [day, time] = local.split("T");
  const [year, month, date] = day.split("-").map(Number);
  return `${new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, date)))}, ${time}`;
}

function dueDate(value: string, language: Language = "en") {
  const [year, month, date] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, date)));
}

export function SearchScreen({ initialQuery, initialSpaceId }: { initialQuery: string; initialSpaceId: string }) {
  const t = useText();
  const viewer = useViewer();
  // Back from another page can bring this page back with the words it was first opened with, while the address names the search the
  // person left. The address comes first; the page's own words cover an address without any.
  const address = useSearchParams();
  const named = address?.get("q") ?? "";
  const namedSpace = address?.get("space_id") ?? "";
  const initial: Submitted = named
    ? { q: named.slice(0, 400), spaceId: /^[0-9a-f-]{36}$/.test(namedSpace) ? namedSpace : "" }
    : { q: initialQuery, spaceId: initialSpaceId };
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("search.loading")}</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>{t("search.unavailable")}</h1><p role="alert">{problemText(viewer.error, t("search.loadError"))}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />{t("search.retry")}</button></main></Shell>;
  }
  return <SearchPage key={viewer.account.id} user={viewer.account} initial={initial} />;
}

function SearchPage({ user, initial }: { user: Account; initial: Submitted }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const [text, setText] = useState(initial.q);
  const [filter, setFilter] = useState(initial.spaceId);
  const [submitted, setSubmitted] = useState<Submitted | null>(queryProblem(initial.q) ? null : { q: normalizeQuery(initial.q), spaceId: initial.spaceId });
  const [limit, setLimit] = useState(FIRST_PAGE);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  const spaceList = spaces.data?.data ?? [];
  // A Space named in the address is checked against the person's Spaces first, so a missing one never shows as a failed search.
  const checking = Boolean(submitted?.spaceId) && spaces.isPending;
  const results = useQuery({
    queryKey: ["search", user.id, submitted?.q ?? "", submitted?.spaceId ?? "", limit],
    queryFn: ({ signal }) => searchSpaces(user.id, submitted?.q ?? "", submitted?.spaceId ?? "", signal, limit),
    enabled: submitted !== null && !checking,
    // Asking for more of the same search keeps the earlier results on screen until the longer list arrives.
    placeholderData: (earlier, earlierQuery) => earlierQuery?.queryKey[2] === submitted?.q && earlierQuery?.queryKey[3] === submitted?.spaceId ? earlier : undefined,
  });
  const found = results.data;
  // What the live hints below need to know without being set up again on every change.
  const latest = useRef({ submitted, limit });
  useEffect(() => { latest.current = { submitted, limit }; });
  // Focus moves to the results only after something the person asked for, never after a live update.
  const focusAfter = useRef<"results" | Kind | null>(null);

  useEffect(() => {
    const back = () => {
      const query = new URLSearchParams(window.location.search);
      const q = query.get("q") ?? "";
      const spaceId = query.get("space_id") ?? "";
      setText(q); setFilter(spaceId); setProblem(null); setNotice(""); setLimit(FIRST_PAGE);
      setSubmitted(queryProblem(q) ? null : { q: normalizeQuery(q), spaceId });
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    if (sessionLost(spaces.error) || sessionLost(results.error)) {
      queryClient.clear();
      window.location.replace("/login");
    }
  }, [spaces.error, results.error, queryClient]);
  useEffect(() => {
    const target = focusAfter.current;
    if (!target || results.isFetching) return;
    focusAfter.current = null;
    if (!results.data) return;
    if (target === "results") resultsRef.current?.focus();
    else (document.getElementById(`${fieldId}-more-${target}`) ?? document.getElementById(`${fieldId}-group-${target}`))?.focus();
  }, [results.isFetching, results.dataUpdatedAt, results.errorUpdatedAt, results.data, fieldId]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), NOTICE_MILLISECONDS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  // A Space the person lost, or left, no longer filters anything: show every Space they have and say so.
  useEffect(() => {
    if (!spaces.isSuccess || !filter || spaceList.some(space => space.id === filter)) return;
    setFilter("");
    if (submitted?.spaceId === filter) {
      const next = { q: submitted.q, spaceId: "" };
      setSubmitted(next); setLimit(FIRST_PAGE); setNotice(t("search.spaceGone"));
      window.history.replaceState(null, "", addressOf(next));
    }
  }, [spaces.isSuccess, spaces.data, filter, submitted]);

  // Reads the open search again and says so only when something in it changed.
  const refresh = useCallback(async () => {
    const { submitted: current, limit: count } = latest.current;
    if (!current) return;
    const queryKey = ["search", user.id, current.q, current.spaceId, count];
    const before = queryClient.getQueryData(queryKey);
    await queryClient.refetchQueries({ queryKey, exact: true });
    if (before !== undefined && queryClient.getQueryData(queryKey) !== before) setNotice(t("search.updated"));
  }, [queryClient, user.id, t]);
  useEffect(() => {
    let timer: number | undefined;
    const stop = subscribeLive(update => {
      if (update.accountId !== user.id) return;
      const watching = latest.current.submitted;
      if (update.kind === "search") {
        if (update.reason === "access" || update.reason === "space") void queryClient.invalidateQueries({ queryKey: ["spaces", user.id] });
        if (!watching) return;
        // A place lost in the Space being searched is handled when the Spaces are read again, which drops the filter.
        if (watching.spaceId && (update.space_id !== watching.spaceId || update.reason === "access")) return;
      } else if (update.kind === "resync") {
        void queryClient.invalidateQueries({ queryKey: ["spaces", user.id] });
        if (!watching) return;
      } else return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), LIVE_WAIT_MILLISECONDS);
    });
    return () => { stop(); window.clearTimeout(timer); };
  }, [queryClient, refresh, user.id]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const issue = queryProblem(text);
    setProblem(issue);
    if (issue) return;
    const next = { q: normalizeQuery(text), spaceId: filter };
    const same = submitted?.q === next.q && submitted?.spaceId === next.spaceId;
    setNotice("");
    focusAfter.current = "results";
    if (same && limit === FIRST_PAGE) void results.refetch();
    setLimit(FIRST_PAGE);
    setSubmitted(next);
    const address = addressOf(next);
    if (address !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, "", address);
  };
  const showMore = (kind: Kind) => {
    focusAfter.current = kind;
    setNotice("");
    setLimit(current => Math.min(current + PAGE_STEP, MAX_RESULTS));
  };
  const words = submitted ? searchWords(submitted.q) : [];
  const empty = found && !found.documents.length && !found.tasks.length && !found.events.length;
  const loadingMore = results.isFetching && results.isPlaceholderData && found !== undefined && found.limit < limit;
  const localProblem = problem === "Enter at least one word to search for." ? t("search.problem.empty")
    : problem === `Search for up to ${MAX_QUERY} characters.` ? t("search.problem.long", { limit: MAX_QUERY }) : problem;

  return <Shell account>
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>{t("search.title")}</h1>
        <p>{t("search.intro")}</p>
      </header>
      <form className={styles.form} onSubmit={submit} role="search" noValidate>
        <label className={styles.field} htmlFor={`${fieldId}-q`}>{t("search.query")}
          <input id={`${fieldId}-q`} type="search" value={text} maxLength={MAX_QUERY * 2} autoComplete="off" aria-invalid={problem !== null}
            aria-describedby={`${fieldId}-hint${problem ? ` ${fieldId}-problem` : ""}`} onChange={event => { setText(event.target.value); setProblem(null); }} />
        </label>
        <p className={styles.hint} id={`${fieldId}-hint`}>{t("search.hint")}</p>
        {problem && <p id={`${fieldId}-problem`} className="field-error" role="alert">{localProblem}</p>}
        <label className={styles.field} htmlFor={`${fieldId}-space`}><span id={`${fieldId}-space-label`}>{t("search.space")}</span>
          <select id={`${fieldId}-space`} aria-labelledby={`${fieldId}-space-label`} value={filter} disabled={spaces.isPending} onChange={event => setFilter(event.target.value)}>
            <option value="">{t("search.allSpaces")}</option>
            {spaceList.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
        </label>
        {spaces.isError && <p className="message error" role="alert">{problemText(spaces.error, t("search.spacesError"))}</p>}
        <div className={styles.actions}>
          <button className="primary-button" type="submit" disabled={results.isFetching && !found}>{results.isFetching && !found ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Search size={17} aria-hidden />}{t("search.title")}</button>
        </div>
      </form>
      <div className={styles.status} role="status">
        {results.isFetching && !found && <span aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("search.searching")}</span>}
        {loadingMore && <span>{t("search.loadingMore")}</span>}
        {/* A quiet refresh is shown but not announced: the notice says when something changed. */}
        {results.isFetching && found && !loadingMore && <span aria-hidden="true">{t("search.updating")}</span>}
        {!results.isFetching && notice}
      </div>
      {results.isError && !results.isFetching && <div className="message error" role="alert">{problemText(results.error, t("search.error"))}{found ? ` ${t("search.stale")}` : ""}
        <button className="text-button" onClick={() => void results.refetch()}><RefreshCw size={16} aria-hidden />{t("search.tryAgain")}</button></div>}
      {found && <section aria-labelledby={`${fieldId}-results`} className={styles.results}>
        <h2 id={`${fieldId}-results`} ref={resultsRef} tabIndex={-1}>{t("search.resultsFor", { query: submitted?.q ?? "" })}</h2>
        {empty
          ? <p className={styles.empty}>{t("search.empty")}</p>
          : <>
            <Group id={fieldId} kind="documents" title={t("search.documents")} count={found.documents.length} more={found.more_documents} capped={limit >= MAX_RESULTS} loading={loadingMore} onMore={showMore}>
              {found.documents.map((hit, index) => <li key={`${hit.document_id}-${index}`} className={styles.card}>
                <Link href={documentLink(hit)} className={styles.cardLink}><span><Marked value={hit.name} words={words} /></span></Link>
                <p className={styles.meta}>{t("search.inSpace", { space: hit.space_name })} · {hit.start_line === hit.end_line ? t("search.line", { line: hit.start_line }) : t("search.lines", { start: hit.start_line, end: hit.end_line })}</p>
                <Excerpt value={hit.excerpt} words={words} />
              </li>)}
            </Group>
            <Group id={fieldId} kind="tasks" title={t("search.tasks")} count={found.tasks.length} more={found.more_tasks} capped={limit >= MAX_RESULTS} loading={loadingMore} onMore={showMore}>
              {found.tasks.map(hit => <li key={hit.task_id} className={styles.card}>
                <Link href={taskLink(hit)} className={styles.cardLink}><span><Marked value={hit.title} words={words} /></span></Link>
                <p className={styles.meta}>{t("search.inSpace", { space: hit.space_name })} · {t(`search.task.${hit.status}`)}{hit.due_date ? t("search.due", { date: dueDate(hit.due_date, language) }) : ""}</p>
                <Excerpt value={hit.excerpt} words={words} label={hit.excerpt_in === "checklist" ? t("search.inChecklist") : undefined} />
              </li>)}
            </Group>
            <Group id={fieldId} kind="events" title={t("search.events")} count={found.events.length} more={found.more_events} capped={limit >= MAX_RESULTS} loading={loadingMore} onMore={showMore}>
              {found.events.map(hit => <li key={hit.event_id} className={styles.card}>
                <Link href={eventLink(hit)} className={styles.cardLink}><span><Marked value={hit.title} words={words} /></span></Link>
                <p className={styles.meta}>{t("search.inSpace", { space: hit.space_name })} · {wallTime(hit.local_start, language)} ({hit.timezone}) · {t(`search.event.${hit.status}`)}</p>
                <Excerpt value={hit.excerpt} words={words} />
              </li>)}
            </Group>
          </>}
      </section>}
    </main>
  </Shell>;
}

function Group({ id, kind, title, count, more, capped, loading, onMore, children }: {
  id: string; kind: Kind; title: string; count: number; more: boolean; capped: boolean; loading: boolean;
  onMore: (kind: Kind) => void; children: React.ReactNode;
}) {
  const t = useText();
  const titleId = `${id}-group-${kind}`;
  return <section aria-labelledby={titleId} className={styles.group}>
    <h3 id={titleId} className={styles.groupTitle} tabIndex={-1}>{title} ({count}{more ? "+" : ""})</h3>
    {count === 0 ? <p className={styles.empty}>{t("search.none")}</p> : <ul className={styles.list}>{children}</ul>}
    {more && (capped
      ? <p className={styles.hint}>{t("search.firstPage", { limit: MAX_RESULTS })}</p>
      : <button id={`${id}-more-${kind}`} className="secondary-button" type="button" disabled={loading} onClick={() => onMore(kind)}>{t(`search.more.${kind}`)}</button>)}
  </section>;
}

function Marked({ value, words }: { value: string; words: string[] }) {
  return <>{highlight(value, words).map((piece, index) => piece.marked ? <mark key={index}>{piece.text}</mark> : <span key={index}>{piece.text}</span>)}</>;
}

function Excerpt({ value, words, label }: { value: string; words: string[]; label?: string }) {
  if (!value) return null;
  return <p className={styles.excerpt}>{label && <span className={styles.excerptLabel}>{label} </span>}<Marked value={value} words={words} /></p>;
}
