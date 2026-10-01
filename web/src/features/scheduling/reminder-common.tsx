"use client";

import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { ApiError } from "@/features/identity/client";
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

export function ReminderDialog({ title, locked, onClose, children }: { title: string; locked: boolean; onClose: () => void; children: React.ReactNode }) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();
  useEffect(() => { dialog?.showModal(); return () => dialog?.close(); }, [dialog]);
  return <dialog ref={setDialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { if (locked) event.preventDefault(); else onClose(); }}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close reminder dialog" title="Close reminder dialog" disabled={locked} onClick={onClose}><X size={18} /></button></div>{children}</dialog>;
}

export function displayInstant(value: string, zone: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(value));
}
