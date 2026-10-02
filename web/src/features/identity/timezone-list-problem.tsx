"use client";

import { RefreshCw } from "lucide-react";

// Without the list, a timezone select offers only a fallback, so the person may not find their zone. Say so.
export function TimezoneListProblem({ retry, message = "The list of timezones did not load, so yours may be missing.", retryLabel = "Retry" }: { retry: () => void; message?: string; retryLabel?: string }) {
  return <div className="message error" role="alert">
    {message}
    <button type="button" className="text-button" onClick={retry}><RefreshCw size={16} aria-hidden />{retryLabel}</button>
  </div>;
}
