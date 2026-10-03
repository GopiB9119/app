"use client";

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { Language, MessageId } from "@/features/i18n/messages";
import { CLASSIFICATION_LIMITS, TAXONOMY_CACHE_TIME, readTaxonomy, termLabel, termName } from "./client";
import type { Classification, TaxonomyDimension, TaxonomyTerm } from "./client";
import styles from "./community.module.css";

export const classificationFields = {
  other_topics: { dimension: "topic", label: "community.taxonomy.otherTopics" },
  interests: { dimension: "interest", label: "community.taxonomy.interests" },
  languages: { dimension: "language", label: "community.taxonomy.languages" },
  places: { dimension: "place", label: "community.taxonomy.places" },
  community_types: { dimension: "community_type", label: "community.taxonomy.communityTypes" },
  audiences: { dimension: "audience", label: "community.taxonomy.audiences" },
  activities: { dimension: "activity", label: "community.taxonomy.activities" },
  content_kinds: { dimension: "content_kind", label: "community.taxonomy.contentKinds" },
} as const satisfies Record<keyof Classification, { dimension: TaxonomyDimension; label: MessageId }>;

export function useTaxonomy() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["taxonomy"], queryFn: ({ signal }) => readTaxonomy(signal), staleTime: TAXONOMY_CACHE_TIME, networkMode: "always" });
  async function refresh() {
    const terms = await readTaxonomy(undefined, true);
    await queryClient.cancelQueries({ queryKey: ["taxonomy"] });
    queryClient.setQueryData(["taxonomy"], terms);
    return terms;
  }
  return { ...query, refresh };
}

export function TaxonomyStatus({ vocabulary }: { vocabulary: ReturnType<typeof useTaxonomy> }) {
  const t = useText();
  if (vocabulary.isPending) return <p role="status">{t("community.taxonomy.loading")}</p>;
  if (!vocabulary.isError) return null;
  return <div className="message error" role="alert">{t("community.taxonomy.failed")}
    <button type="button" className="text-button" onClick={() => vocabulary.refetch()}><RefreshCw size={16} aria-hidden />{t("community.retry")}</button>
  </div>;
}

export function TopicSelect({ terms, value, onChange, disabled = false, all = false }: {
  terms: TaxonomyTerm[]; value: string; onChange: (value: string) => void; disabled?: boolean; all?: boolean;
}) {
  const t = useText();
  const { language } = useLanguage();
  const options = terms.filter(term => term.dimension === "topic" && (term.status === "active" || term.code === value));
  return <label>{t("community.topic")}<select aria-label={t("community.topic")} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
    <option value="" disabled={!all}>{t(all ? "community.allTopics" : "community.taxonomy.chooseTopic")}</option>
    {value && !options.some(term => term.code === value) && <option value={value} disabled>{value}</option>}
    {options.map(term => <option key={term.code} value={term.code} disabled={term.status === "retired"}>
      {termName(term, language)}{term.status === "retired" ? ` (${t("community.taxonomy.retired")})` : ""}
    </option>)}
  </select></label>;
}

export function TermMultiPicker({ terms, dimension, label, selected, maximum, onChange, disabled = false, excluded = [] }: {
  terms: TaxonomyTerm[]; dimension: TaxonomyDimension; label: string; selected: string[]; maximum: number;
  onChange: (codes: string[]) => void; disabled?: boolean; excluded?: string[];
}) {
  const t = useText();
  const { language } = useLanguage();
  const id = useId();
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const options = terms.filter(term => {
    if (term.dimension !== dimension || term.status !== "active" || excluded.includes(term.code)) return false;
    const parentDimension = dimension === "interest" ? "topic" : dimension;
    const parent = term.parent ? termLabel(terms, parentDimension, term.parent, language) : "";
    return `${termName(term, language)} ${term.names.en} ${term.code} ${parent}`.toLocaleLowerCase().includes(query);
  });
  return <fieldset className={styles.termPicker} disabled={disabled} aria-describedby={`${id}-count`}>
    <legend>{label}</legend>
    <p id={`${id}-count`} className={styles.selectionCount} role="status">{t("community.taxonomy.count", { count: selected.length, max: maximum })}</p>
    {selected.length > 0 && <ul className={styles.selectedTerms} aria-label={t("community.taxonomy.selected", { name: label })}>
      {selected.map(code => {
        const term = terms.find(item => item.dimension === dimension && item.code === code);
        const name = termLabel(terms, dimension, code, language);
        return <li key={code}><span>{name}{term?.status === "retired" ? ` (${t("community.taxonomy.retired")})` : !term ? ` (${t("community.taxonomy.unavailable")})` : ""}</span>
          <button type="button" className="icon-button" title={t("community.taxonomy.remove", { name })} aria-label={t("community.taxonomy.remove", { name })}
            onClick={() => onChange(selected.filter(value => value !== code))}><X size={17} aria-hidden /></button>
        </li>;
      })}
    </ul>}
    <label htmlFor={`${id}-search`}>{t("community.taxonomy.search", { name: label })}</label>
    <input id={`${id}-search`} type="search" value={search} onChange={event => setSearch(event.target.value)} autoComplete="off" />
    <ul className={styles.termOptions} aria-label={t("community.taxonomy.options", { name: label })} tabIndex={0}>
      {options.map(term => <li key={term.code}><label className={styles.termOption}>
        <input type="checkbox" checked={selected.includes(term.code)} disabled={!selected.includes(term.code) && selected.length >= maximum}
          onChange={event => onChange(event.target.checked ? [...selected, term.code] : selected.filter(code => code !== term.code))} />
        <span>{termName(term, language)}</span>
      </label></li>)}
      {options.length === 0 && <li className={styles.meta}>{t("community.taxonomy.noneFound")}</li>}
    </ul>
  </fieldset>;
}

export function ClassificationEditor({ terms, value, topic, onChange, disabled }: {
  terms: TaxonomyTerm[]; value: Classification; topic: string; onChange: (value: Classification) => void; disabled?: boolean;
}) {
  const t = useText();
  return <details className={styles.taxonomyDetails}>
    <summary>{t("community.taxonomy.classification")}</summary>
    <div className={styles.stack}>{(Object.keys(classificationFields) as (keyof Classification)[]).map(field => {
      const { dimension, label } = classificationFields[field];
      return <TermMultiPicker key={field} terms={terms} dimension={dimension} label={t(label)} selected={value[field]}
        maximum={CLASSIFICATION_LIMITS[field]} disabled={disabled} excluded={field === "other_topics" ? [topic] : []}
        onChange={codes => onChange({ ...value, [field]: codes })} />;
    })}</div>
  </details>;
}

export function ClassificationChips({ terms, value }: { terms: TaxonomyTerm[]; value: Classification }) {
  const t = useText();
  const { language } = useLanguage();
  if (!Object.values(value).some(codes => codes.length)) return null;
  return <ul className={styles.classification} aria-label={t("community.taxonomy.classification")}>
    {(Object.keys(classificationFields) as (keyof Classification)[]).flatMap(field => value[field].map(code => {
      const { dimension, label } = classificationFields[field];
      return <li key={`${dimension}:${code}`}><span>{t(label)}:</span> {termLabel(terms, dimension, code, language)}</li>;
    }))}
  </ul>;
}

export function unavailableTerms(problem: unknown, terms: TaxonomyTerm[], language: Language, t: ReturnType<typeof useText>) {
  if (!(problem instanceof ApiError) || problem.code !== "TERM_UNAVAILABLE") return null;
  const field = problem.details.field?.split(".").at(-1) ?? "";
  const dimension = field === "topic" || field === "topics" ? "topic" : classificationFields[field as keyof Classification]?.dimension;
  const codes = problem.details.codes?.split(",").map(code => code.trim()).filter(Boolean) ?? [];
  if (!codes.length) return t("community.taxonomy.choicesChanged");
  return t("community.taxonomy.unavailableTerms", { names: codes.map(code => dimension ? termLabel(terms, dimension, code, language) : code).join(", ") });
}