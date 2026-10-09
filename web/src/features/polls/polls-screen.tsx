"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Plus, RefreshCw, Trophy, Undo2, Vote, X } from "lucide-react";

import { ApiError, api, characters } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId } from "@/features/i18n/messages";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { useLiveConnected } from "@/features/realtime/live";
import { spacesSchema } from "@/features/spaces/client";
import type { ListedSpace } from "@/features/spaces/client";
import { SpaceHeader } from "@/features/spaces/space-header";
import { MAX_OPTION, MAX_OPTIONS, MAX_QUESTION, MIN_OPTIONS, closePoll, createPoll, listPolls, vote, withdrawVote } from "./client";
import type { CreatePollIntent, PollStatus, SpacePoll } from "./client";
import styles from "./polls.module.css";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function PollsScreen({ initialSpaceId }: { initialSpaceId: string }) {
  const t = useText();
  const viewer = useViewer();
  const address = useSearchParams();
  const named = address?.get("space_id") ?? "";
  const spaceId = uuid.test(named) ? named : initialSpaceId;
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("polls.loading")}</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>{t("polls.unavailable")}</h1><p role="alert">{problemText(viewer.error, t("polls.loadError"))}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />{t("polls.retry")}</button></main></Shell>;
  }
  return <Polls key={viewer.account.id} user={viewer.account} initialSpaceId={spaceId} />;
}

function Polls({ user, initialSpaceId }: { user: Account; initialSpaceId: string }) {
  const t = useText();
  const queryClient = useQueryClient();
  const spaceLabel = useId();
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [notice, setNotice] = useState<{ id: MessageId; at: number } | null>(null);
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  useEffect(() => {
    if (sessionLost(spaces.error)) { queryClient.clear(); window.location.replace("/login"); }
  }, [spaces.error, queryClient]);
  useEffect(() => {
    const back = () => { const value = new URLSearchParams(window.location.search).get("space_id") ?? ""; setSpaceId(uuid.test(value) ? value : ""); };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const spaceList = spaces.data?.data ?? [];
  const space = spaceList.find(item => item.id === spaceId) ?? spaceList[0];
  const choose = (id: string) => {
    setNotice(null);
    setSpaceId(id);
    window.history.pushState(null, "", `/app/polls?space_id=${id}`);
  };

  return <Shell account>
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>{t("polls.title")}</h1>
        <p>{t("polls.description")}</p>
      </header>
      {spaces.isPending && <p role="status" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("polls.loading")}</p>}
      {spaces.isError && <div className="message error" role="alert">{problemText(spaces.error, t("polls.loadError"), t)}<button className="text-button" onClick={() => spaces.refetch()}><RefreshCw size={16} aria-hidden />{t("polls.retry")}</button></div>}
      {spaces.isSuccess && spaceList.length === 0 && <p className={styles.empty}>{t("polls.noSpaces")} <Link href="/app/spaces">{t("spaces.title")}</Link></p>}
      {space && <>
        {spaceList.length > 1 && <div className={styles.controls}>
          <label className={styles.field}><span id={spaceLabel}>{t("polls.space")}</span>
            <select aria-labelledby={spaceLabel} value={space.id} onChange={event => choose(event.target.value)}>
              {spaceList.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>}
        <SpaceHeader space={space} current="polls" />
        <Notice message={notice} />
        <NewPoll key={`new-${space.id}`} user={user} space={space} onCreated={() => setNotice({ id: "polls.created", at: Date.now() })} />
        <PollList key={`list-${space.id}`} user={user} space={space} onNotice={id => setNotice({ id, at: Date.now() })} />
      </>}
    </main>
  </Shell>;
}

function Notice({ message }: { message: { id: MessageId; at: number } | null }) {
  const t = useText();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message) ref.current?.focus(); }, [message]);
  return message ? <p ref={ref} className={styles.notice} role="status" tabIndex={-1}>{t(message.id)}</p> : null;
}

function NewPoll({ user, space, onCreated }: { user: Account; space: ListedSpace; onCreated: () => void }) {
  const t = useText();
  const queryClient = useQueryClient();
  const questionId = useId();
  const hintId = useId();
  const problemId = useId();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [intent, setIntent] = useState<CreatePollIntent | null>(null);
  const [problem, setProblem] = useState<MessageId | null>(null);
  const create = useMutation({
    mutationFn: createPoll,
    onSuccess: () => {
      setIntent(null); setQuestion(""); setOptions(["", ""]); setKey(crypto.randomUUID());
      void queryClient.invalidateQueries({ queryKey: ["spacePolls", user.id, space.id] });
      onCreated();
    },
    // A definite refusal frees the form with a new key; an unconfirmed outcome keeps the same key and text for a safe retry.
    onError: error => { if (!isUnknown(error)) { setIntent(null); setKey(crypto.randomUUID()); } },
  });
  useEffect(() => { if (sessionLost(create.error)) { queryClient.clear(); window.location.replace("/login"); } }, [create.error, queryClient]);
  const locked = create.isPending || (create.isError && isUnknown(create.error) && intent !== null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    if (intent) { create.mutate(intent); return; }
    const cleaned = options.map(option => option.trim()).filter(Boolean);
    if (cleaned.length < MIN_OPTIONS) { setProblem("polls.optionsRequired"); return; }
    if (new Set(cleaned.map(option => option.toLocaleLowerCase())).size !== cleaned.length) { setProblem("polls.optionsDifferent"); return; }
    setProblem(null);
    const next = { accountId: user.id, spaceId: space.id, question: question.trim(), options: cleaned, key };
    setIntent(next);
    create.mutate(next);
  };
  const edit = (index: number, value: string) => { setProblem(null); create.reset(); setOptions(current => current.map((item, at) => at === index ? value : item)); };
  return <section className={styles.panel} aria-labelledby={`${questionId}-title`}>
    <h2 id={`${questionId}-title`}>{t("polls.newTitle")}</h2>
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field} htmlFor={questionId}>{t("polls.question")}</label>
      <input id={questionId} className={styles.input} value={question} required maxLength={MAX_QUESTION} disabled={locked} aria-describedby={hintId}
        onChange={event => { create.reset(); setQuestion(event.target.value); }} />
      <p id={hintId} className={styles.hint}>{t("polls.questionHint")}</p>
      <ol className={styles.optionInputs} aria-describedby={problem ? problemId : undefined}>
        {options.map((option, index) => <li key={index}>
          <input className={styles.input} value={option} maxLength={MAX_OPTION} disabled={locked}
            aria-label={t("polls.option", { number: String(index + 1) })} placeholder={t("polls.option", { number: String(index + 1) })}
            onChange={event => edit(index, event.target.value)} />
          {options.length > MIN_OPTIONS && <button type="button" className="icon-button" disabled={locked}
            aria-label={t("polls.removeOption", { number: String(index + 1) })} title={t("polls.removeOption", { number: String(index + 1) })}
            onClick={() => { setProblem(null); setOptions(current => current.filter((_item, at) => at !== index)); }}><X size={18} aria-hidden /></button>}
        </li>)}
      </ol>
      {problem && <p id={problemId} className="message error" role="alert">{t(problem)}</p>}
      {create.isError && <p className="message error" role="alert">{problemText(create.error, t("polls.loadError"), t)}</p>}
      <div className={styles.actions}>
        {options.length < MAX_OPTIONS && <button type="button" className="secondary-button" disabled={locked}
          onClick={() => setOptions(current => [...current, ""])}><Plus size={17} aria-hidden />{t("polls.addOption")}</button>}
        <button className="primary-button" disabled={create.isPending || characters(question.trim()) === 0}>
          {create.isPending ? <><LoaderCircle className="spin" size={17} aria-hidden />{t("polls.creating")}</> : <><Vote size={17} aria-hidden />{t("polls.create")}</>}
        </button>
      </div>
    </form>
  </section>;
}

function PollList({ user, space, onNotice }: { user: Account; space: ListedSpace; onNotice: (id: MessageId) => void }) {
  const t = useText();
  const queryClient = useQueryClient();
  const live = useLiveConnected();
  const headingId = useId();
  const [status, setStatus] = useState<PollStatus>("open");
  const queryKey = ["spacePolls", user.id, space.id, status];
  const polls = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => listPolls(user.id, space.id, status, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.next,
    // Live hints refresh the list; without them, a slower read keeps votes from others current.
    refetchInterval: live ? false : 15000,
  });
  useEffect(() => { if (sessionLost(polls.error)) { queryClient.clear(); window.location.replace("/login"); } }, [polls.error, queryClient]);
  const items = polls.data?.pages.flatMap(page => page.polls) ?? [];
  const cursorLost = polls.error instanceof ApiError && polls.error.code.startsWith("CURSOR_");
  return <section className={styles.panel} aria-labelledby={headingId}>
    <div className={styles.listHeader}>
      <h2 id={headingId}>{t(status === "open" ? "polls.open" : "polls.closed")}</h2>
      <div className={styles.filter} role="group" aria-label={t("polls.filter")}>
        {(["open", "closed"] as const).map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>
          {t(value === "open" ? "polls.open" : "polls.closed")}
        </button>)}
      </div>
    </div>
    {polls.isPending && <p role="status" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("polls.loading")}</p>}
    {polls.isError && <div className="message error" role="alert">{problemText(polls.error, t("polls.loadError"), t)}
      <button className="text-button" onClick={() => { void (cursorLost ? queryClient.resetQueries({ queryKey }) : polls.refetch()); }}><RefreshCw size={16} aria-hidden />{t("polls.retry")}</button></div>}
    {polls.isSuccess && items.length === 0 && <p className={styles.empty}>{t(status === "open" ? "polls.emptyOpen" : "polls.emptyClosed")}</p>}
    {items.length > 0 && <ul className={styles.list}>
      {items.map(poll => <li key={poll.id}><PollCard user={user} poll={poll} onNotice={onNotice} /></li>)}
    </ul>}
    {polls.hasNextPage && !polls.isError && <button type="button" className="secondary-button" disabled={polls.isFetchingNextPage} onClick={() => { void polls.fetchNextPage(); }}>
      {polls.isFetchingNextPage && <LoaderCircle className="spin" size={17} aria-hidden />}{t("polls.more")}
    </button>}
  </section>;
}

type Action = { kind: "vote"; optionId: string } | { kind: "withdraw" } | { kind: "close" };

function PollCard({ user, poll, onNotice }: { user: Account; poll: SpacePoll; onNotice: (id: MessageId) => void }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const time = new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium", timeStyle: "short" });
  const act = useMutation({
    mutationFn: (action: Action) => action.kind === "vote" ? vote(user.id, poll, action.optionId)
      : action.kind === "withdraw" ? withdrawVote(user.id, poll) : closePoll(user.id, poll),
    onSuccess: (_updated, action) => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["spacePolls", user.id, poll.space_id] });
      if (action.kind === "close") onNotice("polls.closedNow");
    },
    onError: error => {
      // The poll closed or changed meanwhile: read it again so the card shows what is true now.
      if (!isUnknown(error)) void queryClient.invalidateQueries({ queryKey: ["spacePolls", user.id, poll.space_id] });
    },
  });
  useEffect(() => { if (sessionLost(act.error)) { queryClient.clear(); window.location.replace("/login"); } }, [act.error, queryClient]);
  const busy = act.isPending;
  const leaders = new Set(poll.leading_option_ids);
  const tied = leaders.size > 1;
  const lead: MessageId = tied ? "polls.tied" : poll.status === "open" ? "polls.leading" : "polls.winner";
  const total = poll.total_votes;
  const pending = act.isPending && act.variables?.kind === "vote" ? act.variables.optionId : null;
  return <article className={styles.card} aria-labelledby={titleId} aria-busy={busy}>
    <h3 id={titleId} className={styles.question}>{poll.question}</h3>
    <p className={styles.meta}>
      <span>{t("polls.askedBy", { name: poll.created_by_name })}</span>
      <span>{total === 0 ? t("polls.noVotes") : total === 1 ? t("polls.votesOne") : t("polls.votesOther", { count: String(total) })}</span>
      {poll.status === "open" && poll.closes_at && <span><time dateTime={poll.closes_at}>{t("polls.closesAt", { time: time.format(new Date(poll.closes_at)) })}</time></span>}
      {poll.status === "closed" && poll.closed_at && <span><time dateTime={poll.closed_at}>{t("polls.closedAt", { time: time.format(new Date(poll.closed_at)) })}</time></span>}
    </p>
    <ul className={styles.choices}>
      {poll.options.map(option => {
        const share = total === 0 ? 0 : Math.round(option.votes * 100 / total);
        const mine = poll.my_option_id === option.id;
        const leading = leaders.has(option.id);
        const body = <>
          <span className={styles.choiceTop}>
            <span className={styles.choiceLabel}>{option.label}</span>
            {mine && <span className={styles.badge}><Check size={14} aria-hidden />{t("polls.yourVote")}</span>}
            {leading && <span className={`${styles.badge} ${styles.lead}`}><Trophy size={14} aria-hidden />{t(lead)}</span>}
            <span className={styles.count}>{pending === option.id ? <LoaderCircle className="spin" size={15} aria-hidden /> : null}{option.votes} · {share}%</span>
          </span>
          <span className={styles.bar} aria-hidden><span style={{ "--share": share } as React.CSSProperties} /></span>
        </>;
        return <li key={option.id}>
          {poll.can_vote
            ? <button type="button" className={styles.choice} aria-pressed={mine} disabled={busy}
              onClick={() => { if (!mine) act.mutate({ kind: "vote", optionId: option.id }); }}>{body}</button>
            : <div className={styles.choice} data-mine={mine || undefined}>{body}</div>}
        </li>;
      })}
    </ul>
    {act.isError && <p className="message error" role="alert">{problemText(act.error, t("polls.loadError"), t)}</p>}
    {(poll.can_vote && poll.my_option_id || poll.can_close) && <div className={styles.actions}>
      {poll.can_vote && poll.my_option_id && <button type="button" className="text-button" disabled={busy} onClick={() => act.mutate({ kind: "withdraw" })}>
        <Undo2 size={16} aria-hidden />{t("polls.withdraw")}</button>}
      {poll.can_close && !confirming && <button type="button" className="secondary-button" disabled={busy} onClick={() => { act.reset(); setConfirming(true); }}>
        {t("polls.close")}</button>}
    </div>}
    {poll.can_close && confirming && <div className={styles.confirm} role="group" aria-label={t("polls.close")}>
      <p>{t("polls.closeConfirm")}</p>
      <div className={styles.actions}>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirming(false)}>{t("polls.closeKeep")}</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => act.mutate({ kind: "close" })}>
          {busy && act.variables?.kind === "close" ? <><LoaderCircle className="spin" size={17} aria-hidden />{t("polls.saving")}</> : t("polls.close")}
        </button>
      </div>
    </div>}
  </article>;
}
