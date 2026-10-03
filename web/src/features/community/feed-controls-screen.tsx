"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ListFilter, RefreshCw, ShieldBan, Undo2, VolumeX } from "lucide-react";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { feedControls, termLabel } from "./client";
import type { FeedControl, TaxonomyTerm } from "./client";
import { FeedControlFeedback, useFeedControlActions } from "./feed-controls";
import { Failure, Loading, sessionLost, useCommunityTime, useViewer } from "./shared";
import { TaxonomyStatus, useTaxonomy } from "./taxonomy-controls";
import styles from "./community.module.css";

const sections = [
  { kind: "mute_page", title: "community.feedControls.mutedPages", empty: "community.feedControls.emptyPages" },
  { kind: "mute_term", title: "community.feedControls.mutedTerms", empty: "community.feedControls.emptyTerms" },
  { kind: "hide_post", title: "community.feedControls.hiddenPosts", empty: "community.feedControls.emptyPosts" },
  { kind: "hide_suggestion", title: "community.feedControls.hiddenSuggestions", empty: "community.feedControls.emptySuggestions" },
] as const;

export function FeedControlsScreen() {
  const t = useText();
  const viewer = useViewer();
  const denied = viewer.signedOut || sessionLost(viewer.error);
  useEffect(() => { if (denied) window.location.replace("/login"); }, [denied]);
  if (viewer.pending || denied) return <Loading label={t("community.feedControls.loading")} />;
  if (!viewer.account) return <Shell><main className={styles.main}><Failure error={viewer.error} retry={viewer.retry} /></main></Shell>;
  return <FeedControlsView key={viewer.account.id} account={viewer.account} />;
}

function FeedControlsView({ account }: { account: Account }) {
  const t = useText();
  const queryClient = useQueryClient();
  const vocabulary = useTaxonomy();
  const actions = useFeedControlActions(account.id);
  const controls = useQuery({
    queryKey: ["feed-controls", account.id], queryFn: ({ signal }) => feedControls(account.id, signal), networkMode: "always", retry: false,
  });
  const denied = sessionLost(controls.error);
  useEffect(() => { if (denied) { queryClient.clear(); window.location.replace("/login"); } }, [denied, queryClient]);
  if (denied) return <Loading label={t("community.feedControls.loading")} />;
  return <Shell account><main className={`${styles.main} ${styles.vocabularyScreen} ${styles.feedSettings}`}>
    <nav className={styles.navigation} aria-label={t("community.profile")}>
      <Link href="/app/settings/account"><ArrowLeft size={18} aria-hidden />{t("community.account")}</Link>
      <Link href="/app/settings/interests"><ListFilter size={18} aria-hidden />{t("community.interests.title")}</Link>
      <span aria-current="page"><VolumeX size={18} aria-hidden />{t("community.feedControls.title")}</span>
      <Link href="/app/safety"><ShieldBan size={18} aria-hidden />{t("community.blocked")}</Link>
    </nav>
    <div className={styles.heading}>
      <h1>{t("community.feedControls.title")}</h1>
      <button type="button" className="icon-button" title={t("community.feedControls.refresh")} aria-label={t("community.feedControls.refresh")}
        disabled={controls.isFetching || actions.busy} onClick={() => controls.refetch()}><RefreshCw size={18} aria-hidden /></button>
    </div>
    <FeedControlFeedback controls={actions} />
    {controls.isPending && <p role="status" aria-busy="true">{t("community.feedControls.loading")}</p>}
    {controls.isError && <Failure error={controls.error} retry={() => controls.refetch()} />}
    {controls.isSuccess && <>
      {controls.data.some(control => control.kind === "mute_term") && <TaxonomyStatus vocabulary={vocabulary} />}
      {sections.map(section => {
        const items = controls.data.filter(control => control.kind === section.kind);
        return <section key={section.kind} className={styles.stack} aria-labelledby={`feed-controls-${section.kind}`}>
          <h2 id={`feed-controls-${section.kind}`}>{t(section.title)}</h2>
          {items.length === 0 ? <p className={styles.empty}>{t(section.empty)}</p> : <ul className={styles.list} aria-label={t(section.title)}>
            {items.map(control => <ControlRow key={control.id} control={control} terms={vocabulary.data ?? []} busy={actions.busy} undo={() => actions.undo(control.id)} />)}
          </ul>}
        </section>;
      })}
    </>}
  </main></Shell>;
}

function ControlRow({ control, terms, busy, undo }: { control: FeedControl; terms: TaxonomyTerm[]; busy: boolean; undo: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const time = useCommunityTime();
  const label = control.kind === "mute_term" && control.dimension && control.code ? termLabel(terms, control.dimension, control.code, language)
    : control.kind === "hide_post" ? control.post_available ? control.post_title ?? t("community.feedControls.untitled") : t("community.feedControls.unavailable")
      : control.page_name ?? t("community.feedControls.unavailable");
  const href = control.kind === "hide_post" ? control.post_available && control.post_id ? `/posts/${control.post_id}` : null
    : control.page_handle ? `/pages/${control.page_handle}` : null;
  return <li className={styles.row}>
    <span className={styles.feedControlLabel}>
      {href ? <Link href={href}>{label}</Link> : <strong>{label}</strong>}
      {control.kind === "hide_post" && control.page_name && <span>{control.page_name}</span>}
      <time className={styles.meta} dateTime={control.created_at}>{time.format(new Date(control.created_at))}</time>
    </span>
    <button type="button" className="secondary-button" disabled={busy} onClick={undo} aria-label={t("community.feedControls.undoName", { name: label })}>
      <Undo2 size={17} aria-hidden />{t("community.feedControls.undo")}
    </button>
  </li>;
}