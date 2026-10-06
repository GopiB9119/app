"use client";

import { PageSkeleton } from "@/components/ui/skeleton";
import { useText } from "@/features/i18n/i18n";

// Shown inside the persistent chrome the moment a link is chosen, until the next page is ready.
export default function Loading() {
  const t = useText();
  return <PageSkeleton label={t("ui.loading")} />;
}
