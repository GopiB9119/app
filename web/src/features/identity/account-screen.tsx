"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Check, CheckCheck, Clock3, Download, Globe2, ListFilter, LoaderCircle, LogOut, Monitor, RefreshCw, Save, ShieldBan, ShieldCheck, Smartphone, UserRound, VolumeX, X } from "lucide-react";
import { Account, ApiError, api, characters, doneSchema, eventSchema, sessionSchema, userSchema } from "./client";
import { Shell } from "./shell";
import { TimezoneListProblem } from "./timezone-list-problem";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { Language, MessageId, MessageValues } from "@/features/i18n/messages";
import styles from "./account.module.css";

export function AccountScreen() {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) window.location.replace("/login");
  }, [profile.error]);
  if (profile.isPending) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" />{t("account.loading")}</main></Shell>;
  if (!profile.data) return <Shell account><main className="auth-main"><h1>{t("account.unavailable")}</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} />{t("account.retry")}</button></main></Shell>;
  return <AccountDetails key={profile.data.data.id} user={profile.data.data} etag={profile.data.etag} />;
}

function AccountDetails({ user, etag }: { user: Account; etag: string | null }) {
  const t = useText();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<MessageId | "">("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ display_name: user.display_name, timezone: user.timezone });
  const [draftVersion, setDraftVersion] = useState(etag);
  const [confirm, setConfirm] = useState<{ path: string; label: MessageId; values?: MessageValues; current: boolean; method: string } | null>(null);
  const sessions = useQuery({ queryKey: ["sessions", user.id], queryFn: ({ signal }) => api("me/sessions", z.array(sessionSchema), { accountId: user.id, signal }) });
  const events = useQuery({ queryKey: ["events", user.id], queryFn: ({ signal }) => api("me/security-events", z.array(eventSchema), { accountId: user.id, signal }) });
  const zones = useQuery({ queryKey: ["timezones"], queryFn: ({ signal }) => api("timezones", z.array(z.string()), { signal }) });
  const changed = draft.display_name !== user.display_name || draft.timezone !== user.timezone;
  // The server counts characters, an emoji counting once; the input allows twice as many UTF-16 units.
  const nameTooLong = characters(draft.display_name.trim()) > 80;

  useEffect(() => {
    if (!changed) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [changed]);

  function report(problem: Error) {
    setError(problem.message);
    if (problem instanceof ApiError && problem.status === 401) {
      queryClient.clear(); window.location.replace("/login");
    }
  }

  const save = useMutation({
    mutationFn: () => api("me/profile", userSchema, { method: "PATCH", body: draft, accountId: user.id, headers: { "If-Match": draftVersion ?? "" } }),
    onSuccess: async result => {
      // A read that started before the save would otherwise land afterwards and show the old profile again.
      await queryClient.cancelQueries({ queryKey: ["me"] });
      queryClient.setQueryData(["me"], result);
      setDraft({ display_name: result.data.display_name, timezone: result.data.timezone });
      setDraftVersion(result.etag); setNotice("account.profileSaved"); setError("");
      queryClient.invalidateQueries({ queryKey: ["events", user.id] });
    }, onError: report,
  });
  const revoke = useMutation({
    mutationFn: (intent: NonNullable<typeof confirm>) => api(intent.path, doneSchema, { method: intent.method, body: {}, accountId: user.id }),
    onSuccess: (_response, intent) => {
      setConfirm(null);
      if (intent.current) { queryClient.clear(); window.location.replace("/login"); return; }
      setNotice("account.sessionRevokedNotice"); setError("");
      queryClient.invalidateQueries({ queryKey: ["sessions", user.id] });
      queryClient.invalidateQueries({ queryKey: ["events", user.id] });
    }, onError: report,
  });

  async function reloadProfile() {
    try {
      const result = await api("me", userSchema);
      await queryClient.cancelQueries({ queryKey: ["me"] });
      queryClient.setQueryData(["me"], result);
      setDraft({ display_name: result.data.display_name, timezone: result.data.timezone });
      setDraftVersion(result.etag); setError(""); setNotice("");
    } catch (problem) { report(problem as Error); }
  }

  const timezoneOptions = zones.data?.data ?? [user.timezone];
  return <Shell account>
    <main className={language === "en" ? "account-main" : `account-main ${styles.localized}`}>
      <nav className={`workspace-nav ${styles.nav}`} aria-label={t("account.profile")}><span className="nav-active"><UserRound size={18} />{t("account.account")}</span><Link className="text-button" href="/app/settings/interests"><ListFilter size={18} aria-hidden />{t("community.interests.title")}</Link><Link className="text-button" href="/app/settings/feed"><VolumeX size={18} aria-hidden />{t("community.feedControls.title")}</Link><Link className="text-button" href="/app/safety"><ShieldBan size={18} aria-hidden />{t("account.blocked")}</Link><Link className="text-button" href="/app/settings/privacy"><ShieldCheck size={18} aria-hidden />{t("privacy.title")}</Link><Link className="text-button" href="/app/settings/data"><Download size={18} aria-hidden />{t("account.yourData")}</Link><button className="text-button" onClick={() => setConfirm({ path: "auth/logout", method: "POST", current: true, label: "account.confirmSignOut" })}><LogOut size={17} />{t("account.signOut")}</button></nav>
      <div className="account-heading"><div><span className="section-kicker">{t("account.kicker")}</span><h1>{t("account.heading")}</h1><p>{t("account.subtitle")}</p></div><div className="verified-badge"><ShieldCheck size={17} />{t("account.emailVerified")}</div></div>
      {notice && <div className="message success" role="status"><Check size={18} />{t(notice)}</div>}
      {error && <div className="message error" role="alert">{error}<button className="text-button" onClick={reloadProfile}><RefreshCw size={16} />{t("account.reloadProfile")}</button></div>}
      <div className="account-grid">
        <section className="profile-section" aria-labelledby="profile-title">
          <div className="section-title"><UserRound size={20} /><h2 id="profile-title">{t("account.profile")}</h2></div>
          <div className="person-row"><div className="avatar" aria-hidden>{user.display_name.split(" ").map(value => value[0]).slice(0, 2).join("").toUpperCase()}</div><div><strong>{user.display_name}</strong><span>{user.email}</span></div><CheckCheck className="person-check" size={19} aria-hidden /></div>
          <form className="profile-form" onSubmit={event => { event.preventDefault(); setNotice(""); setError(""); if (!nameTooLong) save.mutate(); }}>
            <label>{t("account.displayName")}<input name="display_name" autoComplete="name" required maxLength={160} aria-invalid={nameTooLong || undefined} value={draft.display_name} onChange={event => setDraft({ ...draft, display_name: event.target.value })} /></label>
            {nameTooLong && <p className="field-error" role="alert">{t("account.nameLength", { limit: 80 })}</p>}
            <label><span id="profile-timezone-label">{t("account.timezone")}</span><div className="input-label-icon"><Globe2 size={16} aria-hidden /><select name="timezone" aria-labelledby="profile-timezone-label" value={draft.timezone} onChange={event => setDraft({ ...draft, timezone: event.target.value })}>{timezoneOptions.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></div></label>
            {zones.isError && <TimezoneListProblem message={t("account.timezoneProblem")} retryLabel={t("account.retry")} retry={() => zones.refetch()} />}
            <div className="form-actions"><button className="primary-button" type="submit" disabled={!changed || save.isPending || nameTooLong}>{save.isPending ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}{t("account.saveChanges")}</button>{changed && <button type="button" className="text-button" onClick={() => { setDraft({ display_name: user.display_name, timezone: user.timezone }); setDraftVersion(etag); }}>{t("account.discard")}</button>}</div>
          </form>
          <div className="account-facts"><span>{t("account.status")}<strong><span className="status-square" />{t("account.active")}</strong></span><span>{t("account.emailVerification")}<strong>{t("account.verified")}</strong></span></div>
        </section>
        <section className="sessions-section" aria-labelledby="sessions-title">
          <div className="section-title"><ShieldCheck size={20} /><h2 id="sessions-title">{t("account.sessions")}</h2><span className="count">{sessions.data?.data.length ?? "-"}</span><button className="icon-button" title={t("account.refreshSessions")} aria-label={t("account.refreshSessions")} onClick={() => sessions.refetch()} disabled={sessions.isFetching}><RefreshCw size={17} className={sessions.isFetching ? "spin" : ""} /></button></div>
          {sessions.isPending && <p role="status">{t("account.loadingSessions")}</p>}
          {sessions.isError && <div className="message error" role="alert">{sessions.error.message}<button className="text-button" onClick={() => sessions.refetch()}>{t("account.retry")}</button></div>}
          <ul className="session-list">{sessions.data?.data.map(session => <li key={session.id}>
            <div className="device-icon">{session.platform === "android" ? <Smartphone size={23} /> : <Monitor size={23} />}</div>
            <div className="session-info"><strong>{session.device_name}</strong><span>{t(session.current ? "account.thisSession" : "account.otherSession")}</span><time dateTime={session.created_at}>{formatDate(session.created_at, user.timezone, language)}</time></div>
            {session.current ? <span className="current-label">{t("account.current")}</span> : <button className="icon-button revoke-button" title={t("account.revokeSession")} aria-label={t("account.revokeNamedSession", { name: session.device_name })} onClick={() => setConfirm({ path: `me/sessions/${session.id}`, method: "DELETE", current: false, label: "account.confirmRevoke", values: { name: session.device_name } })}><LogOut size={18} /></button>}
          </li>)}</ul>
          {(sessions.data?.data.length ?? 0) > 1 && <button className="secondary-button revoke-others" onClick={() => setConfirm({ path: "me/sessions/revoke-others", method: "POST", current: false, label: "account.confirmOthers" })}><LogOut size={17} />{t("account.signOutOthers")}</button>}
          <div className="security-events"><div className="section-title"><Clock3 size={19} /><h2>{t("account.securityActivity")}</h2></div>
            {events.isPending && <p>{t("account.loadingActivity")}</p>}
            {events.isError && <div role="alert" className="message error">{events.error.message}<button className="text-button" onClick={() => events.refetch()}>{t("account.retry")}</button></div>}
            {events.data?.data.length === 0 && <p>{t("account.emptyActivity")}</p>}
            <ul className="activity-list">{events.data?.data.slice(0, 5).map(event => <li key={event.id}><span className="activity-mark" /><span>{t(eventLabel(event.action))}</span><time dateTime={event.created_at}>{formatDate(event.created_at, user.timezone, language)}</time></li>)}</ul>
          </div>
        </section>
      </div>
    </main>
    {confirm && <ConfirmDialog title={t(confirm.label, confirm.values)} pending={revoke.isPending} error={revoke.isError ? revoke.error.message : ""} onCancel={() => setConfirm(null)} onConfirm={() => revoke.mutate(confirm)} />}
  </Shell>;
}

function ConfirmDialog({ title, pending, error, onCancel, onConfirm }: { title: string; pending: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const t = useText();
  const { language } = useLanguage();
  const [element, setElement] = useState<HTMLDialogElement | null>(null);
  useEffect(() => { element?.showModal(); return () => element?.close(); }, [element]);
  return <dialog ref={setElement} className={language === "en" ? undefined : styles.dialog} aria-labelledby="confirm-title" onCancel={event => { if (pending) event.preventDefault(); else onCancel(); }}><div className="dialog-heading"><h2 id="confirm-title">{title}</h2><button className="icon-button" aria-label={t("account.closeConfirmation")} title={t("account.closeConfirmation")} onClick={onCancel} disabled={pending}><X size={19} /></button></div>{error && <p role="alert" className="message error">{error}</p>}<div className="dialog-actions"><button className="secondary-button" onClick={onCancel} disabled={pending}>{t("account.cancel")}</button><button className="primary-button" onClick={onConfirm} disabled={pending}>{pending ? <LoaderCircle size={17} className="spin" /> : <LogOut size={17} />}{t("account.confirm")}</button></div></dialog>;
}

function formatDate(value: string, timezone: string, language: Language) {
  return new Intl.DateTimeFormat(language === "en" ? "en" : language === "te" ? "te-IN" : "hi-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

export function eventLabel(action: string): MessageId {
  return ({ "account.created": "account.eventCreated", "session.created": "account.eventSignedIn", "session.revoked": "account.eventSessionRevoked", "session.capacity_revoked": "account.eventOldestRevoked", "profile.updated": "account.eventProfileUpdated", "account.password_reset": "account.eventPasswordChanged" } as Record<string, MessageId>)[action] ?? "account.eventActivity";
}