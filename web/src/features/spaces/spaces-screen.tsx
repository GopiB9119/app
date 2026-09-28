"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, LoaderCircle, LockKeyhole, Plus, RefreshCw, UserPlus, UserRound, UsersRound } from "lucide-react";

import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { spaceSchema, spacesSchema } from "./client";
import { AccountIdentifier, InvitationInbox, ManageInvitations } from "./invitations";
import { ManageMembers } from "./members";
import styles from "./spaces.module.css";

type CreationIntent = { key: string; name: string };

export function SpacesScreen() {
  const profile = useQuery({
    queryKey: ["me"],
    queryFn: ({ signal }) => api("me", userSchema, { signal }),
  });

  useEffect(() => {
    if (profile.error instanceof ApiError && profile.error.status === 401) {
      window.location.replace("/login");
    }
  }, [profile.error]);

  if (profile.isPending) {
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading your Spaces</main></Shell>;
  }
  if (!profile.data || profile.isError) {
    return <Shell account><main className={styles.main}><h1>Spaces unavailable</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />Retry</button></main></Shell>;
  }
  return <FamilySpaces key={profile.data.data.id} user={profile.data.data} />;
}

function FamilySpaces({ user }: { user: Account }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [intent, setIntent] = useState<CreationIntent | null>(null);
  const [notice, setNotice] = useState("");
  const [managedSpaceId, setManagedSpaceId] = useState<string | null>(null);
  const [membersSpaceId, setMembersSpaceId] = useState<string | null>(null);
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  const create = useMutation({
    mutationFn: (pending: CreationIntent) => api("spaces", spaceSchema, {
      method: "POST",
      accountId: user.id,
      headers: { "Idempotency-Key": pending.key },
      body: { name: pending.name, space_type: "family" },
    }),
    onSuccess: async () => {
      setName("");
      setIntent(null);
      setNotice("Family Space created.");
      await queryClient.invalidateQueries({ queryKey: ["spaces", user.id] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) {
        setIntent(null);
      }
    },
  });

  const problem = create.error ?? spaces.error;
  useEffect(() => {
    if (problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED")) {
      queryClient.clear();
      window.location.replace(problem.status === 401 ? "/login" : "/app/spaces");
    }
  }, [problem, queryClient]);

  useEffect(() => {
    if (!name && !intent) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [name, intent]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending || !name.trim()) return;
    const pending = intent ?? { key: crypto.randomUUID(), name: name.trim() };
    setIntent(pending);
    setNotice("");
    create.mutate(pending);
  }

  const accountChanged = problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED");
  const managedSpace = !accountChanged && !spaces.isError ? spaces.data?.data.find(space => space.id === managedSpaceId && space.role === "owner") : undefined;
  const membersSpace = !accountChanged && !spaces.isError ? spaces.data?.data.find(space => space.id === membersSpaceId) : undefined;
  return <Shell account>
    <main className={styles.main}>
      <nav className={styles.navigation} aria-label="Workspace">
        <Link href="/app/settings/account"><UserRound size={18} aria-hidden />Account</Link>
        <span aria-current="page"><UsersRound size={18} aria-hidden />Spaces</span>
        <Link href="/app/tasks"><ClipboardList size={18} aria-hidden />Tasks</Link>
      </nav>
      <div className={styles.heading}>
        <div><span className="section-kicker">WORKSPACE</span><h1>Family Spaces</h1></div>
        <span className={styles.privacy}><LockKeyhole size={16} aria-hidden />Private</span>
      </div>
      <AccountIdentifier key={user.id} accountId={user.id} />
      {notice && <div className="message success" role="status"><Check size={18} aria-hidden />{notice}</div>}
      <div className={styles.workspace}>
        <section className={styles.listSection} aria-labelledby="spaces-title">
          <div className={styles.sectionHeading}>
            <h2 id="spaces-title">Your Spaces</h2>
            <button className="icon-button" title="Refresh Spaces" aria-label="Refresh Spaces" disabled={spaces.isFetching} onClick={() => spaces.refetch()}><RefreshCw size={18} className={spaces.isFetching ? "spin" : ""} aria-hidden /></button>
          </div>
          {spaces.isPending && <p role="status" aria-busy="true">Loading Spaces...</p>}
          {spaces.isError && <div className="message error" role="alert">{spaces.error.message}<button className="text-button" onClick={() => spaces.refetch()}><RefreshCw size={16} aria-hidden />Retry</button></div>}
          {!spaces.isPending && !spaces.isError && spaces.data?.data.length === 0 && <div className={styles.empty}><UsersRound size={32} strokeWidth={1.5} aria-hidden /><h3>No family Spaces yet</h3></div>}
          {!spaces.isError && !accountChanged && <ul className={styles.spaceList}>{spaces.data?.data.map(space => <li key={space.id}>
            <span className={styles.familyMark} aria-hidden><UsersRound size={23} /></span>
            <div className={styles.spaceIdentity}><h3>{space.name}</h3><span>Family <span aria-hidden>/</span> {space.role === "owner" ? "Owner" : "Member"}</span></div>
            <span className={styles.rowPrivacy}><LockKeyhole size={14} aria-hidden />Private</span>
            <div className={styles.spaceActions}>
              <Link className="icon-button" href={`/app/tasks?space_id=${space.id}`} title={`Tasks for ${space.name}`} aria-label={`Tasks for ${space.name}`}><ClipboardList size={18} aria-hidden /></Link>
              <button className="icon-button" title={`Members of ${space.name}`} aria-label={`Members of ${space.name}`} disabled={managedSpaceId !== null || (membersSpaceId !== null && membersSpaceId !== space.id)} onClick={() => setMembersSpaceId(space.id)}><UsersRound size={18} aria-hidden /></button>
              {space.role === "owner" && <button className="icon-button" title={`Manage invitations for ${space.name}`} aria-label={`Manage invitations for ${space.name}`} disabled={membersSpaceId !== null || (managedSpaceId !== null && managedSpaceId !== space.id)} onClick={() => setManagedSpaceId(space.id)}><UserPlus size={18} aria-hidden /></button>}
            </div>
          </li>)}</ul>}
        </section>
        <section className={styles.createSection} aria-labelledby="create-space-title">
          <div className={styles.sectionHeading}><Plus size={19} aria-hidden /><h2 id="create-space-title">New family Space</h2></div>
          <form className={styles.form} onSubmit={submit}>
            <label>Family name<input name="space_name" autoComplete="off" required minLength={1} maxLength={80} value={name} disabled={intent !== null || accountChanged} onChange={event => { setName(event.target.value); create.reset(); setNotice(""); }} /></label>
            <div className={styles.formPrivacy}><LockKeyhole size={16} aria-hidden /><span>Private family Space</span></div>
            {create.isError && <div className="message error" role="alert">{create.error.message}</div>}
            <button className="primary-button" type="submit" disabled={create.isPending || !name.trim() || accountChanged}>
              {create.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
              {create.isPending ? "Creating..." : intent ? "Retry creation" : "Create Space"}
            </button>
          </form>
        </section>
      </div>
      {managedSpace && <ManageInvitations key={managedSpace.id} user={user} space={managedSpace} onClose={() => setManagedSpaceId(null)} />}
      {membersSpace && <ManageMembers key={membersSpace.id} user={user} space={membersSpace} onClose={() => setMembersSpaceId(null)} />}
      {!accountChanged && <InvitationInbox user={user} />}
    </main>
  </Shell>;
}