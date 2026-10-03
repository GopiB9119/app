"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, RefreshCw, Save, VolumeX } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import { INTEREST_LIMITS, isUnknown, readInterests, saveInterests } from "./client";
import type { InterestChoices, Interests } from "./client";
import { Failure, Loading, problemText, sessionLost, useViewer } from "./shared";
import { TaxonomyStatus, TermMultiPicker, unavailableTerms, useTaxonomy } from "./taxonomy-controls";
import styles from "./community.module.css";

const fields = [
  { field: "topics", dimension: "topic", label: "community.taxonomy.topics" },
  { field: "interests", dimension: "interest", label: "community.taxonomy.interests" },
  { field: "languages", dimension: "language", label: "community.taxonomy.languages" },
  { field: "places", dimension: "place", label: "community.taxonomy.places" },
] as const;
const choicesOf = ({ topics, interests, languages, places }: Interests): InterestChoices => ({ topics, interests, languages, places });

export function InterestsScreen() {
  const t = useText();
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut || sessionLost(viewer.error)) window.location.replace("/login"); }, [viewer.signedOut, viewer.error]);
  if (viewer.pending || viewer.signedOut || sessionLost(viewer.error)) return <Loading label={t("community.interests.loading")} />;
  if (!viewer.account) return <Shell><main className={styles.main}><Failure error={viewer.error} retry={viewer.retry} /></main></Shell>;
  return <InterestsView key={viewer.account.id} account={viewer.account} />;
}

function InterestsView({ account }: { account: Account }) {
  const t = useText();
  const queryClient = useQueryClient();
  const vocabulary = useTaxonomy();
  const interests = useQuery({ queryKey: ["interests", account.id], queryFn: ({ signal }) => readInterests(account.id, signal), networkMode: "always", retry: false });
  useEffect(() => {
    if (sessionLost(interests.error)) { queryClient.clear(); window.location.replace("/login"); }
  }, [interests.error, queryClient]);
  return <Shell account><main className={`${styles.main} ${styles.vocabularyScreen}`}>
    <nav className={styles.navigation} aria-label={t("community.profile")}><Link href="/app/settings/account"><ArrowLeft size={18} aria-hidden />{t("community.account")}</Link><Link href="/app/settings/feed"><VolumeX size={18} aria-hidden />{t("community.feedControls.title")}</Link></nav>
    <h1>{t("community.interests.title")}</h1>
    <p className={styles.body}>{t("community.interests.privacy")}</p>
    {interests.isPending && <p role="status" aria-busy="true">{t("community.interests.loading")}</p>}
    {interests.isError && !sessionLost(interests.error) && <Failure error={interests.error} retry={() => interests.refetch()} />}
    {interests.data && !interests.isError && <InterestsEditor account={account} shown={interests.data} vocabulary={vocabulary} />}
  </main></Shell>;
}

function InterestsEditor({ account, shown, vocabulary }: { account: Account; shown: Interests; vocabulary: ReturnType<typeof useTaxonomy> }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [reviewed, setReviewed] = useState(shown);
  const [draft, setDraft] = useState(() => choicesOf(shown));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [saved, setSaved] = useState(false);
  const [denied, setDenied] = useState(false);
  const changed = fields.some(({ field }) => JSON.stringify(draft[field]) !== JSON.stringify(reviewed[field]));
  const terms = vocabulary.data ?? [];
  useEffect(() => {
    if (!changed && !busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, busy]);

  function reject(problem: unknown) {
    if (sessionLost(problem)) {
      setDenied(true); queryClient.clear(); window.location.replace("/login"); return;
    }
    setError(problem);
    setNeedsReload(isUnknown(problem) || (problem instanceof ApiError && [412, 428].includes(problem.status)));
  }

  async function accept(result: Interests) {
    await queryClient.cancelQueries({ queryKey: ["interests", account.id] });
    queryClient.setQueryData(["interests", account.id], result);
    setReviewed(result); setDraft(choicesOf(result)); setNeedsReload(false); setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || needsReload || !changed || !vocabulary.data || vocabulary.isError) return;
    setBusy(true); setSaved(false); setError(null);
    try {
      await accept(await saveInterests(account.id, reviewed, draft));
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["suggested-pages", account.id] });
    } catch (problem) {
      reject(problem);
      if (problem instanceof ApiError && problem.code === "TERM_UNAVAILABLE") void vocabulary.refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function reload() {
    if (busy || (changed && !window.confirm(t("community.interests.reloadConfirm")))) return;
    setBusy(true); setSaved(false);
    try { await accept(await readInterests(account.id)); }
    catch (problem) { reject(problem); }
    finally { setBusy(false); }
  }

  if (denied) return null;
  const errorText = !error ? "" : unavailableTerms(error, terms, language, t)
    ?? (error instanceof ApiError && error.status === 412 ? t("community.interests.conflict")
      : error instanceof ApiError && error.status === 428 ? t("community.interests.versionMissing")
        : isUnknown(error) ? t("community.interests.unknown") : problemText(error, t("community.interests.saveFailed"), t));
  return <form className={styles.vocabularyForm} aria-label={t("community.interests.title")} onSubmit={save}>
    <TaxonomyStatus vocabulary={vocabulary} />
    {errorText && <div className="message error" role="alert">{errorText}</div>}
    {saved && <p className="message success" role="status">{t("community.interests.saved")}</p>}
    {fields.map(({ field, dimension, label }) => <TermMultiPicker key={field} terms={terms} dimension={dimension} label={t(label)}
      selected={draft[field]} maximum={INTEREST_LIMITS[field]} disabled={busy || needsReload || !vocabulary.data || vocabulary.isError}
      onChange={codes => { setDraft({ ...draft, [field]: codes }); setSaved(false); }} />)}
    <div className={styles.actions}>
      <button type="submit" className="primary-button" disabled={busy || needsReload || !changed || !vocabulary.data || vocabulary.isError}>
        {busy ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Save size={17} aria-hidden />}{t("community.interests.save")}
      </button>
      {(changed || needsReload) && <button type="button" className="secondary-button" disabled={busy} onClick={reload}><RefreshCw size={17} aria-hidden />{t("community.interests.reload")}</button>}
    </div>
  </form>;
}