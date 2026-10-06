"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, House, MessageSquare, UserRound, UsersRound } from "lucide-react";
import { useText } from "@/features/i18n/i18n";
import type { MessageId } from "@/features/i18n/messages";

// Styles are in globals.css (.main-nav, .app-frame), because every screen's header uses this navigation.

// The five main sections (DEC-014), in this order on web and Android. Each lists the paths that belong to it;
// the notification inbox, search and the agent stay in the header.
export const mainSections = [
  { label: "Home", href: "/app", icon: House, paths: ["/app", "/app/calendar", "/app/care", "/app/reminders"] },
  { label: "Spaces", href: "/app/spaces", icon: UsersRound, paths: ["/app/spaces", "/app/tasks", "/app/events", "/app/documents"] },
  { label: "Messages", href: "/app/messages", icon: MessageSquare, paths: ["/app/messages"] },
  { label: "Discover", href: "/app/discover", icon: Compass, paths: ["/app/discover", "/app/home", "/app/pages", "/pages", "/posts"] },
  { label: "Profile", href: "/app/settings/account", icon: UserRound, paths: ["/app/settings", "/app/safety", "/app/moderation"] },
] as const;

export type MainSection = (typeof mainSections)[number]["label"];
const sectionMessages: Record<MainSection, MessageId> = {
  Home: "nav.home", Spaces: "nav.spaces", Messages: "nav.messages", Discover: "nav.discover", Profile: "nav.profile",
};

export function currentSection(pathname: string): MainSection | null {
  const matches = (path: string) => path === "/app" ? pathname === "/app" : pathname === path || pathname.startsWith(`${path}/`);
  return mainSections.find(section => section.paths.some(matches))?.label ?? null;
}

export function MainNavigation() {
  const t = useText();
  const current = currentSection(usePathname() ?? "");
  return <nav className="main-nav" aria-label={t("nav.main")}>
    {mainSections.map(({ label, href, icon: Icon }) => <Link key={label} href={href} title={t(sectionMessages[label])} aria-current={current === label ? "page" : undefined}>
      <Icon size={20} aria-hidden /><span>{t(sectionMessages[label])}</span>
    </Link>)}
  </nav>;
}

/** Signed-in pages: the main navigation is a tab bar at the bottom on narrow screens and a column at the side on wide ones. The footer scrolls with the page, above the tab bar. */
export function MainFrame({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return <div className="app-frame"><MainNavigation /><div className="app-content" id="app-content" tabIndex={-1}>{children}{footer}</div></div>;
}
