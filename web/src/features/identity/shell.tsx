"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bell, Bot, Compass, Layers2, Search, ShieldCheck } from "lucide-react";
import { api, userSchema } from "@/features/identity/client";
import { MainFrame } from "@/features/platform/navigation";
import navigation from "@/features/platform/navigation.module.css";
import { notificationPage } from "@/features/scheduling/client";

// Signed-in pages show the five main sections (DEC-014); the header keeps search, the notification inbox and the agent.
export function Shell({ children, account = false }: { children: React.ReactNode; account?: boolean }) {
  return <div className="application">
    <header className="app-header">
      <Link className="brand" href={account ? "/app" : "/login"} aria-label="Community Platform home">
        <span className="brand-mark"><Layers2 size={25} strokeWidth={1.7} aria-hidden /></span>
        <span>Community <strong>Platform</strong></span>
      </Link>
      <span className="environment"><span className="status-square" /> Local test environment</span>
      {!account && <Link className="icon-button" href="/app/discover" aria-label="Discover pages" title="Discover pages"><Compass size={20} aria-hidden /></Link>}
      {account && <Link className="icon-button" href="/app/search" aria-label="Search" title="Search"><Search size={20} aria-hidden /></Link>}
      {account && <InboxBell />}
      {account && <Link className="text-button" href="/app/agent"><Bot size={18} aria-hidden />Agent</Link>}
      <a className="inbox-link" href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">Test inbox <ArrowUpRight size={16} aria-hidden /></a>
    </header>
    {account ? <MainFrame>{children}</MainFrame> : children}
    <footer className="app-footer"><span><ShieldCheck size={16} aria-hidden /> Account access</span><span>Community Platform / Local build</span></footer>
  </div>;
}

// The bell keeps the inbox's unread count; the count shares the inbox's query key prefix, so reading or
// acknowledging a reminder there refreshes it.
function InboxBell() {
  const profile = useQuery({ queryKey: ["me"], queryFn: ({ signal }) => api("me", userSchema, { signal }), retry: false });
  const accountId = profile.data?.data.id;
  const unread = useQuery({
    queryKey: ["notifications", accountId, "count"], enabled: Boolean(accountId), retry: false,
    queryFn: async ({ signal }) => (await notificationPage(accountId!, null, signal)).unreadCount,
  });
  const count = unread.data ?? 0;
  const label = count > 0 ? `Notification inbox, ${count} unread` : "Notification inbox";
  return <Link className={`icon-button ${navigation.bell}`} href="/app/notifications" aria-label={label} title={label}>
    <Bell size={20} aria-hidden />{count > 0 && <span className={navigation.count} aria-hidden>{count > 99 ? "99+" : count}</span>}
  </Link>;
}