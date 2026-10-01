"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LoaderCircle, LogOut, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { z } from "zod";
import { Account, ApiError, api, doneSchema, userSchema } from "./client";
import { Shell } from "./shell";
import styles from "./data.module.css";

const categoryOptions = [
  { value: "profile", label: "Profile" },
  { value: "security", label: "Security activity" },
  { value: "spaces", label: "Spaces" },
  { value: "tasks", label: "Tasks" },
  { value: "reminders", label: "Reminders" },
] as const;
const categorySchema = z.enum(["profile", "security", "spaces", "tasks", "reminders"]);
const exportSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "building", "ready", "outdated", "cancelled", "failed", "expired"]),
  reason: z.enum(["session_ended", "access_changed", "too_large", "unavailable", "cancelled"]).nullable(),
  categories: z.array(categorySchema).min(1).max(5),
  created_at: z.string(), completed_at: z.string().nullable(), expires_at: z.string().nullable(),
  size_bytes: z.number().int().nonnegative().nullable(), requested_here: z.boolean(),
});
const archiveSchema = z.object({ format: z.literal("community-platform-account-export"), version: z.literal(1) }).passthrough();
const deletionSchema = z.object({ status: z.literal("deletion_requested"), purge_after: z.string() });
type Category = z.infer<typeof categorySchema>;
type ExportView = z.infer<typeof exportSchema>;

export function DataScreen() {
  const queryClient = useQueryClient();
  const [deletion, setDeletion] = useState<{ purgeAfter: string; timezone: string } | null>(null);
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }), enabled: !deletion });
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) window.location.replace("/login");
  }, [profile.error]);
  if (deletion) return <main className={`account-main ${styles.main}`}><section className={styles.status} role="status"><p>Your account will be deleted on {formatDate(deletion.purgeAfter, deletion.timezone)}. You are signed out everywhere. To keep your account, sign in before then and choose to cancel the deletion.</p><Link className="text-button" href="/login">Sign in</Link></section></main>;
  if (profile.isPending) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" />Loading your account</main></Shell>;
  if (!profile.data) return <Shell account><main className="auth-main"><h1>Account unavailable</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />Retry</button></main></Shell>;
  return <DataDetails key={profile.data.data.id} user={profile.data.data} onDeleted={purgeAfter => {
    setDeletion({ purgeAfter, timezone: profile.data.data.timezone });
    queryClient.clear();
  }} />;
}

function DataDetails({ user, onDeleted }: { user: Account; onDeleted: (purgeAfter: string) => void }) {
  const queryClient = useQueryClient();
  const [categories, setCategories] = useState<Category[]>(categoryOptions.map(option => option.value));
  const requestKey = useRef<string | null>(null);
  const [problem, setProblem] = useState<Error | null>(null);
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const downloads = useQuery({
    queryKey: ["exports", user.id],
    queryFn: ({ signal }) => api("me/exports", z.array(exportSchema).max(10), { accountId: user.id, signal }),
    refetchInterval: query => query.state.data?.data.some(item => item.status === "queued" || item.status === "building") ? 5000 : false,
  });

  function report(error: Error) {
    setProblem(error);
    if (error instanceof ApiError && error.status === 401) {
      queryClient.clear(); window.location.replace("/login");
    }
  }
  useEffect(() => {
    if (downloads.error instanceof ApiError && downloads.error.status === 401) {
      queryClient.clear(); window.location.replace("/login");
    }
  }, [downloads.error, queryClient]);

  const prepare = useMutation({
    networkMode: "always", retry: false,
    mutationFn: () => {
      requestKey.current ??= crypto.randomUUID();
      return api("me/exports", exportSchema, { method: "POST", body: { categories }, accountId: user.id, headers: { "Idempotency-Key": requestKey.current } });
    },
    onSuccess: () => {
      requestKey.current = null;
      queryClient.invalidateQueries({ queryKey: ["exports", user.id] });
    }, onError: report,
  });
  const cancel = useMutation({
    networkMode: "always", retry: false,
    mutationFn: (id: string) => api(`me/exports/${id}`, exportSchema, { method: "DELETE", body: {}, accountId: user.id }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["exports", user.id] }); }, onError: report,
  });
  const download = useMutation({
    networkMode: "always", retry: false,
    mutationFn: (id: string) => api(`me/exports/${id}/archive`, archiveSchema, { accountId: user.id }),
    onSuccess: result => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `community-platform-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
    },
    onError: error => {
      report(error);
      if (error instanceof ApiError && ["EXPORT_EXPIRED", "EXPORT_OTHER_SESSION", "EXPORT_OUTDATED", "EXPORT_UNAVAILABLE"].includes(error.code)) {
        queryClient.invalidateQueries({ queryKey: ["exports", user.id] });
      }
    },
  });

  async function signInAgain() {
    setSigningOut(true);
    try { await api("auth/logout", doneSchema, { method: "POST", body: {}, accountId: user.id }); }
    catch {}
    finally { window.location.assign("/login"); }
  }

  function choose(category: Category, checked: boolean) {
    setCategories(categoryOptions.filter(option => option.value === category ? checked : categories.includes(option.value)).map(option => option.value));
    requestKey.current = null;
    setProblem(null);
  }

  const reauthentication = problem instanceof ApiError && problem.code === "REAUTHENTICATION_REQUIRED";
  const message = problem instanceof ApiError && problem.code === "EXPORT_IN_PROGRESS" ? "A download is already being prepared." : problem?.message;
  return <Shell account>
    <main className={`account-main ${styles.main}`}>
      <nav className={`workspace-nav ${styles.wrap}`} aria-label="Profile"><Link className="text-button" href="/app/settings/account"><UserRound size={18} aria-hidden />Account</Link><span className="nav-active" aria-current="page"><Download size={18} aria-hidden />Your data</span></nav>
      <div className="account-heading"><div><span className="section-kicker">PERSONAL SETTINGS</span><h1>Your data</h1></div></div>
      <section className={styles.section} aria-labelledby="download-title">
        <div className="section-title"><Download size={20} aria-hidden /><h2 id="download-title">Download your data</h2></div>
        <p className={styles.intro}>Prepare a file with the account data you choose. It is ready to download for 24 hours, only in this browser. The file is not encrypted.</p>
        <fieldset className={styles.choices} aria-label="Data to download" disabled={prepare.isPending}>
          {categoryOptions.map(option => <label className={styles.choice} key={option.value}><input type="checkbox" value={option.value} checked={categories.includes(option.value)} onChange={event => choose(option.value, event.target.checked)} />{option.label}</label>)}
        </fieldset>
        <button className="primary-button" disabled={categories.length === 0 || prepare.isPending} onClick={() => { setProblem(null); prepare.mutate(); }}>{prepare.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Download size={17} aria-hidden />}Prepare download</button>
        {problem && <div className={`message error ${styles.problem}`} role="alert">{reauthentication ? <>For your safety, sign in again before downloading your data.<button className="secondary-button" disabled={signingOut} onClick={signInAgain}><LogOut size={17} aria-hidden />Sign in again</button></> : message}</div>}
        <h3 className={styles.listHeading}>Your downloads</h3>
        {downloads.isPending && <p role="status">Loading your downloads...</p>}
        {downloads.isError && <div className={`message error ${styles.problem}`} role="alert">{downloads.error.message}<button className="text-button" onClick={() => downloads.refetch()}><RefreshCw size={17} aria-hidden />Retry</button></div>}
        {downloads.data?.data.length === 0 && <p>You have not asked for a download yet.</p>}
        <ul className={styles.downloads} aria-label="Your downloads">{downloads.data?.data.map(item => {
          const requested = formatDate(item.created_at, user.timezone);
          return <li className={styles.item} key={item.id}>
            <div className={styles.itemBody}><strong>{exportStatus(item, user.timezone)}</strong><time dateTime={item.created_at}>Requested {requested}</time><p>{item.categories.map(category => categoryOptions.find(option => option.value === category)!.label).join(", ")}</p>{item.status === "ready" && !item.requested_here && <p>Download it in the browser that asked for it.</p>}</div>
            <div className={styles.itemActions}>
              {item.status === "ready" && item.requested_here && <button className="primary-button" aria-label={`Download data requested ${requested}`} disabled={download.isPending || cancel.isPending} onClick={() => { setProblem(null); download.mutate(item.id); }}><Download size={17} aria-hidden />Download</button>}
              {["queued", "building", "ready"].includes(item.status) && <button className="secondary-button" aria-label={`Cancel data requested ${requested}`} disabled={cancel.isPending || download.isPending} onClick={() => { setProblem(null); cancel.mutate(item.id); }}><X size={17} aria-hidden />Cancel</button>}
            </div>
          </li>;
        })}</ul>
      </section>
      <section className={styles.section} aria-labelledby="deletion-title">
        <div className="section-title"><Trash2 size={20} aria-hidden /><h2 id="deletion-title">Delete your account</h2></div>
        <p className={styles.intro}>Deleting your account signs you out everywhere at once. For 7 days you can change your mind by signing in with your password. After that your account is erased and cannot be recovered: your email, name, sessions, reminders, care records, agent requests and memories, pages, follows, likes and saves. Messages and comments you wrote show as deleted. Tasks, events and documents you added to Spaces shared with other people stay there for them, shown as added by a deleted account.</p>
        <button className="primary-button" onClick={() => setConfirmDeletion(true)}><Trash2 size={17} aria-hidden />Delete account</button>
      </section>
    </main>
    {confirmDeletion && <DeletionDialog accountId={user.id} onCancel={() => setConfirmDeletion(false)} onDeleted={purgeAfter => { setConfirmDeletion(false); onDeleted(purgeAfter); }} />}
  </Shell>;
}

function DeletionDialog({ accountId, onCancel, onDeleted }: { accountId: string; onCancel: () => void; onDeleted: (purgeAfter: string) => void }) {
  const [element, setElement] = useState<HTMLDialogElement | null>(null);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Error | null>(null);
  useEffect(() => { element?.showModal(); return () => element?.close(); }, [element]);
  function close() { setPassword(""); onCancel(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setProblem(null);
    const submittedPassword = password;
    setPassword("");
    try {
      const result = await api("me/deletion", deletionSchema, { method: "POST", body: { password: submittedPassword }, accountId });
      onDeleted(result.data.purge_after);
    } catch (error) { setProblem(error as Error); }
    finally { setPending(false); }
  }
  const ownedSpaces = problem instanceof ApiError && problem.code === "OWNED_SPACES_WITH_MEMBERS";
  const names = ownedSpaces ? (problem.details.spaces ?? "").split("\n").filter(Boolean) : [];
  return <dialog className={styles.dialog} ref={setElement} aria-labelledby="delete-account-title" onCancel={event => { if (pending) event.preventDefault(); else close(); }}>
    <div className={`dialog-heading ${styles.wrap}`}><h2 id="delete-account-title">Delete your account?</h2><button className="icon-button" aria-label="Close confirmation" title="Close confirmation" onClick={close} disabled={pending}><X size={19} aria-hidden /></button></div>
    <form onSubmit={submit}>
      <label className={styles.passwordField}>Password<input type="password" name="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /></label>
      {problem && <div className={`message error ${styles.problem}`} role="alert">{ownedSpaces ? <><p>You own Spaces that other people are in. Hand ownership to someone else or remove the members first:</p><ul className={styles.spacesList}>{names.map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}</ul><Link className="text-button" href="/app/spaces">Go to Spaces</Link></> : problem instanceof ApiError && problem.code === "PASSWORD_INCORRECT" ? "The password is incorrect." : problem.message}</div>}
      <div className={`dialog-actions ${styles.wrap}`}><button className="secondary-button" type="button" onClick={close} disabled={pending}>Keep my account</button><button className="primary-button" type="submit" disabled={pending}>{pending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Trash2 size={17} aria-hidden />}Delete account</button></div>
    </form>
  </dialog>;
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}

function exportStatus(item: ExportView, timezone: string) {
  switch (item.status) {
    case "queued": case "building": return "Being prepared";
    case "ready": return item.expires_at ? `Ready until ${formatDate(item.expires_at, timezone)}` : "Ready";
    case "expired": return "Expired";
    case "cancelled": return "Cancelled";
    case "failed": return "Could not be prepared";
    case "outdated": return "Out of date because your access changed";
  }
}