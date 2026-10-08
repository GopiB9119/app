"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({ title, closeLabel, locked, className, onClose, children }: {
  title: string; closeLabel: string; locked: boolean; className?: string; onClose: () => void; children: ReactNode;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    if (!dialog) return;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [dialog]);
  return <dialog ref={setDialog} className={className} aria-labelledby={titleId} onCancel={event => { if (locked) event.preventDefault(); else onClose(); }}>
    <div className="dialog-heading">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="icon-button" aria-label={closeLabel} title={closeLabel} disabled={locked} onClick={onClose}><X size={18} aria-hidden /></button>
    </div>
    {children}
  </dialog>;
}
