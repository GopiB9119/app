"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { CalendarDays, LoaderCircle, Pill, RefreshCw } from "lucide-react";
import { homeFeed } from "@/features/community/client";
import { ApiError, api, userSchema } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { Shell } from "@/features/identity/shell";
import { useLanguage, useText } from "@/features/i18n/i18n";
import type { Language, MessageId } from "@/features/i18n/messages";
import { calendarPage, compareCalendarEntries, dateInZone } from "@/features/planning/calendar-client";
import type { CalendarEntry } from "@/features/planning/calendar-client";
import { notificationPage, reminderRequestPage } from "@/features/scheduling/client";
import { invitationPage, pendingJoinRequests, spacesSchema } from "@/features/spaces/client";
import type { FamilySpace } from "@/features/spaces/client";
import styles from "./home.module.css";

const SHOWN = 3;

// Home is a personal overview (DEC-014). Each section loads and fails on its own, and shows only what the person
// can already see on the screen its "View all" opens.
export function HomeScreen() {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  const signedOut = profile.error instanceof ApiError && profile.error.status === 401;
  useEffect(() => { if (signedOut) window.location.replace("/login"); }, [signedOut]);
  if (profile.isPending || signedOut) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />{t("home.loading")}</main></Shell>;
  if (profile.isError || !profile.data) {
    return <Shell account><main className={styles.main}><h1>{t("home.title")}</h1>
      <p className="message error" role="alert">{profile.error?.message ?? t("home.error")}</p>
      <button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />{t("home.retry")}</button>
    </main></Shell>;
  }
  return <Overview key={profile.data.data.id} user={profile.data.data} />;
}

function Overview({ user }: { user: Account }) {
  const t = useText();
  const spaces = useQuery({ queryKey: ["spaces", user.id], queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }) });
  return <Shell account><main className={styles.main}>
    <div className={styles.heading}>
      <h1>{t("home.title")}</h1>
      <nav className={styles.shortcuts} aria-label={t("home.shortcuts")}>
        <Link href="/app/calendar"><CalendarDays size={18} aria-hidden />{t("home.calendar")}</Link>
        <Link href="/app/care"><Pill size={18} aria-hidden />{t("home.medicines")}</Link>
      </nav>
    </div>
    <NeedsAttention user={user} spaces={spaces} />
    <Today user={user} spaces={spaces} />
    <YourSpaces spaces={spaces} />
    <FromPages user={user} />
  </main></Shell>;
}

type SpacesQuery = UseQueryResult<{ data: FamilySpace[] }>;

function Section({ id, title, more, moreLabel, children }: { id: string; title: string; more: string; moreLabel: string; children: React.ReactNode }) {
  const t = useText();
  return <section className={styles.section} aria-labelledby={id}>
    <div className={styles.sectionHead}><h2 id={id}>{title}</h2><Link href={more} aria-label={moreLabel}>{t("home.viewAll")}</Link></div>
    {children}
  </section>;
}

function Problem({ text, retry }: { text: string; retry: () => void }) {
  const t = useText();
  return <p className={styles.problem} role="alert">{text}<button className="text-button" onClick={retry}><RefreshCw size={16} aria-hidden />{t("home.retry")}</button></p>;
}

function Waiting({ text }: { text: string }) {
  return <p className={styles.quiet} aria-busy="true"><LoaderCircle className="spin" size={16} aria-hidden />{text}</p>;
}

const clock = (value: string, timezone: string, language: Language = "en") => new Intl.DateTimeFormat(language === "en" ? "en-GB" : language === "te" ? "te-IN" : "hi-IN", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const dayAndClock = (value: string, timezone: string, language: Language = "en") => new Intl.DateTimeFormat(language === "en" ? "en-GB" : language === "te" ? "te-IN" : "hi-IN", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

type Attention = { key: string; text: string; detail?: string; href: string; action: string };

function NeedsAttention({ user, spaces }: { user: Account; spaces: SpacesQuery }) {
  const t = useText();
  const { language } = useLanguage();
  const invitations = useQuery({ queryKey: ["home", user.id, "invitations"], queryFn: ({ signal }) => invitationPage("invitations", user.id, null, signal) });
  const requests = useQuery({ queryKey: ["home", user.id, "reminder-requests"], queryFn: ({ signal }) => reminderRequestPage(user.id, "received", null, signal) });
  const inbox = useQuery({ queryKey: ["home", user.id, "inbox"], queryFn: ({ signal }) => notificationPage(user.id, null, signal) });
  // The same groups whose join requests the Spaces screen lets this person answer: the owner's and an admin's.
  const reviewed = (spaces.data?.data ?? []).filter(space => space.role !== "member" && space.space_type === "group");
  const joins = useQueries({ queries: reviewed.map(space => ({
    queryKey: ["home", user.id, "join-requests", space.id], queryFn: ({ signal }: { signal: AbortSignal }) => pendingJoinRequests(user.id, space.id, signal),
  })) });
  const now = Date.now();
  const groups: { name: string; checking: MessageId; problem: MessageId; items: Attention[]; query: { isPending: boolean; isError: boolean; refetch: () => unknown } }[] = [
    { name: "invitations", checking: "home.checkingInvitations", problem: "home.failedInvitations", query: invitations, items: (invitations.data?.data ?? []).filter(item => item.status === "pending" && Date.parse(item.expires_at) > now).map(item => ({
      key: `invitation-${item.id}`, text: t("home.invitation", { name: item.inviter_name, space: item.space_name }), href: "/app/spaces", action: t("home.reviewInvitation"),
    })) },
    { name: "join requests", checking: "home.checkingJoins", problem: "home.failedJoins", query: { isPending: spaces.isPending || joins.some(join => join.isPending), isError: spaces.isError || joins.some(join => join.isError),
      refetch: () => { void spaces.refetch(); joins.filter(join => join.isError).forEach(join => void join.refetch()); } },
    items: reviewed.flatMap((space, index) => (joins[index]?.data ?? []).map(item => ({
      key: `join-${item.id}`, text: t("home.joinRequest", { name: item.display_name, space: space.name }), href: "/app/spaces", action: t("home.reviewRequest"),
    }))) },
    { name: "reminder requests", checking: "home.checkingRequests", problem: "home.failedRequests", query: requests, items: (requests.data?.data ?? []).filter(item => item.status === "pending").map(item => ({
      key: `request-${item.id}`, text: t("home.reminderRequest", { name: item.requested_by.display_name, title: item.task_title }),
      detail: dayAndClock(item.scheduled_at, user.timezone, language), href: "/app/reminders", action: t("home.reviewRequest"),
    })) },
    { name: "reminders", checking: "home.checkingReminders", problem: "home.failedReminders", query: inbox, items: (inbox.data?.data ?? []).filter(item => item.acknowledged_at === null).map(item => ({
      key: `reminder-${item.id}`, text: t("home.reminder", { title: item.task_title }), detail: dayAndClock(item.scheduled_at, user.timezone, language),
      href: "/app/notifications", action: t("home.openInbox"),
    })) },
  ];
  const loaded = groups.filter(group => !group.query.isPending && !group.query.isError);
  const items = loaded.flatMap(group => group.items);
  return <Section id="home-attention" title={t("home.attention")} more="/app/notifications" moreLabel={t("home.viewInbox")}>
    {items.length > 0 && <ul className={styles.list}>
      {items.slice(0, SHOWN * 2).map(item => <li key={item.key} className={styles.row}>
        <span className={styles.text}>{item.text}{item.detail && <span className={styles.detail}>{item.detail}</span>}</span>
        <Link href={item.href}>{item.action}</Link>
      </li>)}
    </ul>}
    {items.length > SHOWN * 2 && <p className={styles.quiet}>{t("home.more", { count: items.length - SHOWN * 2 })}</p>}
    {groups.filter(group => group.query.isPending).map(group => <Waiting key={group.name} text={t(group.checking)} />)}
    {groups.filter(group => group.query.isError).map(group => <Problem key={group.name} text={t(group.problem)} retry={() => void group.query.refetch()} />)}
    {loaded.length === groups.length && items.length === 0 && <p className={styles.quiet}>{t("home.attentionEmpty")}</p>}
  </Section>;
}

// Today's tasks, reminders and events, from each Space's calendar in the person's timezone.
async function todayIn(accountId: string, spaceId: string, today: string, timezone: string, signal: AbortSignal) {
  const found: CalendarEntry[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const result = await calendarPage(accountId, spaceId, today.slice(0, 7), timezone, cursor, signal);
    found.push(...result.data.filter(entry => entry.date === today));
    if (!result.pagination.has_more || result.data.some(entry => entry.date > today) || !result.pagination.next_cursor) return found;
    cursor = result.pagination.next_cursor;
  }
  throw new ApiError(502, "CALENDAR_TOO_LONG", "Today's plans could not all be loaded.");
}

const kindIds = { task: "home.kind.task", reminder: "home.kind.reminder", planned: "home.kind.planned" } as const;
const active = (entry: CalendarEntry) => entry.kind === "task" ? entry.status === "open" || entry.status === "in_progress"
  : entry.kind === "event" ? entry.status === "scheduled" : entry.kind === "planned" || entry.status === "scheduled" || entry.status === "available";
const entryLink = (entry: CalendarEntry) => entry.kind === "event" ? `/app/events?space_id=${entry.space_id}` : entry.kind === "task" ? `/app/tasks?space_id=${entry.space_id}` : "/app/reminders";

function Today({ user, spaces }: { user: Account; spaces: SpacesQuery }) {
  const t = useText();
  const { language } = useLanguage();
  const today = useMemo(() => dateInZone(new Date(), user.timezone), [user.timezone]);
  const list = spaces.data?.data ?? [];
  const days = useQueries({ queries: list.map(space => ({
    queryKey: ["home", user.id, "today", space.id, today, user.timezone],
    queryFn: ({ signal }: { signal: AbortSignal }) => todayIn(user.id, space.id, today, user.timezone, signal),
  })) });
  const names = new Map(list.map(space => [space.id, space.name]));
  const entries = days.flatMap(day => day.data ?? []).filter(active).sort(compareCalendarEntries);
  const failed = list.filter((_, index) => days[index]?.isError);
  const pending = spaces.isPending || days.some(day => day.isPending);
  return <Section id="home-today" title={t("home.today")} more="/app/calendar" moreLabel={t("home.viewCalendar")}>
    {spaces.isError && <Problem text={t("home.spacesError")} retry={() => void spaces.refetch()} />}
    {entries.length > 0 && <ul className={styles.list}>
      {entries.map(entry => <li key={`${entry.kind}-${entry.id}`} className={styles.row} data-kind={entry.kind}>
        <span className={styles.when}>{entry.kind === "task" ? t("home.today") : clock(entry.scheduled_at, user.timezone, entry.kind === "event" ? "en" : language)}</span>
        <span className={styles.text}>{entry.title}<span className={styles.detail}>{entry.kind === "event" ? "Event" : t(kindIds[entry.kind])} · {names.get(entry.space_id)}</span></span>
        <Link href={entryLink(entry)} aria-label={entry.kind === "event" ? `Open ${entry.title}` : t("home.openItem", { title: entry.title })}>{entry.kind === "event" ? "Open" : t("home.open")}</Link>
      </li>)}
    </ul>}
    {pending && <Waiting text={t("home.loadingToday")} />}
    {failed.map(space => <Problem key={space.id} text={t("home.todayError", { space: space.name })}
      retry={() => void days[list.indexOf(space)]?.refetch()} />)}
    {!pending && !spaces.isError && failed.length === 0 && entries.length === 0 && <p className={styles.quiet}>{t("home.todayEmpty")}</p>}
  </Section>;
}

function YourSpaces({ spaces }: { spaces: SpacesQuery }) {
  const t = useText();
  const list = spaces.data?.data ?? [];
  const [beforeLink, afterLink] = t("home.spacesEmpty").split("{link}");
  return <Section id="home-spaces" title={t("home.spaces")} more="/app/spaces" moreLabel={t("home.viewSpaces")}>
    {spaces.isPending && <Waiting text={t("home.loadingSpaces")} />}
    {spaces.isError && <Problem text={t("home.spacesError")} retry={() => void spaces.refetch()} />}
    {list.length > 0 && <ul className={styles.list}>
      {list.slice(0, SHOWN + 1).map(space => <li key={space.id} className={styles.row}>
        <span className={styles.text}>{space.name}<span className={styles.detail}>{t(`home.type.${space.space_type}`)} · {t(`home.role.${space.role}`)}</span></span>
        <Link href={`/app/tasks?space_id=${space.id}`} aria-label={t("home.tasksIn", { space: space.name })}>{t("home.tasks")}</Link>
      </li>)}
    </ul>}
    {list.length > SHOWN + 1 && <p className={styles.quiet}>{t("home.more", { count: list.length - SHOWN - 1 })}</p>}
    {spaces.isSuccess && list.length === 0 && <p className={styles.quiet}>{beforeLink}<Link href="/app/spaces">{t("home.createOrJoin")}</Link>{afterLink}</p>}
  </Section>;
}

function FromPages({ user }: { user: Account }) {
  const t = useText();
  const { language } = useLanguage();
  const feed = useQuery({ queryKey: ["home", user.id, "feed"], queryFn: ({ signal }) => homeFeed(user.id, null, signal) });
  const posts = feed.data?.items ?? [];
  const [beforeLink, afterLink] = t("home.pagesEmpty").split("{link}");
  return <Section id="home-pages" title={t("home.pages")} more="/app/home" moreLabel={t("home.viewPosts")}>
    {feed.isPending && <Waiting text={t("home.loadingPosts")} />}
    {feed.isError && <Problem text={t("home.postsError")} retry={() => void feed.refetch()} />}
    {posts.length > 0 && <ul className={styles.list}>
      {posts.slice(0, SHOWN).map(post => <li key={post.id} className={styles.row}>
        <span className={styles.text}>{post.title ?? post.body.slice(0, 120)}<span className={styles.detail}>{post.page_name}{post.published_at ? ` · ${dayAndClock(post.published_at, user.timezone, language)}` : ""}</span></span>
        <Link href={`/posts/${post.id}`} aria-label={post.title !== null ? t("home.readItem", { title: post.title }) : t("home.readFrom", { name: post.page_name })}>{t("home.read")}</Link>
      </li>)}
    </ul>}
    {feed.isSuccess && posts.length === 0 && <p className={styles.quiet}>{beforeLink}<Link href="/app/discover">{t("home.findPages")}</Link>{afterLink}</p>}
  </Section>;
}
