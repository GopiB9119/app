"use client";

import Link from "next/link";
import { Bot, CalendarClock, ClipboardList, Ellipsis, FileText, Globe, Heart, House, LockKeyhole, MessageSquare, ShieldCheck, UserRound, UsersRound, Vote } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useText } from "@/features/i18n/i18n";
import type { MessageId } from "@/features/i18n/messages";
import type { ListedSpace } from "./client";
import styles from "./space-header.module.css";

export type SpaceSection = "chat" | "tasks" | "events" | "documents" | "polls";

const spaceIcons: Record<ListedSpace["space_type"], LucideIcon> = { family: House, couple: Heart, solo: UserRound, group: UsersRound };

export function SpaceTypeIcon({ type, size }: { type: ListedSpace["space_type"]; size: number }) {
  const Icon = spaceIcons[type];
  return <Icon size={size} aria-hidden />;
}
const typeLabels: Record<ListedSpace["space_type"], MessageId> = { family: "spaces.type.family", couple: "spaces.type.couple", solo: "spaces.type.solo", group: "spaces.type.group" };
const sections: { key: SpaceSection; path: string; icon: LucideIcon; label: MessageId; named: MessageId }[] = [
  { key: "chat", path: "/app/messages", icon: MessageSquare, label: "spaces.action.chat", named: "spaces.chatFor" },
  { key: "tasks", path: "/app/tasks", icon: ClipboardList, label: "spaces.action.tasks", named: "spaces.tasksFor" },
  { key: "events", path: "/app/events", icon: CalendarClock, label: "spaces.action.events", named: "spaces.eventsFor" },
  { key: "documents", path: "/app/documents", icon: FileText, label: "spaces.action.documents", named: "spaces.documentsFor" },
  { key: "polls", path: "/app/polls", icon: Vote, label: "spaces.action.polls", named: "spaces.pollsFor" },
];

// "5 members: Sam, Priya + 2 more"; a couple's partner is named elsewhere, so only the count shows.
export function memberSummary(t: ReturnType<typeof useText>, space: ListedSpace) {
  const count = space.member_count ?? 1;
  const names = space.space_type === "couple" ? [] : space.member_preview ?? [];
  if (names.length === 0) return count === 1 ? t("spaces.groups.memberOne") : t("spaces.groups.memberOther", { count: String(count) });
  const more = count - 1 - names.length;
  return more > 0 ? t("spaces.membersNamedMore", { count: String(count), names: names.join(", "), more: String(more) })
    : t("spaces.membersNamed", { count: String(count), names: names.join(", ") });
}

/** A compact way to reach the Space's other sections where the full header would take too much room, such as an open chat. */
export function SpaceMenu({ spaceId, spaceName, current }: { spaceId: string; spaceName: string; current: SpaceSection }) {
  const t = useText();
  return <DropdownMenu><DropdownMenuTrigger asChild>
    <button type="button" className="icon-button" aria-label={t("spaces.header.more", { name: spaceName })} title={t("spaces.header.more", { name: spaceName })}>
      <Ellipsis size={19} aria-hidden />
    </button>
  </DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuLabel>{spaceName}</DropdownMenuLabel><DropdownMenuSeparator />
    {sections.filter(section => section.key !== current).map(({ key, path, icon: SectionIcon, label }) => <DropdownMenuItem key={key} asChild>
      <Link href={`${path}?space_id=${spaceId}`}><SectionIcon aria-hidden />{t(label)}</Link>
    </DropdownMenuItem>)}
    <DropdownMenuItem asChild><Link href={`/app/agent/tasks?space_id=${spaceId}`}><Bot aria-hidden />{t("agent.inboxTitle")}</Link></DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
}

/** Where am I, who is here and what can I do: the same header on each of a Space's screens. */
export function SpaceHeader({ space, current }: { space: ListedSpace; current: SpaceSection }) {
  const t = useText();
  const chat = `/app/messages?space_id=${space.id}&ask=agent`;
  return <section className={styles.header} aria-label={t("spaces.header.label", { name: space.name })}>
    <div className={styles.identity}>
      <span className={styles.mark} aria-hidden><SpaceTypeIcon type={space.space_type} size={22} /></span>
      <div className={styles.text}>
        <p className={styles.name}>{space.name}</p>
        <p className={styles.facts}>
          <span>{t(typeLabels[space.space_type])}</span>
          <span>{space.visibility === "public" ? <><Globe size={14} aria-hidden />{t("spaces.public")}</> : <><LockKeyhole size={14} aria-hidden />{t("spaces.private")}</>}</span>
          {space.member_count !== undefined && <span><UsersRound size={14} aria-hidden />{memberSummary(t, space)}</span>}
          <span><Bot size={14} aria-hidden />{t(space.agent_enabled ? "spaces.agentOn" : "spaces.agentOff")}</span>
        </p>
      </div>
      {space.agent_enabled && current !== "chat" && <Link className={`secondary-button ${styles.ask}`} href={chat}><Bot size={17} aria-hidden />{t("spaces.header.askAgent")}</Link>}
    </div>
    <nav className={styles.sections} aria-label={t("spaces.header.sections", { name: space.name })}>
      {sections.map(({ key, path, icon: SectionIcon, label, named }) => <Link key={key} href={`${path}?space_id=${space.id}`}
        aria-label={t(named, { name: space.name })} aria-current={current === key ? "page" : undefined}>
        <SectionIcon size={17} aria-hidden /><span>{t(label)}</span>
      </Link>)}
    </nav>
    <details className={styles.privacy}>
      <summary><ShieldCheck size={16} aria-hidden />{t("spaces.privacy.title")}</summary>
      {/* Each line matches a server rule: Space data by admission, private agent answers (DEC-061), subject-only medicines. */}
      <ul>
        <li><UsersRound size={15} aria-hidden />{t(space.space_type === "solo" ? "spaces.privacy.solo" : "spaces.privacy.shared")}</li>
        <li><LockKeyhole size={15} aria-hidden />{t("spaces.privacy.agent")}</li>
        <li><LockKeyhole size={15} aria-hidden />{t("spaces.privacy.medicines")}</li>
        {space.space_type !== "solo" && <li><MessageSquare size={15} aria-hidden />{t("spaces.privacy.direct")}</li>}
      </ul>
    </details>
  </section>;
}
