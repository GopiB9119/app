"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bell, Bot, Compass, Layers2, Search, ShieldCheck } from "lucide-react";
import { api, userSchema } from "@/features/identity/client";
import { MainFrame } from "@/features/platform/navigation";
import { notificationPage } from "@/features/scheduling/client";
import { useLiveUpdates } from "@/features/realtime/live";
import { useText } from "@/features/i18n/i18n";
import { LanguagePicker } from "@/features/i18n/language-picker";

// Signed-in pages show the five main sections (DEC-014); the header keeps search, the notification inbox and the agent.
export function Shell({ children, account = false }: { children: React.ReactNode; account?: boolean }) {
  const t = useText();
  return <div className="application">
    <header className="app-header">
      <Link className="brand" href={account ? "/app" : "/login"} aria-label={t("shell.home")}>
        <span className="brand-mark"><Layers2 size={25} strokeWidth={1.7} aria-hidden /></span>
        <span>{t("shell.brandCommunity")} <strong>{t("shell.brandPlatform")}</strong></span>
      </Link>
      <span className="environment"><span className="status-square" /> {t("shell.environment")}</span>
      {!account && <Link className="icon-button" href="/app/discover" aria-label={t("shell.discover")} title={t("shell.discover")}><Compass size={20} aria-hidden /></Link>}
      {account && <Link className="icon-button" href="/app/search" aria-label={t("shell.search")} title={t("shell.search")}><Search size={20} aria-hidden /></Link>}
      {account && <InboxBell />}
      {account && <Link className="text-button" href="/app/agent"><Bot size={18} aria-hidden />{t("shell.agent")}</Link>}
      <a className="inbox-link" href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">{t("shell.testInbox")} <ArrowUpRight size={16} aria-hidden /></a>
    </header>
    {account ? <MainFrame>{children}</MainFrame> : children}
    <footer className="app-footer"><span><ShieldCheck size={16} aria-hidden /> {t("shell.accountAccess")}</span><LanguagePicker /><span>{t("shell.localBuild")}</span></footer>
  </div>;
}

// The bell keeps the inbox's unread count; the count shares the inbox's query key prefix, so reading or
// acknowledging a reminder there refreshes it.
function InboxBell() {
  const t = useText();
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }), retry: false });
  const accountId = profile.data?.data.id;
  useLiveUpdates(accountId);
  const unread = useQuery({
    queryKey: ["notifications", accountId, "count"], enabled: Boolean(accountId), retry: false,
    queryFn: async ({ signal }) => (await notificationPage(accountId!, null, signal)).unreadCount,
  });
  const count = unread.data ?? 0;
  const label = count > 0 ? t("shell.inboxUnread", { count }) : t("shell.inbox");
  return <Link className="icon-button inbox-bell" href="/app/notifications" aria-label={label} title={label}>
    <Bell size={20} aria-hidden />{count > 0 && <span className="inbox-count" aria-hidden>{count > 99 ? "99+" : count}</span>}
  </Link>;
}