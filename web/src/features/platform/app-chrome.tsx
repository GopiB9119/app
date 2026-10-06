"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Chrome, ChromeHostContext } from "@/features/identity/shell";
import type { ChromeReport } from "@/features/identity/shell";
import { DocumentTitle } from "./document-title";

// Screens that fill the window and scroll inside themselves (chat); the page decides this on the server pass too, so there is no layout jump.
const workspacePaths = ["/app/messages", "/app/agent"];

/**
 * One header, tab bar and live connection for every page under /app. Pages keep their own `<Shell>`, which now only
 * tells this host what it needs, so moving between pages no longer rebuilds the chrome or reconnects live updates.
 */
export function AppChrome({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [report, setReport] = useState<ChromeReport | null>(null);
  // Until a page reports, use what the server can see: a session cookie only chooses the first paint, the page's own check decides after.
  const account = report?.account ?? signedIn;
  const workspace = report?.workspace ?? workspacePaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  return <ChromeHostContext.Provider value={setReport}>
    <DocumentTitle />
    <Chrome account={account} workspace={workspace} notificationCount={report?.notificationCount}>{children}</Chrome>
  </ChromeHostContext.Provider>;
}
