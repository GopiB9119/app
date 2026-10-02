"use client";

import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
import { formatDateTime } from "@/features/i18n/i18n";
import type { Language } from "@/features/i18n/messages";
import styles from "./reminders.module.css";

export function useReminderAccountGuard(error: Error | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED")) {
      client.clear();
      window.location.replace(error.status === 401 ? "/login" : "/app/reminders");
    }
  }, [error, client]);
}

export function protectedReminderError(error: Error | null) {
  return error instanceof ApiError && ([401, 403, 404].includes(error.status) || error.code === "ACCOUNT_CHANGED");
}

export function ReminderDialog({ title, locked, onClose, children, closeLabel = "Close reminder dialog" }: { title: string; locked: boolean; onClose: () => void; children: React.ReactNode; closeLabel?: string }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { if (locked) event.preventDefault(); else onClose(); }}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={closeLabel} title={closeLabel} disabled={locked} onClick={onClose}><X size={18} /></button></div>{children}</dialog>;
}

export function displayInstant(value: string, zone: string, language: Language = "en") {
  return formatDateTime(language, value, { dateStyle: "medium", timeStyle: "short", timeZone: zone });
}

export function displayReminderTime(value: string, language: Language = "en") {
  if (language === "en") return value.replace("T", " ");
  return formatDateTime(language, value.endsWith("Z") ? value : `${value}Z`, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}
