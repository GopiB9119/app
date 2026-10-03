"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, ClipboardList, FileText, Globe, Inbox, LoaderCircle, LockKeyhole, MessageSquare, Plus, RefreshCw, Settings, UserPlus, UserRound, UsersRound } from "lucide-react";

import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useText } from "@/features/i18n/i18n";
import type { MessageId } from "@/features/i18n/messages";
import { characters, lengthProblem, readMembers, spaceSchema, spacesSchema } from "./client";
import type { FamilySpace } from "./client";
import { AccountIdentifier, InvitationInbox, ManageInvitations } from "./invitations";
import { ManageJoinRequests } from "./join-requests";
import { ManageMembers } from "./members";
import { ManageSpaceSettings } from "./settings";
import styles from "./spaces.module.css";

type SpaceType = "family" | "group" | "solo" | "couple";
type CreationIntent = { key: string; name: string; spaceType: SpaceType; visibility: "private" | "public"; description: string };
const DESCRIPTION_LIMIT = 280;
const created: Record<SpaceType, MessageId> = { family: "spaces.created.family", group: "spaces.created.group", solo: "spaces.created.solo", couple: "spaces.created.couple" };
const createTitles: Record<SpaceType, MessageId> = { family: "spaces.new.family", group: "spaces.new.group", solo: "spaces.new.solo", couple: "spaces.new.couple" };
const nameLabels: Record<SpaceType, MessageId> = { family: "spaces.form.familyName", group: "spaces.form.groupName", solo: "spaces.form.spaceName", couple: "spaces.form.spaceName" };
const typeLabels: Record<SpaceType, MessageId> = { family: "spaces.type.family", group: "spaces.type.group", solo: "spaces.type.solo", couple: "spaces.type.couple" };
const privacyNotes: Record<Exclude<SpaceType, "group">, MessageId> = {
  family: "spaces.form.familyPrivacy",
  solo: "spaces.form.soloPrivacy",
  couple: "spaces.form.couplePrivacy",
};

function canInvite(space: FamilySpace) {
  if (space.role !== "member") return space.space_type !== "solo";
  return space.member_invites && (space.space_type === "family" || space.space_type === "group");
}

function CoupleStatus({ accountId, spaceId, version }: { accountId: string; spaceId: string; version: string }) {
  const t = useText();
  // The Space version changes when someone joins or leaves, so a refreshed list re-reads the pair.
  const roster = useQuery({ queryKey: ["spaceMembers", accountId, spaceId, version],
    queryFn: ({ signal }) => readMembers(accountId, spaceId, signal), refetchOnWindowFocus: false });
  if (!roster.data) return null;
  const partner = roster.data.find(member => member.account_id !== accountId);
  return <p className={styles.description}>{partner ? t("spaces.couple.with", { name: partner.display_name }) : t("spaces.couple.waiting")}</p>;
}

export function SpacesScreen() {
  const t = useText();
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
    return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("spaces.loadingYours")}</main></Shell>;
  }
  if (!profile.data || profile.isError) {
    return <Shell account><main className={styles.main}><h1>{t("spaces.unavailable")}</h1><p role="alert">{profile.error?.message}</p><button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />{t("spaces.retry")}</button></main></Shell>;
  }
  return <FamilySpaces key={profile.data.data.id} user={profile.data.data} />;
}

function FamilySpaces({ user }: { user: Account }) {
  const t = useText();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [spaceType, setSpaceType] = useState<SpaceType>("family");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<CreationIntent | null>(null);
  const [notice, setNotice] = useState<MessageId | "">("");
  const [managedSpaceId, setManagedSpaceId] = useState<string | null>(null);
  const [membersSpaceId, setMembersSpaceId] = useState<string | null>(null);
  const [settingsSpaceId, setSettingsSpaceId] = useState<string | null>(null);
  const [requestsSpaceId, setRequestsSpaceId] = useState<string | null>(null);
  const spaces = useQuery({
    queryKey: ["spaces", user.id],
    queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }),
  });
  const create = useMutation({
    mutationFn: async (pending: CreationIntent) => {
      const group = pending.spaceType === "group";
      const result = await api("spaces", spaceSchema, {
      method: "POST",
      accountId: user.id,
      headers: { "Idempotency-Key": pending.key },
      body: group ? { name: pending.name, space_type: "group", visibility: pending.visibility, description: pending.description } : { name: pending.name, space_type: pending.spaceType },
      });
      if (result.data.space_type !== pending.spaceType || result.data.role !== "owner" || result.data.visibility !== (group ? pending.visibility : "private")) {
        throw new ApiError(502, "INVALID_RESPONSE", "The created Space could not be confirmed.");
      }
      return result;
    },
    onSuccess: async result => {
      setName("");
      setDescription("");
      setVisibility("private");
      setIntent(null);
      setNotice(result.data.visibility === "public" ? "spaces.created.publicGroup" : created[result.data.space_type]);
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
    if (!name && !description && !intent) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [name, description, intent]);

  const nameProblem = lengthProblem(name, 80);
  const descriptionProblem = spaceType === "group" ? lengthProblem(description, DESCRIPTION_LIMIT) : null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending || !name.trim() || (!intent && (nameProblem !== null || descriptionProblem !== null))) return;
    const group = spaceType === "group";
    const pending = intent ?? { key: crypto.randomUUID(), name: name.trim(), spaceType, visibility: group ? visibility : "private", description: group ? description.trim() : "" };
    setIntent(pending);
    setNotice("");
    create.mutate(pending);
  }

  const accountChanged = problem instanceof ApiError && (problem.status === 401 || problem.code === "ACCOUNT_CHANGED");
  const visible = !accountChanged && !spaces.isError ? spaces.data?.data ?? [] : [];
  const managedSpace = visible.find(space => space.id === managedSpaceId && space.space_type !== "solo");
  const membersSpace = visible.find(space => space.id === membersSpaceId);
  const requestsSpace = visible.find(space => space.id === requestsSpaceId && space.role !== "member" && space.space_type === "group");
  const dialogOpen = managedSpaceId !== null || membersSpaceId !== null || settingsSpaceId !== null || requestsSpaceId !== null;
  const choosing = intent !== null || accountChanged;
  // The link goes where each language puts {link} in the sentence.
  const [emptyStart, emptyEnd = ""] = t("spaces.empty.text").split("{link}");
  return <Shell account>
    <main className={styles.main}>
      <nav className={styles.navigation} aria-label={t("spaces.workspace")}>
        <Link href="/app/settings/account"><UserRound size={18} aria-hidden />{t("spaces.nav.account")}</Link>
        <span aria-current="page"><UsersRound size={18} aria-hidden />{t("spaces.nav.spaces")}</span>
        <Link href="/app/tasks"><ClipboardList size={18} aria-hidden />{t("spaces.nav.tasks")}</Link>
      </nav>
      <div className={styles.heading}>
        <div><span className="section-kicker">{t("spaces.kicker")}</span><h1>{t("spaces.title")}</h1></div>
        <div className={styles.headingActions}>
          <span className={styles.privacy}><LockKeyhole size={16} aria-hidden />{t("spaces.privacyNote")}</span>
          <Link className="secondary-button" href="/app/spaces/discover"><Globe size={17} aria-hidden />{t("spaces.findGroups")}</Link>
        </div>
      </div>
      <AccountIdentifier key={user.id} accountId={user.id} />
      {notice && <div className="message success" role="status"><Check size={18} aria-hidden />{t(notice)}</div>}
      <div className={styles.workspace}>
        <section className={styles.listSection} aria-labelledby="spaces-title">
          <div className={styles.sectionHeading}>
            <h2 id="spaces-title">{t("spaces.yours")}</h2>
            <button className="icon-button" title={t("spaces.refresh")} aria-label={t("spaces.refresh")} disabled={spaces.isFetching} onClick={() => spaces.refetch()}><RefreshCw size={18} className={spaces.isFetching ? "spin" : ""} aria-hidden /></button>
          </div>
          {spaces.isPending && <p role="status" aria-busy="true">{t("spaces.loading")}</p>}
          {spaces.isError && <div className="message error" role="alert">{spaces.error.message}<button className="text-button" onClick={() => spaces.refetch()}><RefreshCw size={16} aria-hidden />{t("spaces.retry")}</button></div>}
          {!spaces.isPending && !spaces.isError && spaces.data?.data.length === 0 && <div className={styles.empty}><UsersRound size={32} strokeWidth={1.5} aria-hidden /><h3>{t("spaces.empty.title")}</h3><p>{emptyStart}<Link href="/app/spaces/discover">{t("spaces.empty.link")}</Link>{emptyEnd}</p></div>}
          {!spaces.isError && !accountChanged && <ul className={styles.spaceList}>{spaces.data?.data.map(space => <li key={space.id}>
            <span className={styles.familyMark} aria-hidden>{space.visibility === "public" ? <Globe size={23} /> : <UsersRound size={23} />}</span>
            <div className={styles.spaceIdentity}><h3>{space.name}</h3><span>{t(typeLabels[space.space_type])} <span aria-hidden>/</span> {t(space.role === "owner" ? "spaces.role.owner" : space.role === "admin" ? "spaces.role.admin" : "spaces.role.member")}</span>
              {space.space_type === "couple" && <CoupleStatus accountId={user.id} spaceId={space.id} version={space.version} />}
              {space.description && <p className={styles.description}>{space.description}</p>}</div>
            <span className={styles.rowPrivacy}>{space.visibility === "public" ? <><Globe size={14} aria-hidden className={styles.publicMark} />{t("spaces.public")}</> : <><LockKeyhole size={14} aria-hidden />{t("spaces.private")}</>}</span>
            <div className={styles.spaceActions}>
              <Link className="icon-button" href={`/app/tasks?space_id=${space.id}`} title={t("spaces.tasksFor", { name: space.name })} aria-label={t("spaces.tasksFor", { name: space.name })}><ClipboardList size={18} aria-hidden /></Link>
              <Link className="icon-button" href={`/app/messages?space_id=${space.id}`} title={t("spaces.chatFor", { name: space.name })} aria-label={t("spaces.chatFor", { name: space.name })}><MessageSquare size={18} aria-hidden /></Link>
              <Link className="icon-button" href={`/app/events?space_id=${space.id}`} title={t("spaces.eventsFor", { name: space.name })} aria-label={t("spaces.eventsFor", { name: space.name })}><CalendarClock size={18} aria-hidden /></Link>
              <Link className="icon-button" href={`/app/documents?space_id=${space.id}`} title={t("spaces.documentsFor", { name: space.name })} aria-label={t("spaces.documentsFor", { name: space.name })}><FileText size={18} aria-hidden /></Link>
              {space.role === "owner" && <button className="icon-button" title={t("spaces.settingsFor", { name: space.name })} aria-label={t("spaces.settingsFor", { name: space.name })} disabled={dialogOpen} onClick={() => setSettingsSpaceId(space.id)}><Settings size={18} aria-hidden /></button>}
              {space.space_type !== "solo" && <button className="icon-button" title={t("spaces.membersOf", { name: space.name })} aria-label={t("spaces.membersOf", { name: space.name })} disabled={dialogOpen && membersSpaceId !== space.id} onClick={() => setMembersSpaceId(space.id)}><UsersRound size={18} aria-hidden /></button>}
              {canInvite(space) && <button className="icon-button" title={t("spaces.invitationsFor", { name: space.name })} aria-label={t("spaces.invitationsFor", { name: space.name })} disabled={dialogOpen && managedSpaceId !== space.id} onClick={() => setManagedSpaceId(space.id)}><UserPlus size={18} aria-hidden /></button>}
              {space.role !== "member" && space.space_type === "group" && <button className="icon-button" title={t("spaces.joinRequestsFor", { name: space.name })} aria-label={t("spaces.joinRequestsFor", { name: space.name })} disabled={dialogOpen && requestsSpaceId !== space.id} onClick={() => setRequestsSpaceId(space.id)}><Inbox size={18} aria-hidden /></button>}
            </div>
          </li>)}</ul>}
        </section>
        <section className={styles.createSection} aria-labelledby="create-space-title">
          <div className={styles.sectionHeading}><Plus size={19} aria-hidden /><h2 id="create-space-title">{t(createTitles[spaceType])}</h2></div>
          <form className={styles.form} onSubmit={submit}>
            <label><span id="space-type-label">{t("spaces.form.type")}</span><select aria-labelledby="space-type-label" value={spaceType} disabled={choosing} onChange={event => { setSpaceType(event.target.value as SpaceType); create.reset(); setNotice(""); }}><option value="family">{t("spaces.type.family")}</option><option value="couple">{t("spaces.type.couple")}</option><option value="group">{t("spaces.type.group")}</option><option value="solo">{t("spaces.type.solo")}</option></select></label>
            <label>{t(nameLabels[spaceType])}<input name="space_name" autoComplete="off" required minLength={1} maxLength={160} value={name} disabled={choosing} onChange={event => { setName(event.target.value); create.reset(); setNotice(""); }} /></label>
            {nameProblem && <span className="field-error">{t("spaces.lengthProblem", { limit: 80 })}</span>}
            {spaceType === "group" && <>
              <label>{t("spaces.form.description")}<textarea className={styles.textArea} name="space_description" maxLength={DESCRIPTION_LIMIT * 2} value={description} disabled={choosing} onChange={event => { setDescription(event.target.value); create.reset(); setNotice(""); }} placeholder={t("spaces.form.descriptionPlaceholder")} /></label>
              <span className={styles.counter}>{characters(description)}/{DESCRIPTION_LIMIT}</span>
              {descriptionProblem && <span className="field-error">{t("spaces.lengthProblem", { limit: DESCRIPTION_LIMIT })}</span>}
              <fieldset className={styles.visibilityChoice} disabled={choosing}>
                <legend>{t("spaces.form.whoCanFind")}</legend>
                <label className={styles.choice}><input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} />
                  <strong><LockKeyhole size={15} aria-hidden />{t("spaces.private")}</strong><small>{t("spaces.form.privateExplained")}</small></label>
                <label className={styles.choice}><input type="radio" name="visibility" value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} />
                  <strong><Globe size={15} aria-hidden className={styles.publicMark} />{t("spaces.public")}</strong><small>{t("spaces.form.publicExplained")}</small></label>
              </fieldset>
            </>}
            {spaceType !== "group" && <div className={styles.formPrivacy}><LockKeyhole size={16} aria-hidden /><span>{t(privacyNotes[spaceType])}</span></div>}
            {create.isError && <div className="message error" role="alert">{create.error.message}</div>}
            <button className="primary-button" type="submit" disabled={create.isPending || !name.trim() || accountChanged || (!intent && (nameProblem !== null || descriptionProblem !== null))}>
              {create.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
              {create.isPending ? t("spaces.creating") : intent ? t("spaces.form.retry") : t("spaces.form.create")}
            </button>
          </form>
        </section>
      </div>
      {managedSpace && <ManageInvitations key={managedSpace.id} user={user} space={managedSpace} ended={!canInvite(managedSpace)} onClose={() => setManagedSpaceId(null)} />}
      {membersSpace && <ManageMembers key={membersSpace.id} user={user} space={membersSpace} onClose={() => setMembersSpaceId(null)} />}
      {settingsSpaceId && !accountChanged && <ManageSpaceSettings key={`${user.id}:${settingsSpaceId}`} accountId={user.id} spaceId={settingsSpaceId} onClose={() => setSettingsSpaceId(null)} />}
      {requestsSpace && <ManageJoinRequests key={requestsSpace.id} user={user} space={requestsSpace} onClose={() => setRequestsSpaceId(null)} />}
      {!accountChanged && <InvitationInbox user={user} />}
    </main>
  </Shell>;
}