"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FilePlus2, LoaderCircle, RefreshCw, Trash2, X } from "lucide-react";

import { api } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId, MessageValues } from "@/features/i18n/messages";
import { isUnknown } from "@/features/community/client";
import { problemText, sessionLost, useViewer } from "@/features/community/shared";
import { spacesSchema } from "@/features/spaces/client";
import { ACCEPT, MAX_NAME, addDocument, decodeText, deleteDocument, fileProblem, formatSize, isCursorProblem, lineRange, listDocuments, readDocument, splitLines } from "./client";
import type { AddIntent, SpaceDocument } from "./client";
import styles from "./documents.module.css";

const kindIds = { "text/plain": "documents.kind.text", "text/markdown": "documents.kind.markdown", "text/csv": "documents.kind.csv" } as const;
const fileProblemIds: Record<string, MessageId> = {
  "Add a .txt, .md or .csv file. Other file types need a virus scanner, which is not available yet.": "documents.problem.type",
  [`File names can have up to ${MAX_NAME} characters.`]: "documents.problem.name",
  "Use a file name without folders.": "documents.problem.folders",
  "This file is empty.": "documents.problem.empty",
  "A document can be at most 512 KB.": "documents.problem.size",
  "This file is not UTF-8 text.": "documents.problem.utf8",
  "This file could not be read.": "documents.problem.read",
};

type View = { spaceId: string; documentId: string; line: string; end: string };
type DocumentNotice = { id: MessageId; values?: MessageValues };

function addressOf(view: View) {
  const query = new URLSearchParams();
  if (view.spaceId) query.set("space_id", view.spaceId);
  if (view.documentId) query.set("id", view.documentId);
  if (view.documentId && view.line) query.set("line", view.line);
  if (view.documentId && view.line && view.end) query.set("end", view.end);
  const text = query.toString();
  return `/app/documents${text ? `?${text}` : ""}`;
}

function viewFromAddress(): View {
  const query = new URLSearchParams(window.location.search);
  return { spaceId: query.get("space_id") ?? "", documentId: query.get("id") ?? "", line: query.get("line") ?? "", end: query.get("end") ?? "" };
}

// The same checks the page applies to its address, for an address the router already shows.
const idIn = (value: string | null | undefined) => value && /^[0-9a-f-]{36}$/.test(value) ? value : "";
const digitsIn = (value: string | null | undefined) => value && /^\d{1,7}$/.test(value) ? value : "";

export function DocumentsScreen({ initialSpaceId, initialDocumentId, initialLine, initialEnd }: {
  initialSpaceId: string; initialDocumentId: string; initialLine: string; initialEnd: string;
}) {
  const t = useText();
  const viewer = useViewer();
  // Back from another page can bring this page back as it was first rendered, while the address names the document the person had
  // open. The address comes first; the page's own values cover an address without a Space or document.
  const address = useSearchParams();
  const named: View = { spaceId: idIn(address?.get("space_id")), documentId: idIn(address?.get("id")), line: digitsIn(address?.get("line")), end: digitsIn(address?.get("end")) };
  const initial: View = named.spaceId || named.documentId ? named : { spaceId: initialSpaceId, documentId: initialDocumentId, line: initialLine, end: initialEnd };
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("documents.loading")}</main></Shell>;
  }
  if (!viewer.account) {
    return <Shell account><main className={styles.main}><h1>{t("documents.unavailable")}</h1><p role="alert">{problemText(viewer.error, t("documents.loadError"))}</p><button className="secondary-button" onClick={viewer.retry}><RefreshCw size={17} aria-hidden />{t("documents.retry")}</button></main></Shell>;
  }
  return <Documents key={viewer.account.id} user={viewer.account} initial={initial} />;
}

function Documents({ user, initial }: { user: Account; initial: View }) {
  const t = useText();
  const queryClient = useQueryClient();
  const spaceLabel = useId();
  const [view, setView] = useState<View>(initial);
  const [notice, setNotice] = useState<(DocumentNotice & { at: number }) | null>(null);
  const [locked, setLocked] = useState(false);
  const announce = (message: DocumentNotice) => setNotice({ ...message, at: Date.now() });
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  useEffect(() => {
    const back = () => setView(viewFromAddress());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    if (sessionLost(spaces.error)) {
      queryClient.clear();
      window.location.replace("/login");
    }
  }, [spaces.error, queryClient]);
  const go = (next: Partial<View>) => {
    const merged = { spaceId: view.spaceId, documentId: "", line: "", end: "", ...next };
    setView(merged);
    window.history.pushState(null, "", addressOf(merged));
  };
  const spaceList = spaces.data?.data ?? [];
  const space = spaceList.find(item => item.id === view.spaceId) ?? spaceList[0];
  const [beforeSpacesLink, afterSpacesLink] = t("documents.noSpaces").split("{link}");

  return <Shell account>
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>{t("documents.title")}</h1>
        {!view.documentId && <p>{t("documents.intro")}</p>}
      </header>
      {spaces.isPending && <p role="status" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("documents.loadingSpaces")}</p>}
      {spaces.isError && <div className="message error" role="alert">{problemText(spaces.error, t("documents.spacesError"))}<button className="text-button" onClick={() => spaces.refetch()}><RefreshCw size={16} aria-hidden />{t("documents.retry")}</button></div>}
      {spaces.isSuccess && spaceList.length === 0 && <p className={styles.empty}>{beforeSpacesLink}<Link href="/app/spaces">{t("documents.goToSpaces")}</Link>{afterSpacesLink}</p>}
      {view.documentId
        ? <DocumentViewer key={view.documentId} user={user} documentId={view.documentId} range={lineRange(view.line, view.end)}
          onClose={spaceId => { setNotice(null); go(spaceId ? { spaceId } : {}); }}
          onDeleted={(message, spaceId) => { announce(message); queryClient.removeQueries({ queryKey: ["documents", user.id, spaceId] }); go({ spaceId }); }} />
        : space && <>
          <div className={styles.controls}>
            <label className={styles.field}><span id={spaceLabel}>{t("documents.space")}</span>
              <select aria-labelledby={spaceLabel} value={space.id} disabled={locked} onChange={event => { setNotice(null); go({ spaceId: event.target.value }); }}>
                {spaceList.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <Notice message={notice} />
          <AddDocument key={space.id} user={user} space={space} onLocked={setLocked} onAdded={announce} />
          <DocumentList key={`list-${space.id}`} user={user} space={space} locked={locked} onOpen={id => { setNotice(null); go({ spaceId: space.id, documentId: id }); }} />
        </>}
    </main>
  </Shell>;
}

function Notice({ message }: { message: (DocumentNotice & { at: number }) | null }) {
  const t = useText();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message) ref.current?.focus(); }, [message]);
  return message ? <p ref={ref} className={styles.notice} role="status" tabIndex={-1}>{t(message.id, message.values)}</p> : null;
}

function AddDocument({ user, space, onLocked, onAdded }: {
  user: Account; space: { id: string; name: string }; onLocked: (locked: boolean) => void; onAdded: (message: DocumentNotice) => void;
}) {
  const t = useText();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const reading = useRef(0);
  const [inputKey, setInputKey] = useState(0);
  const [choice, setChoice] = useState<{ name: string; size: number; text: string; key: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [intent, setIntent] = useState<AddIntent | null>(null);
  const add = useMutation({
    mutationFn: addDocument,
    onSuccess: item => {
      setIntent(null); setChoice(null); setInputKey(value => value + 1);
      void queryClient.invalidateQueries({ queryKey: ["documents", user.id, space.id] });
      onAdded(item.status === "deleted" ? { id: "documents.addedDeleted" } : { id: "documents.added", values: { name: item.name ?? "", space: space.name } });
    },
    onError: error => {
      // A definite refusal releases the choice with a fresh key; an unconfirmed outcome keeps the same key and text.
      if (!isUnknown(error)) { setIntent(null); setChoice(current => current && { ...current, key: crypto.randomUUID() }); }
    },
  });
  const uncertain = add.isError && isUnknown(add.error) && intent !== null;
  const locked = add.isPending || uncertain;
  useEffect(() => { if (sessionLost(add.error)) { queryClient.clear(); window.location.replace("/login"); } }, [add.error, queryClient]);
  useEffect(() => { onLocked(locked); return () => onLocked(false); }, [locked, onLocked]);
  useEffect(() => {
    if (!intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [intent]);

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    const turn = ++reading.current;
    add.reset(); setIntent(null); setChoice(null); setProblem(null);
    if (!file) return;
    const issue = fileProblem(file);
    if (issue) { setProblem(issue); input.value = ""; return; }
    let bytes: ArrayBuffer;
    try { bytes = await file.arrayBuffer(); } catch { if (turn === reading.current) setProblem("This file could not be read."); return; }
    if (turn !== reading.current) return;
    const decoded = decodeText(bytes);
    if ("problem" in decoded) { setProblem(decoded.problem); input.value = ""; return; }
    setChoice({ name: file.name.trim(), size: file.size, text: decoded.text, key: crypto.randomUUID() });
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!choice || add.isPending) return;
    // An unconfirmed add is retried with the same key and text so the document cannot be added twice.
    const next = intent ?? { accountId: user.id, spaceId: space.id, key: choice.key, body: { name: choice.name, content: choice.text } };
    setIntent(next);
    add.mutate(next);
  };
  const giveUp = () => {
    setIntent(null); setChoice(null); setInputKey(value => value + 1); add.reset();
    void queryClient.invalidateQueries({ queryKey: ["documents", user.id, space.id] });
  };
  const problemId = problem ? fileProblemIds[problem] : undefined;

  return <form className={styles.panel} onSubmit={submit} aria-labelledby={`${fieldId}-title`} noValidate>
    <h2 id={`${fieldId}-title`}>{t("documents.addTitle", { space: space.name })}</h2>
    <p className={styles.hint}>{t("documents.textOnly")}</p>
    <label className={styles.field}>{t("documents.file")}
      <input key={inputKey} type="file" accept={ACCEPT} disabled={locked} aria-describedby={problem ? `${fieldId}-problem` : undefined} onChange={choose} />
    </label>
    {choice && <p className={styles.chosen}>{choice.name} ({formatSize(choice.size)})</p>}
    {problem && <p id={`${fieldId}-problem`} className="message error" role="alert">{problemId ? t(problemId, { limit: MAX_NAME }) : problem}</p>}
    {add.isError && <p className="message error" role="alert">{problemText(add.error, t("documents.addError"))}{uncertain ? t("documents.retryAddHint") : ""}</p>}
    {add.isPending && <p role="status">{t("documents.adding")}</p>}
    <div className={styles.actions}>
      <button className="primary-button" type="submit" disabled={!choice || add.isPending}>{add.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <FilePlus2 size={17} aria-hidden />}{uncertain ? t("documents.retry") : t("documents.add")}</button>
      {uncertain && <button type="button" className="secondary-button" onClick={giveUp}>{t("documents.checkList")}</button>}
    </div>
  </form>;
}

function DocumentList({ user, space, locked, onOpen }: { user: Account; space: { id: string; name: string }; locked: boolean; onOpen: (id: string) => void }) {
  const t = useText();
  const queryClient = useQueryClient();
  const titleId = useId();
  const key = ["documents", user.id, space.id];
  const list = useInfiniteQuery({
    queryKey: key, initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listDocuments(user.id, space.id, pageParam, signal),
    getNextPageParam: last => last.pagination.next_cursor ?? undefined,
  });
  useEffect(() => { if (sessionLost(list.error)) { queryClient.clear(); window.location.replace("/login"); } }, [list.error, queryClient]);
  const rows = [...new Map(list.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];
  const stale = isCursorProblem(list.error);
  return <section aria-labelledby={titleId}>
    <h2 id={titleId} className={styles.listTitle}>{t("documents.listTitle", { space: space.name })}</h2>
    {list.isPending && <p role="status" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("documents.loading")}</p>}
    {list.isError && <div className="message error" role="alert">{problemText(list.error, t("documents.loadError"))}
      {stale ? <button className="text-button" onClick={() => void queryClient.resetQueries({ queryKey: key })}><RefreshCw size={16} aria-hidden />{t("documents.reloadList")}</button>
        : <button className="text-button" onClick={() => void list.refetch()}><RefreshCw size={16} aria-hidden />{t("documents.retry")}</button>}
    </div>}
    {list.isSuccess && rows.length === 0 && <p className={styles.empty}>{t("documents.empty")}</p>}
    <ul className={styles.list}>{rows.map(item => <DocumentRow key={item.id} item={item} locked={locked} onOpen={onOpen} />)}</ul>
    {list.hasNextPage && !stale && <div className={styles.actions}><button className="secondary-button" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? t("documents.loadingMore") : t("documents.more")}</button></div>}
  </section>;
}

function DocumentRow({ item, locked, onOpen }: { item: SpaceDocument; locked: boolean; onOpen: (id: string) => void }) {
  const t = useText();
  const { language } = useLanguage();
  const date = new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium" });
  return <li className={styles.card}>
    <button className={styles.cardButton} disabled={locked} onClick={() => onOpen(item.id)}>{item.name}</button>
    <p className={styles.meta}>{item.media_type ? t(kindIds[item.media_type]) : ""} · {formatSize(item.size_bytes ?? 0)} · {t(item.line_count === 1 ? "documents.lines.one" : "documents.lines.many", { count: item.line_count ?? 0 })}</p>
    <p className={styles.meta}>{t("documents.addedBy", { name: item.added_by_name || t("documents.formerMember"), date: date.format(new Date(item.added_at)) })}</p>
  </li>;
}

function DocumentViewer({ user, documentId, range, onClose, onDeleted }: {
  user: Account; documentId: string; range: { start: number; end: number } | null;
  onClose: (spaceId?: string) => void; onDeleted: (message: DocumentNotice, spaceId: string) => void;
}) {
  const t = useText();
  const { language } = useLanguage();
  const date = new Intl.DateTimeFormat(language === "en" ? undefined : language === "te" ? "te-IN" : "hi-IN", { dateStyle: "medium" });
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [confirming, setConfirming] = useState(false);
  const detail = useQuery({ queryKey: ["document", user.id, documentId], queryFn: ({ signal }) => readDocument(user.id, documentId, signal) });
  const remove = useMutation({
    mutationFn: (item: { id: string; space_id: string; name: string | null }) => deleteDocument(user.id, item),
    onSuccess: (_outcome, item) => { setConfirming(false); onDeleted({ id: "documents.deleted", values: { name: item.name ?? t("documents.theDocument") } }, item.space_id); },
  });
  useEffect(() => {
    if (sessionLost(detail.error) || sessionLost(remove.error)) { queryClient.clear(); window.location.replace("/login"); }
  }, [detail.error, remove.error, queryClient]);
  const loaded = detail.data?.id;
  const lines = useMemo(() => detail.data ? splitLines(detail.data.content) : [], [detail.data]);
  useEffect(() => {
    if (!loaded) return;
    const target = range ? window.document.getElementById(`L${range.start}`) : null;
    if (target) { target.scrollIntoView({ block: "center" }); target.focus({ preventScroll: true }); }
    else headingRef.current?.focus();
    // Only when this document first appears: later refreshes must not move the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  if (detail.isPending) return <section className={styles.panel} aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("documents.loadingDocument")}</section>;
  if (detail.isError) {
    return <section className={styles.panel}>
      <p className="message error" role="alert">{problemText(detail.error, t("documents.documentError"))}{detail.error && "status" in detail.error && detail.error.status === 404 ? t("documents.unavailableHint") : ""}</p>
      <div className={styles.actions}>
        {!("status" in detail.error && detail.error.status === 404) && <button className="secondary-button" onClick={() => void detail.refetch()}><RefreshCw size={16} aria-hidden />{t("documents.retry")}</button>}
        <button className="text-button" onClick={() => onClose()}><ArrowLeft size={16} aria-hidden />{t("documents.back")}</button>
      </div>
    </section>;
  }
  const item = detail.data;
  const visible = range && range.start <= lines.length;
  return <>
    <section className={styles.panel} aria-labelledby="document-title">
      <div className={styles.panelHeader}>
        <h2 id="document-title" ref={headingRef} tabIndex={-1}>{item.name}</h2>
        <button className="text-button" onClick={() => onClose(item.space_id)}><ArrowLeft size={16} aria-hidden />{t("documents.back")}</button>
      </div>
      <p className={styles.meta}>{item.media_type ? t(kindIds[item.media_type]) : ""} · {formatSize(item.size_bytes ?? 0)} · {t(item.line_count === 1 ? "documents.lines.one" : "documents.lines.many", { count: item.line_count ?? 0 })}</p>
      <p className={styles.meta}>{t("documents.details", { space: item.space_name, name: item.added_by_name || t("documents.formerMember"), date: date.format(new Date(item.added_at)) })}</p>
      {range && (visible
        ? <p className={styles.notice} role="status">{range.start === range.end ? t("documents.markedLine", { line: range.start }) : t("documents.markedLines", { start: range.start, end: Math.min(range.end, lines.length) })}</p>
        : <p className={styles.notice} role="status">{t("documents.missingLines", { lines: t(lines.length === 1 ? "documents.lines.one" : "documents.lines.many", { count: lines.length }) })}</p>)}
      {item.can_delete && <div className={styles.actions}>
        <button className="secondary-button" onClick={() => { remove.reset(); setConfirming(true); }}><Trash2 size={16} aria-hidden />{t("documents.delete")}</button>
      </div>}
    </section>
    <ol className={styles.lines} aria-label={t("documents.textOf", { name: item.name ?? "" })}>
      {lines.map((text, index) => {
        const number = index + 1;
        const marked = Boolean(range && number >= range.start && number <= range.end);
        return <li key={number} id={`L${number}`} data-line={number} className={marked ? styles.marked : undefined}
          aria-current={marked ? "location" : undefined} tabIndex={range && number === range.start ? -1 : undefined}>{text}</li>;
      })}
    </ol>
    {confirming && <ConfirmDialog title={t("documents.deleteTitle")} locked={remove.isPending} onClose={() => setConfirming(false)}>
      <p>{t("documents.deleteWarning", { name: item.name ?? "", person: item.added_by_name || t("documents.formerMember"), space: item.space_name })}</p>
      {remove.isError && <p className="message error" role="alert">{problemText(remove.error, t("documents.deleteError"))}</p>}
      <div className={styles.dialogActions}>
        <button className="secondary-button" disabled={remove.isPending} onClick={() => setConfirming(false)}>{t("documents.cancel")}</button>
        <button className="primary-button" disabled={remove.isPending} onClick={() => remove.mutate(item)}>
          {remove.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Trash2 size={17} aria-hidden />}{remove.isError && isUnknown(remove.error) ? t("documents.retryDelete") : t("documents.delete")}
        </button>
      </div>
    </ConfirmDialog>}
  </>;
}

function ConfirmDialog({ title, locked, onClose, children }: { title: string; locked: boolean; onClose: () => void; children: React.ReactNode }) {
  const t = useText();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { if (locked) event.preventDefault(); else onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={t("documents.close")} title={t("documents.close")} disabled={locked} onClick={onClose}><X size={18} aria-hidden /></button></div>
    {children}
  </dialog>;
}
