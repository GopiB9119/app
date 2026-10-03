"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, Query, QueryClient } from "@tanstack/react-query";
import { Ellipsis, EyeOff, Info, RefreshCw, Undo2, VolumeX } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { addFeedControl, removeFeedControl, termLabel } from "./client";
import type { FeedControl, FeedControlInput, InterestPost, PublicPost, SuggestedPage } from "./client";
import { problemText, sessionLost } from "./shared";
import { useTaxonomy } from "./taxonomy-controls";
import styles from "./community.module.css";

type PostPage<Item> = { items: Item[]; next: string | null };
type Command = { action: "add"; input: FeedControlInput } | { action: "remove"; id: string };

function postFeed(query: Query, accountId: string) {
  const [name, filter, account] = query.queryKey;
  return account === accountId && ((name === "community" && (filter === "following" || filter === "latest"))
    || (name === "discover-posts" && filter === ""));
}

function affectedFeed(query: Query, accountId: string) {
  const [name, account] = query.queryKey;
  return postFeed(query, accountId) || (account === accountId && ["interest-posts", "suggested-pages", "feed-controls"].includes(String(name)));
}

function removeFromFeeds(client: QueryClient, accountId: string, input: FeedControlInput) {
  const keepPost = (post: PublicPost) => {
    if (input.kind === "hide_post") return post.id !== input.post_id;
    if (input.kind === "mute_page") return post.page_id !== input.page_id;
    if (input.kind === "mute_term") return !(input.dimension === "topic" ? post.topics : post.interests).includes(input.code);
    return true;
  };
  client.setQueriesData<InfiniteData<PostPage<PublicPost>>>({ predicate: query => postFeed(query, accountId) }, data => data && ({
    ...data, pages: data.pages.map(page => ({ ...page, items: page.items.filter(keepPost) })),
  }));
  client.setQueriesData<InfiniteData<PostPage<InterestPost>>>({ queryKey: ["interest-posts", accountId] }, data => data && ({
    ...data, pages: data.pages.map(page => ({ ...page, items: page.items.filter(item => keepPost(item.post)) })),
  }));
  if (input.kind === "mute_page" || input.kind === "hide_suggestion") {
    client.setQueryData<{ ranking: "interests-1"; items: SuggestedPage[] }>(["suggested-pages", accountId], data => data && ({
      ...data, items: data.items.filter(item => item.page.id !== input.page_id),
    }));
  }
}

export function useFeedControlActions(accountId?: string) {
  const queryClient = useQueryClient();
  const active = useRef(true);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<FeedControl | null>(null);
  const [removed, setRemoved] = useState(false);
  const [failure, setFailure] = useState<{ error: unknown; command: Command } | null>(null);
  const [feedbackId, setFeedbackId] = useState(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function run(command: Command) {
    if (!accountId || running.current) return;
    running.current = true;
    setBusy(true); setFailure(null); setRemoved(false);
    try {
      const result = command.action === "add" ? await addFeedControl(accountId, command.input) : await removeFeedControl(accountId, command.id);
      if (!active.current) return;
      await queryClient.cancelQueries({ predicate: query => affectedFeed(query, accountId) });
      if (!active.current) return;
      if (command.action === "add") {
        const control = result as FeedControl;
        removeFromFeeds(queryClient, accountId, command.input);
        queryClient.setQueryData<FeedControl[]>(["feed-controls", accountId], data => data && [control, ...data.filter(item => item.id !== control.id)]);
        setNotice(control);
      } else {
        queryClient.setQueryData<FeedControl[]>(["feed-controls", accountId], data => data?.filter(item => item.id !== command.id));
        setNotice(null); setRemoved(true);
      }
      setFeedbackId(value => value + 1);
      await queryClient.invalidateQueries({ predicate: query => affectedFeed(query, accountId) });
    } catch (error) {
      if (!active.current) return;
      if (sessionLost(error)) { queryClient.clear(); window.location.replace("/login"); return; }
      setFailure({ error, command }); setFeedbackId(value => value + 1);
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  return {
    enabled: Boolean(accountId), busy, notice, removed, failure, feedbackId,
    add: (input: FeedControlInput) => run({ action: "add", input }),
    undo: (id: string) => run({ action: "remove", id }),
    retry: () => failure ? run(failure.command) : Promise.resolve(),
  };
}
export type FeedControlActions = ReturnType<typeof useFeedControlActions>;

export function FeedControlFeedback({ controls }: { controls: FeedControlActions }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (controls.feedbackId) feedback.current?.focus(); }, [controls.feedbackId]);
  const { notice, failure } = controls;
  let errorText = "";
  if (failure) {
    const error = failure.error;
    errorText = error instanceof ApiError && error.code === "OWN_CONTENT" ? t("community.feedControls.ownContent")
      : error instanceof ApiError && error.code === "FEED_CONTROL_LIMIT_REACHED" ? t("community.feedControls.limitReached")
        : error instanceof ApiError && error.code === "TERM_UNAVAILABLE" ? t("community.feedControls.termUnavailable")
          : problemText(error, t("community.feedControls.failed"), t);
  }
  if (!notice && !failure && !controls.removed) return null;
  const name = notice?.kind === "mute_term" && notice.dimension && notice.code
    ? termLabel(vocabulary.data ?? [], notice.dimension, notice.code, language)
    : notice?.page_name ?? t("community.feedControls.unavailable");
  return <div ref={feedback} tabIndex={-1} className={`${styles.stack} ${styles.feedFeedback}`}>
    {failure && <div className="message error" role="alert">{errorText}
      <button type="button" className="text-button" disabled={controls.busy} onClick={controls.retry}><RefreshCw size={17} aria-hidden />{t("community.retry")}</button>
    </div>}
    {notice && <div className={`${styles.notice} ${styles.actions}`} role="status">
      <span>{t(notice.kind === "hide_post" ? "community.feedControls.postHidden"
        : notice.kind === "hide_suggestion" ? "community.feedControls.suggestionHidden" : "community.feedControls.muted", { name })}</span>
      <button type="button" className="text-button" disabled={controls.busy} onClick={() => controls.undo(notice.id)}><Undo2 size={17} aria-hidden />{t("community.feedControls.undo")}</button>
    </div>}
    {controls.removed && <p className={styles.notice} role="status">{t("community.feedControls.undone")}</p>}
  </div>;
}

type MenuAction = { id: string; label: string; icon: React.ReactNode; run: () => void };

export function FeedMenu({ actions, why, busy }: { actions: MenuAction[]; why: React.ReactNode; busy: boolean }) {
  const t = useText();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const last = useRef(false);
  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[last.current ? items.length - 1 : 0]?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  function close() { setOpen(false); trigger.current?.focus(); }
  function closeExplanation() { dialog?.close(); setExplaining(false); trigger.current?.focus(); }
  function navigate(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === "Tab") { setOpen(false); trigger.current?.focus(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const current = items.findIndex(item => item === document.activeElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  }
  return <div className={styles.feedMenu} ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="icon-button" aria-label={t("community.feedControls.more")} title={t("community.feedControls.more")}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={busy}
      onClick={() => { last.current = false; setOpen(value => !value); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); last.current = event.key === "ArrowUp"; setOpen(true); }
      }}><Ellipsis size={18} aria-hidden /></button>
    {open && <div ref={menu} id={id} role="menu" aria-label={t("community.feedControls.more")} className={styles.feedMenuList} onKeyDown={navigate}>
      {actions.map(action => <button type="button" role="menuitem" tabIndex={-1} key={action.id} onClick={() => { close(); action.run(); }}>{action.icon}<span>{action.label}</span></button>)}
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { close(); setExplaining(true); }}><Info size={17} aria-hidden /><span>{t("community.feedControls.why")}</span></button>
    </div>}
    {explaining && <dialog ref={setDialog} className={`${styles.dialog} ${styles.feedWhy}`} aria-labelledby={`${id}-why`}
      onCancel={event => { event.preventDefault(); closeExplanation(); }}>
      <h2 id={`${id}-why`}>{t("community.feedControls.why")}</h2>
      {why}
      <div className="dialog-actions"><button type="button" className="primary-button" onClick={closeExplanation}>{t("community.close")}</button></div>
    </dialog>}
  </div>;
}

export function PostFeedMenu({ post, controls, why }: { post: PublicPost; controls: FeedControlActions; why: string }) {
  const t = useText();
  const { language } = useLanguage();
  const vocabulary = useTaxonomy();
  const actions: MenuAction[] = controls.enabled && !post.can_manage ? [
    { id: "hide_post", label: t("community.feedControls.notInterested"), icon: <EyeOff size={17} aria-hidden />, run: () => { void controls.add({ kind: "hide_post", post_id: post.id }); } },
    { id: "mute_page", label: t("community.feedControls.muteName", { name: post.page_name }), icon: <VolumeX size={17} aria-hidden />, run: () => { void controls.add({ kind: "mute_page", page_id: post.page_id }); } },
    ...(["topic", "interest"] as const).flatMap(dimension => (dimension === "topic" ? post.topics : post.interests).map(code => ({
      id: `${dimension}:${code}`,
      label: t("community.feedControls.muteName", { name: termLabel(vocabulary.data ?? [], dimension, code, language) }),
      icon: <VolumeX size={17} aria-hidden />,
      run: () => { void controls.add({ kind: "mute_term", dimension, code }); },
    }))),
  ] : [];
  return <FeedMenu actions={actions} why={<p className={styles.body}>{why}</p>} busy={controls.busy} />;
}