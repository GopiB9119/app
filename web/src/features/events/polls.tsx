"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChartNoAxesColumn, Check, ChevronDown, ChevronUp, LoaderCircle, LockKeyhole, Plus, RefreshCw, Undo2, X } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { ApiError, characters } from "@/features/identity/client";
import { isUnknown } from "@/features/community/client";
import { sessionLost } from "@/features/community/shared";
import { useText } from "@/features/i18n/i18n";
import type { MessageId } from "@/features/i18n/messages";
import { MAX_EVENT_POLLS, MAX_POLL_OPTION, MAX_POLL_OPTIONS, MAX_POLL_QUESTION, closeEventPoll, createEventPoll, listEventPolls, pollBody, validPollBody, voteEventPoll } from "./client";
import type { PollBody, PollCloseIntent, PollCreateIntent, PollView, PollVoteIntent, SpaceEvent } from "./client";
import styles from "./events.module.css";

type PollAction =
  | { kind: "create"; intent: PollCreateIntent }
  | { kind: "vote"; intent: PollVoteIntent; poll: PollView }
  | { kind: "close"; intent: PollCloseIntent; poll: PollView };
export type PollWork = { action: PollAction; state: "sending" | "unknown" | "rejected"; error?: unknown };

const denied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
function problemId(error: unknown): MessageId {
  if (denied(error)) return "events.polls.denied";
  if (isUnknown(error)) return "events.polls.unknown";
  if (error instanceof ApiError) {
    if (["POLL_CHANGED", "POLL_VOTE_CHANGED", "IDEMPOTENCY_CONFLICT", "PRECONDITION_REQUIRED"].includes(error.code)) return "events.polls.conflict";
    if (["POLL_CLOSED", "EVENT_CLOSED"].includes(error.code)) return "events.polls.readOnly";
    if (error.code === "POLL_LIMIT_REACHED") return "events.polls.limit";
  }
  return "events.polls.writeProblem";
}

export function EventPolls({ accountId, event, eventReady, work, onWork, onRefreshEvent }: {
  accountId: string; event: SpaceEvent; eventReady: boolean; work: PollWork | null;
  onWork: (work: PollWork | null) => void; onRefreshEvent: () => Promise<boolean>;
}) {
  const t = useText();
  const queryClient = useQueryClient();
  const sectionId = useId();
  const form = useRef<HTMLFormElement>(null);
  const sending = useRef(false);
  const [expanded, setExpanded] = useState(Boolean(work));
  const [dialog, setDialog] = useState<"create" | PollAction | null>(null);
  const [draft, setDraft] = useState<PollBody>({ question: "", options: ["", ""] });
  const [invalid, setInvalid] = useState(false);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<MessageId | null>(null);
  const queryKey = ["eventPolls", accountId, event.id];
  const polls = useQuery({
    queryKey, queryFn: ({ signal }) => listEventPolls(accountId, event.id, signal),
    enabled: expanded && work?.state !== "sending", retry: false, staleTime: 0, refetchOnWindowFocus: false,
  });
  const save = useMutation({
    mutationFn: (action: PollAction) => action.kind === "create" ? createEventPoll(action.intent)
      : action.kind === "vote" ? voteEventPoll(action.intent) : closeEventPoll(action.intent),
    retry: false,
    onSuccess: async (value, action) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<PollView[]>(queryKey, previous => {
        const current = previous ?? [];
        return current.some(poll => poll.id === value.id) ? current.map(poll => poll.id === value.id ? value : poll) : [...current, value];
      });
      onWork(null);
      setDialog(null);
      if (action.kind === "create") setDraft({ question: "", options: ["", ""] });
      setNotice(action.kind === "create" ? "events.polls.created" : action.kind === "close" ? "events.polls.closedConfirmed"
        : action.intent.body.option_id !== value.my_option_id ? "events.polls.currentReturned"
        : value.my_option_id === null ? "events.polls.withdrawn" : "events.polls.saved");
    },
    onError: (error, action) => onWork({ action, state: isUnknown(error) ? "unknown" : "rejected", error }),
    onSettled: () => { sending.current = false; },
  });
  const busy = work?.state === "sending" || save.isPending;
  const accessible = polls.isSuccess && !denied(work?.error) && !sessionLost(work?.error);
  const ready = accessible && eventReady && !polls.isFetching && !refreshing;
  const active = event.status === "scheduled" && !event.ended;
  const closeReview = dialog && dialog !== "create" && dialog.kind === "close" ? dialog : null;
  const reviewedPoll = closeReview ? polls.data?.find(poll => poll.id === closeReview.intent.pollId) : undefined;
  const staleCloseReview = Boolean(closeReview && !work && !busy && polls.isSuccess && !polls.isFetching
    && (!reviewedPoll || !reviewedPoll.can_close || reviewedPoll.etag !== closeReview.intent.etag
      || reviewedPoll.question !== closeReview.poll.question || reviewedPoll.total_votes !== closeReview.poll.total_votes
      || reviewedPoll.options.length !== closeReview.poll.options.length
      || reviewedPoll.options.some((option, index) => {
        const previous = closeReview.poll.options[index];
        return option.id !== previous?.id || option.text !== previous.text || option.votes !== previous.votes;
      })));
  useEffect(() => {
    if (staleCloseReview) setDialog(current => current && current !== "create" && current.kind === "close" ? null : current);
  }, [staleCloseReview]);
  const canCreate = ready && active && event.can_manage && !work && polls.data.length < MAX_EVENT_POLLS;
  const canSend = (action: PollAction) => {
    if (!ready || action.intent.accountId !== accountId || action.intent.eventId !== event.id) return false;
    const replay = work?.state === "unknown" && work.action === action;
    if (replay) return action.kind === "create" || polls.data.some(poll => poll.id === action.intent.pollId);
    if (!active) return false;
    if (action.kind === "create") return event.can_manage && polls.data.length < MAX_EVENT_POLLS;
    const current = polls.data.find(poll => poll.id === action.intent.pollId);
    return action.kind === "vote" ? Boolean(current?.can_vote)
      : Boolean(event.can_manage && current?.can_close && current.etag === action.intent.etag);
  };
  const send = (action: PollAction) => {
    if (busy || sending.current || !canSend(action) || (work && (work.state !== "unknown" || work.action !== action))) return;
    sending.current = true;
    setNotice(null);
    onWork({ action, state: "sending" });
    save.mutate(action);
  };
  const refresh = async () => {
    if (busy || refreshing) return;
    setRefreshing(true);
    setNotice(null);
    try {
      const [listed, eventLoaded] = await Promise.all([polls.refetch(), onRefreshEvent()]);
      if (eventLoaded && listed.isSuccess && work?.state === "rejected") {
        onWork(null);
        setDialog(null);
      }
    } finally { setRefreshing(false); }
  };
  useEffect(() => {
    if (sessionLost(polls.error) || sessionLost(work?.error)) { queryClient.clear(); window.location.replace("/login"); }
  }, [polls.error, work?.error, queryClient]);
  useEffect(() => {
    if (!dialog || dialog === "create" || dialog.kind !== "close" || work || !polls.isSuccess || polls.isFetching) return;
    const current = polls.data.find(poll => poll.id === dialog.intent.pollId);
    if (!current || JSON.stringify(current) !== JSON.stringify(dialog.poll)) {
      setDialog(null);
      setNotice("events.polls.conflict");
    }
  }, [dialog, work, polls.data, polls.isSuccess, polls.isFetching]);
  useEffect(() => {
    if (!focusField) return;
    const target = form.current?.elements.namedItem(focusField);
    if (target instanceof HTMLElement) target.focus();
    setFocusField(null);
  }, [focusField]);

  const reviewCreate = (change: React.FormEvent) => {
    change.preventDefault();
    if (!canCreate) return;
    const body = pollBody(draft.question, draft.options);
    if (!validPollBody(body)) {
      setInvalid(true);
      const option = body.options.findIndex(text => !text || characters(text) > MAX_POLL_OPTION);
      setFocusField(!body.question || characters(body.question) > MAX_POLL_QUESTION ? "poll_question" : `poll_option_${Math.max(option, 0)}`);
      return;
    }
    setInvalid(false);
    setDialog({ kind: "create", intent: { accountId, eventId: event.id, key: crypto.randomUUID(), body } });
  };
  const vote = (poll: PollView, optionId: string | null) => send({ kind: "vote", poll,
    intent: { accountId, eventId: event.id, pollId: poll.id, key: crypto.randomUUID(), voteEtag: poll.vote_etag, body: { option_id: optionId } },
  });
  const readProblem = polls.isError ? t(denied(polls.error) ? "events.polls.denied" : "events.polls.loadProblem") : null;
  const canReadAction = (action: PollAction) => action.intent.accountId === accountId && action.intent.eventId === event.id
    && (action.kind === "create" || Boolean(polls.data?.some(poll => poll.id === action.intent.pollId)));
  const dialogTargetMissing = dialog && dialog !== "create" && !canReadAction(dialog);
  const recovery = work && <div className={styles.pollRecovery} role={work.state === "sending" ? "status" : "alert"}>
    <p>{t(work.state === "sending" ? "events.saving" : problemId(work.error), { limit: MAX_EVENT_POLLS })}</p>
    {accessible && canReadAction(work.action) && <ActionSummary action={work.action} />}
    <div className={styles.actions}>
      {work.state === "unknown" && <button type="button" className="primary-button" aria-label={t("events.polls.retryExact")} title={t("events.polls.retryExact")}
        disabled={busy || !canSend(work.action)} onClick={() => send(work.action)}><RefreshCw size={16} aria-hidden />{t("events.retry")}</button>}
      {work.state !== "sending" && <button type="button" className="secondary-button" disabled={polls.isFetching || refreshing || !eventReady} onClick={() => void refresh()}>
        <RefreshCw size={16} aria-hidden />{t("events.polls.reload")}</button>}
    </div>
  </div>;

  return <section className={styles.polls} aria-label={t("events.polls.title")} data-testid="event-polls" onKeyDown={change => {
    if (change.key !== "Tab" || !(change.target instanceof HTMLElement)) return;
    const modal = change.target.closest("dialog");
    if (!modal) return;
    const controls = [...modal.querySelectorAll<HTMLElement>("button:enabled, input:enabled")];
    const first = controls[0], last = controls.at(-1);
    if (first && last && ((change.shiftKey && change.target === first) || (!change.shiftKey && change.target === last))) {
      change.preventDefault();
      (change.shiftKey ? last : first).focus();
    }
  }}>
    <div className={styles.pollHeader}>
      <button type="button" className="secondary-button" aria-expanded={expanded} aria-controls={sectionId} disabled={busy}
        onClick={() => { if (!expanded) void onRefreshEvent(); setExpanded(!expanded); }}>
        <ChartNoAxesColumn size={18} aria-hidden />{t("events.polls.title")}{expanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {expanded && <button type="button" className="icon-button" aria-label={t("events.polls.refresh")} title={t("events.polls.refresh")}
        disabled={busy || polls.isFetching || refreshing || !eventReady} onClick={() => void refresh()}><RefreshCw size={18} aria-hidden /></button>}
    </div>
    {expanded && <div id={sectionId} className={styles.pollContent}>
      {(polls.isPending || polls.isFetching || refreshing || !eventReady) && <p role="status"><LoaderCircle size={16} className="spin" aria-hidden />{t("events.polls.loading")}</p>}
      {readProblem && <div className={styles.pollRecovery} role="alert"><p>{readProblem}</p>
        <button className="secondary-button" disabled={polls.isFetching || refreshing || busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t("events.retry")}</button>
      </div>}
      {!dialog && recovery}
      {notice && accessible && <p role="status">{t(notice)}</p>}
      {accessible && <>
        {!active && <p className={styles.notice}>{t("events.polls.readOnly")}</p>}
        {polls.data.length === 0 && <p>{t("events.polls.empty")}</p>}
        {active && event.can_manage && polls.data.length >= MAX_EVENT_POLLS && <p>{t("events.polls.limit", { limit: MAX_EVENT_POLLS })}</p>}
        {active && event.can_manage && polls.data.length < MAX_EVENT_POLLS && <div className={styles.actions}>
          <button className="secondary-button" disabled={!canCreate} onClick={() => { setInvalid(false); setDialog("create"); }}><Plus size={16} aria-hidden />{t("events.polls.new")}</button>
        </div>}
        <ul className={styles.pollList}>{polls.data.map(poll => <PollBallot key={`${poll.id}:${poll.vote_etag}:${poll.status}`} poll={poll}
          active={active} disabled={!ready || Boolean(work)} manager={event.can_manage} onVote={optionId => vote(poll, optionId)}
          onClose={() => setDialog({ kind: "close", poll, intent: { accountId, eventId: event.id, pollId: poll.id, etag: poll.etag! } })} />)}</ul>
      </>}
    </div>}
    {dialog && !staleCloseReview && <Dialog className={styles.pollDialog} title={t(dialog === "create" ? "events.polls.new" : dialog.kind === "create" ? "events.polls.reviewCreate" : "events.polls.reviewClose")}
      closeLabel={t("events.polls.closeDialog")} locked={busy} onClose={() => setDialog(null)}>
      <div className={styles.pollContent}>
        {!accessible || !eventReady || dialogTargetMissing ? <>
          <p role="alert">{readProblem ?? t(denied(work?.error) || dialogTargetMissing ? "events.polls.denied" : "events.polls.loading")}</p>
          {recovery}
          {!work && <button className="secondary-button" disabled={busy || polls.isFetching || refreshing} onClick={() => void refresh()}>{t("events.retry")}</button>}
        </> : !active || !event.can_manage ? <><p role="alert">{t(active ? "events.polls.manageDenied" : "events.polls.readOnly")}</p>{recovery}</>
          : dialog === "create" ? <form ref={form} className={styles.pollContent} onSubmit={reviewCreate} noValidate>
            <p>{t("events.polls.forEvent", { title: event.title })}</p>
            {invalid && <p id={`${sectionId}-validation`} className="field-error" role="alert">{t("events.polls.validation")}</p>}
            <label className={styles.field}>{t("events.polls.question")}
              <input name="poll_question" value={draft.question} maxLength={MAX_POLL_QUESTION * 2} required disabled={!ready}
                aria-invalid={invalid} aria-describedby={`${sectionId}-question-count${invalid ? ` ${sectionId}-validation` : ""}`}
                onChange={change => { setDraft({ ...draft, question: change.target.value }); setInvalid(false); }} />
            </label>
            <p id={`${sectionId}-question-count`} className="field-hint">{t("events.characters", { count: characters(pollBody(draft.question, []).question), limit: MAX_POLL_QUESTION })}</p>
            {draft.options.map((text, index) => <div key={index} className={styles.pollDraftOption}>
              <label className={styles.field}>{t("events.polls.option", { number: index + 1 })}
                <input name={`poll_option_${index}`} value={text} maxLength={MAX_POLL_OPTION * 2} required disabled={!ready}
                  aria-invalid={invalid} aria-describedby={`${sectionId}-option-count-${index}${invalid ? ` ${sectionId}-validation` : ""}`}
                  onChange={change => { setDraft({ ...draft, options: draft.options.map((value, position) => position === index ? change.target.value : value) }); setInvalid(false); }} />
              </label>
              <button type="button" className="icon-button" disabled={!ready || draft.options.length <= 2} aria-label={t("events.polls.removeOption", { number: index + 1 })}
                title={t("events.polls.removeOption", { number: index + 1 })} onClick={() => {
                  setDraft({ ...draft, options: draft.options.filter((_, position) => position !== index) }); setInvalid(false);
                  setFocusField(`poll_option_${Math.max(0, index - 1)}`);
                }}><X size={18} aria-hidden /></button>
              <p id={`${sectionId}-option-count-${index}`} className="field-hint">{t("events.characters", { count: characters(pollBody("", [text]).options[0]), limit: MAX_POLL_OPTION })}</p>
            </div>)}
            <div className={styles.actions}>
              <button type="button" className="secondary-button" disabled={!ready || draft.options.length >= MAX_POLL_OPTIONS} onClick={() => {
                setDraft({ ...draft, options: [...draft.options, ""] }); setFocusField(`poll_option_${draft.options.length}`); setInvalid(false);
              }}><Plus size={16} aria-hidden />{t("events.polls.addOption")}</button>
              <button type="submit" className="primary-button" disabled={!canCreate}><Check size={16} aria-hidden />{t("events.polls.review")}</button>
            </div>
          </form> : <>
            <p>{t("events.polls.forEvent", { title: event.title })}</p>
            <ActionSummary action={dialog} />
            {dialog.kind === "close" && <p>{t("events.polls.closeWarning")}</p>}
            {recovery}
            {!work && <div className={styles.actions}>
              <button className="primary-button" disabled={!canSend(dialog)} onClick={() => send(dialog)}>
                {dialog.kind === "create" ? <Plus size={16} aria-hidden /> : <LockKeyhole size={16} aria-hidden />}{t(dialog.kind === "create" ? "events.polls.create" : "events.polls.close")}
              </button>
              {dialog.kind === "create" && <button className="secondary-button" onClick={() => setDialog("create")}><ArrowLeft size={16} aria-hidden />{t("events.polls.back")}</button>}
            </div>}
          </>}
      </div>
    </Dialog>}
  </section>;
}

function ActionSummary({ action }: { action: PollAction }) {
  const t = useText();
  if (action.kind === "create") return <div className={styles.pollSummary}><strong>{action.intent.body.question}</strong><ol>{action.intent.body.options.map((text, index) => <li key={index}>{text}</li>)}</ol></div>;
  return <div className={styles.pollSummary}><strong>{action.poll.question}</strong>
    {action.kind === "vote" ? <p>{action.intent.body.option_id === null ? t("events.polls.withdrawRequest")
      : t("events.polls.requested", { choice: action.poll.options.find(option => option.id === action.intent.body.option_id)?.text ?? "" })}</p>
      : <><p>{t("events.polls.total", { count: action.poll.total_votes })}</p><ul>{action.poll.options.map(option => <li key={option.id}>{option.text}: {option.votes}</li>)}</ul></>}
  </div>;
}

function PollBallot({ poll, active, disabled, manager, onVote, onClose }: {
  poll: PollView; active: boolean; disabled: boolean; manager: boolean; onVote: (optionId: string | null) => void; onClose: () => void;
}) {
  const t = useText();
  const fieldId = useId();
  const [choice, setChoice] = useState(poll.my_option_id);
  const canVote = active && poll.can_vote && poll.status === "open";
  const selected = poll.options.find(option => option.id === poll.my_option_id);
  return <li className={styles.pollItem}>
    <fieldset className={styles.pollBallot} disabled={disabled || !canVote} aria-describedby={`${fieldId}-current`}>
      <legend>{poll.question}</legend>
      <p className={styles.meta}>{t(!active || poll.status === "closed" ? "events.polls.closed" : "events.polls.open")}</p>
      {poll.options.map(option => <label key={option.id} className={styles.pollChoice}>
        <input type="radio" name={fieldId} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} />
        <span><span>{option.text}</span><span className={styles.pollCount}>{t("events.polls.votes", { count: option.votes })}</span></span>
      </label>)}
    </fieldset>
    <p id={`${fieldId}-current`}>{selected ? t("events.polls.current", { choice: selected.text }) : t("events.polls.noChoice")}</p>
    <p>{t("events.polls.total", { count: poll.total_votes })}</p>
    <div className={styles.actions}>
      {canVote && <>
        <button className="primary-button" aria-label={t("events.polls.saveChoice")} title={t("events.polls.saveChoice")}
          disabled={disabled || choice === null || choice === poll.my_option_id} onClick={() => onVote(choice)}><Check size={16} aria-hidden />{t("events.polls.save")}</button>
        {poll.my_option_id !== null && <button className="secondary-button" disabled={disabled} onClick={() => onVote(null)}><Undo2 size={16} aria-hidden />{t("events.polls.withdraw")}</button>}
      </>}
      {active && manager && poll.can_close && <button className="secondary-button" disabled={disabled} onClick={onClose}><LockKeyhole size={16} aria-hidden />{t("events.polls.close")}</button>}
    </div>
  </li>;
}