"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, House, MessageSquare, UserRound, UsersRound } from "lucide-react";

// Styles are in globals.css (.main-nav, .app-frame), because every screen's header uses this navigation.

// The five main sections (DEC-014), in this order on web and Android. Each lists the paths that belong to it;
// the notification inbox, search and the agent stay in the header.
export const mainSections = [
  { label: "Home", href: "/app", icon: House, paths: ["/app", "/app/calendar", "/app/care", "/app/reminders"] },
  { label: "Spaces", href: "/app/spaces", icon: UsersRound, paths: ["/app/spaces", "/app/tasks", "/app/events", "/app/documents"] },
  { label: "Messages", href: "/app/messages", icon: MessageSquare, paths: ["/app/messages"] },
  { label: "Discover", href: "/app/discover", icon: Compass, paths: ["/app/discover", "/app/home", "/app/pages", "/pages", "/posts"] },
  { label: "Profile", href: "/app/settings/account", icon: UserRound, paths: ["/app/settings", "/app/safety"] },
] as const;

export type MainSection = (typeof mainSections)[number]["label"];

export function currentSection(pathname: string): MainSection | null {
  const matches = (path: string) => path === "/app" ? pathname === "/app" : pathname === path || pathname.startsWith(`${path}/`);
  return mainSections.find(section => section.paths.some(matches))?.label ?? null;
}

export function MainNavigation() {
  const current = currentSection(usePathname() ?? "");
  return <nav className="main-nav" aria-label="Main">
    {mainSections.map(({ label, href, icon: Icon }) => <Link key={label} href={href} aria-current={current === label ? "page" : undefined}>
      <Icon size={20} aria-hidden /><span>{label}</span>
    </Link>)}
  </nav>;
}

/** Signed-in pages: the main navigation is a bar under the header on narrow screens and a column at the side on wide ones. */
export function MainFrame({ children }: { children: React.ReactNode }) {
  return <div className="app-frame"><MainNavigation /><div className="app-content">{children}</div></div>;
}
