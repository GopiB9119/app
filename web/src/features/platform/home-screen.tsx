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
import { calendarPage, compareCalendarEntries, dateInZone } from "@/features/planning/calendar-client";
import type { CalendarEntry } from "@/features/planning/calendar-client";
import { notificationPage, reminderRequestPage } from "@/features/scheduling/client";
import { invitationPage, pendingJoinRequests, spacesSchema, spaceTypeLabels } from "@/features/spaces/client";
import type { FamilySpace } from "@/features/spaces/client";
import styles from "./home.module.css";

const SHOWN = 3;

// Home is a personal overview (DEC-014). Each section loads and fails on its own, and shows only what the person
// can already see on the screen its "View all" opens.
export function HomeScreen() {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }) });
  const signedOut = profile.error instanceof ApiError && profile.error.status === 401;
  useEffect(() => { if (signedOut) window.location.replace("/login"); }, [signedOut]);
  if (profile.isPending || signedOut) return <Shell account><main className="account-loading" aria-busy="true"><LoaderCircle className="spin" aria-hidden />Loading Home</main></Shell>;
  if (profile.isError || !profile.data) {
    return <Shell account><main className={styles.main}><h1>Home</h1>
      <p className="message error" role="alert">{profile.error?.message ?? "Home could not be loaded."}</p>
      <button className="secondary-button" onClick={() => profile.refetch()}><RefreshCw size={17} aria-hidden />Retry</button>
    </main></Shell>;
  }
  return <Overview key={profile.data.data.id} user={profile.data.data} />;
}

function Overview({ user }: { user: Account }) {
  const spaces = useQuery({ queryKey: ["spaces", user.id], queryFn: ({ signal }) => api("spaces?limit=50", spacesSchema, { accountId: user.id, signal }) });
  return <Shell account><main className={styles.main}>
    <div className={styles.heading}>
      <h1>Home</h1>
      <nav className={styles.shortcuts} aria-label="Open">
        <Link href="/app/calendar"><CalendarDays size={18} aria-hidden />Calendar</Link>
        <Link href="/app/care"><Pill size={18} aria-hidden />Medicines</Link>
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
  return <section className={styles.section} aria-labelledby={id}>
    <div className={styles.sectionHead}><h2 id={id}>{title}</h2><Link href={more} aria-label={moreLabel}>View all</Link></div>
    {children}
  </section>;
}

function Problem({ text, retry }: { text: string; retry: () => void }) {
  return <p className={styles.problem} role="alert">{text}<button className="text-button" onClick={retry}><RefreshCw size={16} aria-hidden />Retry</button></p>;
}

function Waiting({ text }: { text: string }) {
  return <p className={styles.quiet} aria-busy="true"><LoaderCircle className="spin" size={16} aria-hidden />{text}</p>;
}

const clock = (value: string, timezone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const dayAndClock = (value: string, timezone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

type Attention = { key: string; text: string; detail?: string; href: string; action: string };

function NeedsAttention({ user, spaces }: { user: Account; spaces: SpacesQuery }) {
  const invitations = useQuery({ queryKey: ["home", user.id, "invitations"], queryFn: ({ signal }) => invitationPage("invitations", user.id, null, signal) });
  const requests = useQuery({ queryKey: ["home", user.id, "reminder-requests"], queryFn: ({ signal }) => reminderRequestPage(user.id, "received", null, signal) });
  const inbox = useQuery({ queryKey: ["home", user.id, "inbox"], queryFn: ({ signal }) => notificationPage(user.id, null, signal) });
  // Only public groups take join requests, and only their owner reviews them.
  const reviewed = (spaces.data?.data ?? []).filter(space => space.role === "owner" && space.space_type === "group" && space.visibility === "public");
  const joins = useQueries({ queries: reviewed.map(space => ({
    queryKey: ["home", user.id, "join-requests", space.id], queryFn: ({ signal }: { signal: AbortSignal }) => pendingJoinRequests(user.id, space.id, signal),
  })) });
  const now = Date.now();
  const groups: { name: string; items: Attention[]; query: { isPending: boolean; isError: boolean; refetch: () => unknown } }[] = [
    { name: "invitations", query: invitations, items: (invitations.data?.data ?? []).filter(item => item.status === "pending" && Date.parse(item.expires_at) > now).map(item => ({
      key: `invitation-${item.id}`, text: `${item.inviter_name} invited you to ${item.space_name}`, href: "/app/spaces", action: "Review invitation",
    })) },
    { name: "join requests", query: { isPending: spaces.isPending || joins.some(join => join.isPending), isError: spaces.isError || joins.some(join => join.isError),
      refetch: () => { void spaces.refetch(); joins.filter(join => join.isError).forEach(join => void join.refetch()); } },
    items: reviewed.flatMap((space, index) => (joins[index]?.data ?? []).map(item => ({
      key: `join-${item.id}`, text: `${item.display_name} asks to join ${space.name}`, href: "/app/spaces", action: "Review request",
    }))) },
    { name: "reminder requests", query: requests, items: (requests.data?.data ?? []).filter(item => item.status === "pending").map(item => ({
      key: `request-${item.id}`, text: `${item.requested_by.display_name} asks to remind you: ${item.task_title}`,
      detail: dayAndClock(item.scheduled_at, user.timezone), href: "/app/reminders", action: "Review request",
    })) },
    { name: "reminders", query: inbox, items: (inbox.data?.data ?? []).filter(item => item.acknowledged_at === null).map(item => ({
      key: `reminder-${item.id}`, text: `Reminder: ${item.task_title}`, detail: dayAndClock(item.scheduled_at, user.timezone),
      href: "/app/notifications", action: "Open inbox",
    })) },
  ];
  const loaded = groups.filter(group => !group.query.isPending && !group.query.isError);
  const items = loaded.flatMap(group => group.items);
  return <Section id="home-attention" title="Needs attention" more="/app/notifications" moreLabel="View all in the inbox">
    {items.length > 0 && <ul className={styles.list}>
      {items.slice(0, SHOWN * 2).map(item => <li key={item.key} className={styles.row}>
        <span className={styles.text}>{item.text}{item.detail && <span className={styles.detail}>{item.detail}</span>}</span>
        <Link href={item.href}>{item.action}</Link>
      </li>)}
    </ul>}
    {items.length > SHOWN * 2 && <p className={styles.quiet}>{items.length - SHOWN * 2} more</p>}
    {groups.filter(group => group.query.isPending).map(group => <Waiting key={group.name} text={`Checking ${group.name}`} />)}
    {groups.filter(group => group.query.isError).map(group => <Problem key={group.name} text={`Couldn't check ${group.name}.`} retry={() => void group.query.refetch()} />)}
    {loaded.length === groups.length && items.length === 0 && <p className={styles.quiet}>Nothing needs your attention.</p>}
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

const kindLabels: Record<CalendarEntry["kind"], string> = { task: "Task due", reminder: "Reminder", planned: "Planned reminder", event: "Event" };
const active = (entry: CalendarEntry) => entry.kind === "task" ? entry.status === "open" || entry.status === "in_progress"
  : entry.kind === "event" ? entry.status === "scheduled" : entry.kind === "planned" || entry.status === "scheduled" || entry.status === "available";
const entryLink = (entry: CalendarEntry) => entry.kind === "event" ? `/app/events?space_id=${entry.space_id}` : entry.kind === "task" ? `/app/tasks?space_id=${entry.space_id}` : "/app/reminders";

function Today({ user, spaces }: { user: Account; spaces: SpacesQuery }) {
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
  return <Section id="home-today" title="Today" more="/app/calendar" moreLabel="View all in the calendar">
    {spaces.isError && <Problem text="Couldn't load your Spaces." retry={() => void spaces.refetch()} />}
    {entries.length > 0 && <ul className={styles.list}>
      {entries.map(entry => <li key={`${entry.kind}-${entry.id}`} className={styles.row} data-kind={entry.kind}>
        <span className={styles.when}>{entry.kind === "task" ? "Today" : clock(entry.scheduled_at, user.timezone)}</span>
        <span className={styles.text}>{entry.title}<span className={styles.detail}>{kindLabels[entry.kind]} · {names.get(entry.space_id)}</span></span>
        <Link href={entryLink(entry)} aria-label={`Open ${entry.title}`}>Open</Link>
      </li>)}
    </ul>}
    {pending && <Waiting text="Loading today's plans" />}
    {failed.map(space => <Problem key={space.id} text={`Couldn't load today's plans in ${space.name}.`}
      retry={() => void days[list.indexOf(space)]?.refetch()} />)}
    {!pending && !spaces.isError && failed.length === 0 && entries.length === 0 && <p className={styles.quiet}>Nothing planned for today.</p>}
  </Section>;
}

function YourSpaces({ spaces }: { spaces: SpacesQuery }) {
  const list = spaces.data?.data ?? [];
  return <Section id="home-spaces" title="Your Spaces" more="/app/spaces" moreLabel="View all Spaces">
    {spaces.isPending && <Waiting text="Loading your Spaces" />}
    {spaces.isError && <Problem text="Couldn't load your Spaces." retry={() => void spaces.refetch()} />}
    {list.length > 0 && <ul className={styles.list}>
      {list.slice(0, SHOWN + 1).map(space => <li key={space.id} className={styles.row}>
        <span className={styles.text}>{space.name}<span className={styles.detail}>{spaceTypeLabels[space.space_type]} · {space.role === "owner" ? "Owner" : "Member"}</span></span>
        <Link href={`/app/tasks?space_id=${space.id}`} aria-label={`Tasks in ${space.name}`}>Tasks</Link>
      </li>)}
    </ul>}
    {list.length > SHOWN + 1 && <p className={styles.quiet}>{list.length - SHOWN - 1} more</p>}
    {spaces.isSuccess && list.length === 0 && <p className={styles.quiet}>You are not in a Space yet. <Link href="/app/spaces">Create or join one</Link></p>}
  </Section>;
}

function FromPages({ user }: { user: Account }) {
  const feed = useQuery({ queryKey: ["home", user.id, "feed"], queryFn: ({ signal }) => homeFeed(user.id, null, signal) });
  const posts = feed.data?.items ?? [];
  return <Section id="home-pages" title="From pages you follow" more="/app/home" moreLabel="View all posts from pages you follow">
    {feed.isPending && <Waiting text="Loading posts" />}
    {feed.isError && <Problem text="Couldn't load posts from pages you follow." retry={() => void feed.refetch()} />}
    {posts.length > 0 && <ul className={styles.list}>
      {posts.slice(0, SHOWN).map(post => <li key={post.id} className={styles.row}>
        <span className={styles.text}>{post.title ?? post.body.slice(0, 120)}<span className={styles.detail}>{post.page_name}{post.published_at ? ` · ${dayAndClock(post.published_at, user.timezone)}` : ""}</span></span>
        <Link href={`/posts/${post.id}`} aria-label={`Read ${post.title ?? `the post from ${post.page_name}`}`}>Read</Link>
      </li>)}
    </ul>}
    {feed.isSuccess && posts.length === 0 && <p className={styles.quiet}>Pages you follow have not posted yet. <Link href="/app/discover">Find pages</Link></p>}
  </Section>;
}
