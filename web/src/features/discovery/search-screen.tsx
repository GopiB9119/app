"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";

import { api } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { spacesSchema } from "@/features/spaces/client";
import { EVENT_LABELS, FIRST_PAGE, MAX_QUERY, TASK_LABELS, documentLink, eventLink, highlight, normalizeQuery, queryProblem, searchSpaces, searchWords, taskLink } from "./client";
import type { SearchResults } from "./client";
import styles from "./search.module.css";

type Submitted = { q: string; spaceId: string };

const addressOf = (value: Submitted) => `/app/search?${new URLSearchParams(value.spaceId ? { q: value.q, space_id: value.spaceId } : { q: value.q })}`;

function wallTime(local: string) {
  const [day, time] = local.split("T");
  const [year, month, date] = day.split("-").map(Number);
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, date)))}, ${time}`;
}

function dueDate(value: string) {
  const [year, month, date] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, date)));
}

export function SearchScreen({ initialQuery, initialSpaceId }: { initialQuery: string; initialSpaceId: string }) {
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading search</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>Search unavailable</h1><p role="alert">{problemText(viewer.error, "Search could not load.")}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />Retry</button></main></Shell>;
  }
  return <SearchPage key={viewer.account.id} user={viewer.account} initial={{ q: initialQuery, spaceId: initialSpaceId }} />;
}

function SearchPage({ user, initial }: { user: Account; initial: Submitted }) {
  const queryClient = useQueryClient();
  const fieldId = useId();
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const [text, setText] = useState(initial.q);
  const [filter, setFilter] = useState(initial.spaceId);
  const [submitted, setSubmitted] = useState<Submitted | null>(queryProblem(initial.q) ? null : { q: normalizeQuery(initial.q), spaceId: initial.spaceId });
  const [problem, setProblem] = useState<string | null>(null);
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  const results = useQuery({
    queryKey: ["search", user.id, submitted?.q ?? "", submitted?.spaceId ?? ""],
    queryFn: ({ signal }) => searchSpaces(user.id, submitted?.q ?? "", submitted?.spaceId ?? "", signal),
    enabled: submitted !== null,
  });
  useEffect(() => {
    const back = () => {
      const query = new URLSearchParams(window.location.search);
      const q = query.get("q") ?? "";
      const spaceId = query.get("space_id") ?? "";
      setText(q); setFilter(spaceId); setProblem(null);
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
  const found = results.data;
  useEffect(() => { if (found) resultsRef.current?.focus(); }, [found]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const issue = queryProblem(text);
    setProblem(issue);
    if (issue) return;
    const next = { q: normalizeQuery(text), spaceId: filter };
    if (submitted && submitted.q === next.q && submitted.spaceId === next.spaceId) void results.refetch();
    setSubmitted(next);
    window.history.pushState(null, "", addressOf(next));
  };
  const spaceList = spaces.data?.data ?? [];
  const words = submitted ? searchWords(submitted.q) : [];
  const empty = found && !found.documents.length && !found.tasks.length && !found.events.length;

  return <Shell account>
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Search</h1>
        <p>Find documents, tasks and events in the Spaces you belong to.</p>
      </header>
      <form className={styles.form} onSubmit={submit} role="search" noValidate>
        <label className={styles.field} htmlFor={`${fieldId}-q`}>Search your Spaces
          <input id={`${fieldId}-q`} type="search" value={text} maxLength={MAX_QUERY * 2} autoComplete="off" aria-invalid={problem !== null}
            aria-describedby={`${fieldId}-hint${problem ? ` ${fieldId}-problem` : ""}`} onChange={event => { setText(event.target.value); setProblem(null); }} />
        </label>
        <p className={styles.hint} id={`${fieldId}-hint`}>Every word must match, from the start of a word. Messages, care records and reminders are not searched.</p>
        {problem && <p id={`${fieldId}-problem`} className="field-error" role="alert">{problem}</p>}
        <label className={styles.field} htmlFor={`${fieldId}-space`}><span id={`${fieldId}-space-label`}>Space</span>
          <select id={`${fieldId}-space`} aria-labelledby={`${fieldId}-space-label`} value={filter} disabled={spaces.isPending} onChange={event => setFilter(event.target.value)}>
            <option value="">All my Spaces</option>
            {spaceList.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
        </label>
        {spaces.isError && <p className="message error" role="alert">{problemText(spaces.error, "Your Spaces could not load.")}</p>}
        <div className={styles.actions}>
          <button className="primary-button" type="submit" disabled={results.isFetching}>{results.isFetching ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Search size={17} aria-hidden />}Search</button>
        </div>
      </form>
      {results.isFetching && <p role="status" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Searching</p>}
      {results.isError && !results.isFetching && <div className="message error" role="alert">{problemText(results.error, "The search did not finish.")}
        <button className="text-button" onClick={() => void results.refetch()}><RefreshCw size={16} aria-hidden />Try again</button></div>}
      {found && !results.isFetching && <section aria-labelledby={`${fieldId}-results`} className={styles.results}>
        <h2 id={`${fieldId}-results`} ref={resultsRef} tabIndex={-1}>Results for “{submitted?.q}”</h2>
        {empty
          ? <p className={styles.empty}>Nothing found in your Spaces.</p>
          : <>
            <Group title="Documents" count={found.documents.length} more={found.more_documents}>
              {found.documents.map((hit, index) => <li key={`${hit.document_id}-${index}`} className={styles.card}>
                <Link href={documentLink(hit)} className={styles.cardLink}>{hit.name}</Link>
                <p className={styles.meta}>In {hit.space_name} · {hit.start_line === hit.end_line ? `Line ${hit.start_line}` : `Lines ${hit.start_line}–${hit.end_line}`}</p>
                <Excerpt value={hit.excerpt} words={words} />
              </li>)}
            </Group>
            <Group title="Tasks" count={found.tasks.length} more={found.more_tasks}>
              {found.tasks.map(hit => <li key={hit.task_id} className={styles.card}>
                <Link href={taskLink(hit)} className={styles.cardLink}>{hit.title}</Link>
                <p className={styles.meta}>In {hit.space_name} · {TASK_LABELS[hit.status]}{hit.due_date ? ` · Due ${dueDate(hit.due_date)}` : ""}</p>
                <Excerpt value={hit.excerpt} words={words} />
              </li>)}
            </Group>
            <Group title="Events" count={found.events.length} more={found.more_events}>
              {found.events.map(hit => <li key={hit.event_id} className={styles.card}>
                <Link href={eventLink(hit)} className={styles.cardLink}>{hit.title}</Link>
                <p className={styles.meta}>In {hit.space_name} · {wallTime(hit.local_start)} ({hit.timezone}) · {EVENT_LABELS[hit.status]}</p>
                <Excerpt value={hit.excerpt} words={words} />
              </li>)}
            </Group>
          </>}
      </section>}
    </main>
  </Shell>;
}

function Group({ title, count, more, children }: { title: string; count: number; more: boolean; children: React.ReactNode }) {
  const titleId = useId();
  return <section aria-labelledby={titleId} className={styles.group}>
    <h3 id={titleId} className={styles.groupTitle}>{title} ({count}{more ? "+" : ""})</h3>
    {count === 0 ? <p className={styles.empty}>None found.</p> : <ul className={styles.list}>{children}</ul>}
    {more && <p className={styles.hint}>Showing the first {FIRST_PAGE}. Add words to narrow the results.</p>}
  </section>;
}

function Excerpt({ value, words }: { value: string; words: string[] }) {
  if (!value) return null;
  return <p className={styles.excerpt}>{highlight(value, words).map((piece, index) => piece.marked ? <mark key={index}>{piece.text}</mark> : <span key={index}>{piece.text}</span>)}</p>;
}
