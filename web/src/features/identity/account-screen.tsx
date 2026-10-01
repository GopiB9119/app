"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Check, CheckCheck, Clock3, Globe2, LoaderCircle, LogOut, Monitor, RefreshCw, Save, ShieldBan, ShieldCheck, Smartphone, UserRound, X } from "lucide-react";
import { Account, ApiError, api, doneSchema, eventSchema, sessionSchema, userSchema } from "./client";
import { Shell } from "./shell";

export function AccountScreen() {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) window.location.replace("/login");
  }, [profile.error]);
  if (profile.isPending) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" />Loading your account</main></Shell>;
  if (!profile.data) return <Shell account><main className="auth-main"><h1>Account unavailable</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} />Retry</button></main></Shell>;
  return <AccountDetails key={profile.data.data.id} user={profile.data.data} etag={profile.data.etag} />;
}

function AccountDetails({ user, etag }: { user: Account; etag: string | null }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ display_name: user.display_name, timezone: user.timezone });
  const [draftVersion, setDraftVersion] = useState(etag);
  const [confirm, setConfirm] = useState<{ path: string; label: string; current: boolean; method: string } | null>(null);
  const sessions = useQuery({ queryKey: ["sessions", user.id], queryFn: ({ signal }) => api("me/sessions", z.array(sessionSchema), { accountId: user.id, signal }) });
  const events = useQuery({ queryKey: ["events", user.id], queryFn: ({ signal }) => api("me/security-events", z.array(eventSchema), { accountId: user.id, signal }) });
  const zones = useQuery({ queryKey: ["timezones"], queryFn: ({ signal }) => api("timezones", z.array(z.string()), { signal }) });
  const changed = draft.display_name !== user.display_name || draft.timezone !== user.timezone;

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
    onSuccess: result => {
      queryClient.setQueryData(["me"], result);
      setDraft({ display_name: result.data.display_name, timezone: result.data.timezone });
      setDraftVersion(result.etag); setNotice("Profile saved."); setError("");
      queryClient.invalidateQueries({ queryKey: ["events", user.id] });
    }, onError: report,
  });
  const revoke = useMutation({
    mutationFn: (intent: NonNullable<typeof confirm>) => api(intent.path, doneSchema, { method: intent.method, body: {}, accountId: user.id }),
    onSuccess: (_response, intent) => {
      setConfirm(null);
      if (intent.current) { queryClient.clear(); window.location.replace("/login"); return; }
      setNotice("Session access revoked."); setError("");
      queryClient.invalidateQueries({ queryKey: ["sessions", user.id] });
      queryClient.invalidateQueries({ queryKey: ["events", user.id] });
    }, onError: report,
  });

  async function reloadProfile() {
    try {
      const result = await api("me", userSchema);
      queryClient.setQueryData(["me"], result);
      setDraft({ display_name: result.data.display_name, timezone: result.data.timezone });
      setDraftVersion(result.etag); setError(""); setNotice("");
    } catch (problem) { report(problem as Error); }
  }

  const timezoneOptions = zones.data?.data ?? [user.timezone];
  return <Shell account>
    <main className="account-main">
      <nav className="workspace-nav" aria-label="Profile"><span className="nav-active"><UserRound size={18} />Account</span><Link className="text-button" href="/app/safety"><ShieldBan size={18} aria-hidden />Blocked</Link><button className="text-button" onClick={() => setConfirm({ path: "auth/logout", method: "POST", current: true, label: "Sign out of this session?" })}><LogOut size={17} />Sign out</button></nav>
      <div className="account-heading"><div><span className="section-kicker">PERSONAL SETTINGS</span><h1>Your account</h1><p>Profile &amp; security</p></div><div className="verified-badge"><ShieldCheck size={17} />Email verified</div></div>
      {notice && <div className="message success" role="status"><Check size={18} />{notice}</div>}
      {error && <div className="message error" role="alert">{error}<button className="text-button" onClick={reloadProfile}><RefreshCw size={16} />Reload profile</button></div>}
      <div className="account-grid">
        <section className="profile-section" aria-labelledby="profile-title">
          <div className="section-title"><UserRound size={20} /><h2 id="profile-title">Profile</h2></div>
          <div className="person-row"><div className="avatar" aria-hidden>{user.display_name.split(" ").map(value => value[0]).slice(0, 2).join("").toUpperCase()}</div><div><strong>{user.display_name}</strong><span>{user.email}</span></div><CheckCheck className="person-check" size={19} aria-hidden /></div>
          <form className="profile-form" onSubmit={event => { event.preventDefault(); setNotice(""); setError(""); save.mutate(); }}>
            <label>Display name<input name="display_name" autoComplete="name" required maxLength={80} value={draft.display_name} onChange={event => setDraft({ ...draft, display_name: event.target.value })} /></label>
            <label><span id="profile-timezone-label">Timezone</span><div className="input-label-icon"><Globe2 size={16} aria-hidden /><select name="timezone" aria-labelledby="profile-timezone-label" value={draft.timezone} onChange={event => setDraft({ ...draft, timezone: event.target.value })}>{timezoneOptions.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></div></label>
            <div className="form-actions"><button className="primary-button" type="submit" disabled={!changed || save.isPending}>{save.isPending ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}Save changes</button>{changed && <button type="button" className="text-button" onClick={() => { setDraft({ display_name: user.display_name, timezone: user.timezone }); setDraftVersion(etag); }}>Discard</button>}</div>
          </form>
          <div className="account-facts"><span>Account status<strong><span className="status-square" />Active</strong></span><span>Email verification<strong>Verified</strong></span></div>
        </section>
        <section className="sessions-section" aria-labelledby="sessions-title">
          <div className="section-title"><ShieldCheck size={20} /><h2 id="sessions-title">Active sessions</h2><span className="count">{sessions.data?.data.length ?? "-"}</span><button className="icon-button" title="Refresh sessions" aria-label="Refresh sessions" onClick={() => sessions.refetch()} disabled={sessions.isFetching}><RefreshCw size={17} className={sessions.isFetching ? "spin" : ""} /></button></div>
          {sessions.isPending && <p role="status">Loading sessions...</p>}
          {sessions.isError && <div className="message error" role="alert">{sessions.error.message}<button className="text-button" onClick={() => sessions.refetch()}>Retry</button></div>}
          <ul className="session-list">{sessions.data?.data.map(session => <li key={session.id}>
            <div className="device-icon">{session.platform === "android" ? <Smartphone size={23} /> : <Monitor size={23} />}</div>
            <div className="session-info"><strong>{session.device_name}</strong><span>{session.current ? "This session" : "Another session"}</span><time dateTime={session.created_at}>{formatDate(session.created_at, user.timezone)}</time></div>
            {session.current ? <span className="current-label">Current</span> : <button className="icon-button revoke-button" title="Revoke session" aria-label={`Revoke ${session.device_name} session`} onClick={() => setConfirm({ path: `me/sessions/${session.id}`, method: "DELETE", current: false, label: `Revoke access for ${session.device_name}?` })}><LogOut size={18} /></button>}
          </li>)}</ul>
          {(sessions.data?.data.length ?? 0) > 1 && <button className="secondary-button revoke-others" onClick={() => setConfirm({ path: "me/sessions/revoke-others", method: "POST", current: false, label: "Sign out all other sessions?" })}><LogOut size={17} />Sign out other sessions</button>}
          <div className="security-events"><div className="section-title"><Clock3 size={19} /><h2>Recent security activity</h2></div>
            {events.isPending && <p>Loading activity...</p>}
            {events.isError && <div role="alert" className="message error">{events.error.message}<button className="text-button" onClick={() => events.refetch()}>Retry</button></div>}
            {events.data?.data.length === 0 && <p>No recent activity.</p>}
            <ul className="activity-list">{events.data?.data.slice(0, 5).map(event => <li key={event.id}><span className="activity-mark" /><span>{eventLabel(event.action)}</span><time dateTime={event.created_at}>{formatDate(event.created_at, user.timezone)}</time></li>)}</ul>
          </div>
        </section>
      </div>
    </main>
    {confirm && <ConfirmDialog title={confirm.label} pending={revoke.isPending} error={revoke.isError ? revoke.error.message : ""} onCancel={() => setConfirm(null)} onConfirm={() => revoke.mutate(confirm)} />}
  </Shell>;
}

function ConfirmDialog({ title, pending, error, onCancel, onConfirm }: { title: string; pending: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const [element, setElement] = useState<HTMLDialogElement | null>(null);
  useEffect(() => { element?.showModal(); return () => element?.close(); }, [element]);
  return <dialog ref={setElement} aria-labelledby="confirm-title" onCancel={event => { if (pending) event.preventDefault(); else onCancel(); }}><div className="dialog-heading"><h2 id="confirm-title">{title}</h2><button className="icon-button" aria-label="Close confirmation" title="Close confirmation" onClick={onCancel} disabled={pending}><X size={19} /></button></div>{error && <p role="alert" className="message error">{error}</p>}<div className="dialog-actions"><button className="secondary-button" onClick={onCancel} disabled={pending}>Cancel</button><button className="primary-button" onClick={onConfirm} disabled={pending}>{pending ? <LoaderCircle size={17} className="spin" /> : <LogOut size={17} />}Confirm</button></div></dialog>;
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

function eventLabel(action: string) {
  return ({ "account.created": "Account created", "session.created": "Signed in", "session.revoked": "Session revoked", "session.capacity_revoked": "Oldest session revoked", "profile.updated": "Profile updated", "account.password_reset": "Password changed" } as Record<string, string>)[action] ?? "Account activity";
}