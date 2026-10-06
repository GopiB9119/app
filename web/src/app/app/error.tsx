"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/section";
import { useText } from "@/features/i18n/i18n";

// A page that fails to render keeps the header and tab bar; nothing is resubmitted by trying again.
export default function PageError({ unstable_retry, reset }: { error: Error & { digest?: string }; reset: () => void; unstable_retry?: () => void }) {
  const t = useText();
  return <main className="route-loading">
    <Empty icon={<TriangleAlert size={28} />} title={t("ui.errorTitle")}>
      <p>{t("ui.errorBody")}</p>
      <Button onClick={() => (unstable_retry ?? reset)()}>{t("ui.tryAgain")}</Button>
    </Empty>
  </main>;
}
