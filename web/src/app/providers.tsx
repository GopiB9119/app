"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/features/identity/client";
import { LanguageProvider } from "@/features/i18n/i18n";
import type { Language } from "@/features/i18n/messages";

export function Providers({ children, language = "en" }: { children: React.ReactNode; language?: Language }) {
  const [client] = useState(() => {
    const created = new QueryClient({ defaultOptions: {
      queries: { staleTime: 0, gcTime: 0, retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500), refetchOnWindowFocus: true },
      mutations: { retry: false, networkMode: "always" },
    } });
    // The Spaces list and Home's sections are read on most screens, so they stay a minute: coming back shows them at once and they refresh as usual.
    created.setQueryDefaults(["spaces"], { gcTime: 60_000 });
    created.setQueryDefaults(["home"], { gcTime: 60_000 });
    return created;
  });
  return <LanguageProvider language={language}><QueryClientProvider client={client}>{children}</QueryClientProvider></LanguageProvider>;
}