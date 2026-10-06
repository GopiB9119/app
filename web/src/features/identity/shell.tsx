"use client";

import Link from "next/link";
import { createContext, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bot, CalendarDays, CalendarRange, ClipboardList, Compass, FileText, Layers2, LayoutGrid, Pill, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, api, userSchema } from "@/features/identity/client";
import { MainFrame } from "@/features/platform/navigation";
import { notificationPage } from "@/features/scheduling/client";
import { resumeLiveUpdates, useLiveConnected, useLiveUpdates } from "@/features/realtime/live";
import { useText } from "@/features/i18n/i18n";
import { LanguagePicker } from "@/features/i18n/language-picker";

type ChromeProps = { children: React.ReactNode; account?: boolean; notificationCount?: number | null; workspace?: boolean };
export type ChromeReport = { account: boolean; workspace: boolean; notificationCount?: number | null };

// The running app keeps one Chrome mounted across pages (AppChrome), so the header, tab bar and live connection are not rebuilt on every click.
// A Shell inside that host only reports what the page needs; a Shell on its own (tests, pages outside the host) draws the Chrome itself.
export const ChromeHostContext = createContext<((report: ChromeReport | null) => void) | null>(null);

export function Shell({ children, account = false, notificationCount, workspace = false }: ChromeProps) {
  const report = useContext(ChromeHostContext);
  useEffect(() => {
    if (!report) return;
    report({ account, workspace, notificationCount });
    return () => report(null);
  }, [report, account, workspace, notificationCount]);
  return report ? <>{children}</> : <Chrome account={account} notificationCount={notificationCount} workspace={workspace}>{children}</Chrome>;
}

// Signed-in pages show the five main sections (DEC-014); the header keeps search, the notification inbox and the agent.
export function Chrome({ children, account = false, notificationCount, workspace = false }: ChromeProps) {
  const t = useText();
  const footer = <footer className="app-footer"><LanguagePicker /></footer>;
  return <div className={`application${account ? " application-account" : ""}${workspace ? " application-workspace" : ""}`}>
    {account && <a className="ui-button ui-button-primary skip-link" href="#app-content">{t("ui.skip")}</a>}
    <header className="app-header">
      <Link className="brand" href={account ? "/app" : "/login"} aria-label={t("shell.home")}>
        <span className="brand-mark"><Layers2 size={25} strokeWidth={1.7} aria-hidden /></span>
        <span>{t("shell.brandCommunity")} <strong>{t("shell.brandPlatform")}</strong></span>
      </Link>
      {!account && <HeaderLink href="/app/discover" label={t("shell.discover")}><Compass size={20} aria-hidden /></HeaderLink>}
      {account && <HeaderLink href="/app/search" label={t("shell.search")}><Search size={20} aria-hidden /></HeaderLink>}
      {account && <InboxBell knownCount={notificationCount} />}
      {account && <Button asChild variant="secondary" className="header-agent-link"><Link href="/app/agent" aria-label={t("shell.agent")}>
        <Bot size={18} aria-hidden /><span className="header-agent-label">{t("shell.agent")}</span>
      </Link></Button>}
      {account && <WorkspaceMenu />}
    </header>
    {account ? <MainFrame footer={footer}>{children}</MainFrame> : <>{children}{footer}</>}
  </div>;
}

function HeaderLink({ href, label, children, className }: { href: string; label: string; children: React.ReactNode; className?: string }) {
  return <Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon" className={className}>
    <Link href={href} aria-label={label} title={label}>{children}</Link>
  </Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function WorkspaceMenu() {
  const t = useText();
  const destinations = [
    { href: "/app/calendar", label: t("home.calendar"), icon: CalendarDays },
    { href: "/app/tasks", label: t("chat.tasks"), icon: ClipboardList },
    { href: "/app/events", label: t("ui.events"), icon: CalendarRange },
    { href: "/app/reminders", label: t("ui.reminders"), icon: Bell },
    { href: "/app/documents", label: t("ui.documents"), icon: FileText },
    { href: "/app/care", label: t("home.medicines"), icon: Pill },
  ];
  return <DropdownMenu><DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" aria-label={t("ui.navigation")} title={t("ui.navigation")}><LayoutGrid aria-hidden /></Button>
  </DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuLabel>{t("ui.workspace")}</DropdownMenuLabel><DropdownMenuSeparator />
    {destinations.map(({ href, label, icon: Icon }) => <DropdownMenuItem key={href} asChild>
      <Link href={href}><Icon aria-hidden />{label}</Link>
    </DropdownMenuItem>)}
  </DropdownMenuContent></DropdownMenu>;
}

// The bell keeps the inbox's unread count; the count shares the inbox's query key prefix, so reading or
// acknowledging a reminder there refreshes it.
function InboxBell({ knownCount }: { knownCount?: number | null }) {
  const t = useText();
  const liveConnected = useLiveConnected();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }), retry: false });
  const accountId = profile.data?.data.id;
  useLiveUpdates(accountId);
  useEffect(() => {
    if (profile.isSuccess && accountId) resumeLiveUpdates(accountId);
  }, [accountId, profile.dataUpdatedAt, profile.isSuccess]);
  const unread = useQuery({
    queryKey: ["notifications", accountId, "count"], enabled: Boolean(accountId) && knownCount === undefined, retry: false,
    queryFn: async ({ signal }) => (await notificationPage(accountId!, null, signal)).unreadCount,
    refetchInterval: query => query.state.error instanceof ApiError && [401, 403, 404, 409].includes(query.state.error.status) ? false : liveConnected ? 60000 : 15000,
  });
  const confirmedCount = knownCount === undefined ? (unread.isError ? 0 : unread.data ?? 0) : knownCount ?? 0;
  const count = profile.isSuccess ? confirmedCount : 0;
  const label = count > 0 ? t("shell.inboxUnread", { count }) : t("shell.inbox");
  return <HeaderLink className="inbox-bell" href="/app/notifications" label={label}>
    <Bell size={20} aria-hidden />{count > 0 && <span className="inbox-count" aria-hidden>{count > 99 ? "99+" : count}</span>}
  </HeaderLink>;
}