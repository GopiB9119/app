"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/features/identity/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: {
    queries: { staleTime: 0, gcTime: 0, retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500), refetchOnWindowFocus: true },
    mutations: { retry: false, networkMode: "always" },
  } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}