import Link from "next/link";
import { ArrowUpRight, Bell, CalendarDays, Layers2, ShieldCheck } from "lucide-react";

export function Shell({ children, account = false }: { children: React.ReactNode; account?: boolean }) {
  return <div className="application">
    <header className="app-header">
      <Link className="brand" href={account ? "/app/settings/account" : "/login"} aria-label="Community Platform home">
        <span className="brand-mark"><Layers2 size={25} strokeWidth={1.7} aria-hidden /></span>
        <span>Community <strong>Platform</strong></span>
      </Link>
      <span className="environment"><span className="status-square" /> Local test environment</span>
      {account && <Link className="icon-button" href="/app/calendar" aria-label="Calendar" title="Calendar"><CalendarDays size={20} aria-hidden /></Link>}
      {account && <Link className="icon-button" href="/app/notifications" aria-label="Notification inbox" title="Notification inbox"><Bell size={20} aria-hidden /></Link>}
      <a className="inbox-link" href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">Test inbox <ArrowUpRight size={16} aria-hidden /></a>
    </header>
    {children}
    <footer className="app-footer"><span><ShieldCheck size={16} aria-hidden /> Account access</span><span>Community Platform / Local build</span></footer>
  </div>;
}