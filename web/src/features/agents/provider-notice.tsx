"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useText } from "@/features/i18n/i18n";

export function AgentProviderNotice() {
  const t = useText();
  const [open, setOpen] = useState(false);
  const title = t("about.assistantDataUse");
  return <>
    <Button variant="ghost" size="icon" aria-label={title} title={title} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Info size={18} aria-hidden />
    </Button>
    {open && <Dialog title={title} closeLabel={t("agent.close")} locked={false} onClose={() => setOpen(false)}>
      <p>{t("about.assistantProviders")}</p>
      <Link className="text-button" href="/privacy" target="_blank" rel="noopener noreferrer">{t("about.privacyLink")}</Link>
    </Dialog>}
  </>;
}
