"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { Account } from "@/features/identity/client";
import { myBlocks, unblock } from "./client";
import { CommunityFrame, Failure, Loading, problemText, sessionLost, time, useViewer } from "./shared";
import styles from "./community.module.css";

export function SafetyScreen() {
  const viewer = useViewer();
  useEffect(() => { if (viewer.signedOut) window.location.replace("/login"); }, [viewer.signedOut]);
  if (viewer.pending || viewer.signedOut) return <Loading label="Loading blocked pages and people" />;
  if (!viewer.account) return <CommunityFrame account={null} current="safety"><Failure error={viewer.error} retry={viewer.retry} /></CommunityFrame>;
  return <Blocks key={viewer.account.id} account={viewer.account} />;
}

function Blocks({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const blocks = useQuery({ queryKey: ["blocks", account.id], queryFn: ({ signal }) => myBlocks(account.id, signal), networkMode: "always" });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (sessionLost(blocks.error)) window.location.replace("/login"); }, [blocks.error]);
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try { await unblock(account.id, id); setConfirm(null); await queryClient.invalidateQueries({ queryKey: ["blocks", account.id] }); }
    catch (problem) { setError(problemText(problem, "Unblock failed.")); }
    finally { setBusy(false); }
  }
  return <CommunityFrame account={account} current="safety">
    <div className={styles.heading}><h1>Blocked pages and people</h1></div>
    <p className={styles.meta}>Blocking a page hides its posts from you and stops following it. Blocking a person hides their comments from you and stops them commenting on pages you own. Nobody is told that you blocked them.</p>
    <p className={styles.meta}>Reports you send are stored for review and never show your name to the person you reported. Moderator review tools, decisions and appeals are not built yet.</p>
    {error && <div className="message error" role="alert">{error}</div>}
    {blocks.isPending && <p role="status">Loading...</p>}
    {blocks.isError && !sessionLost(blocks.error) && <Failure error={blocks.error} retry={() => blocks.refetch()} />}
    {blocks.data?.length === 0 && <p className={styles.empty}>You have not blocked anyone.</p>}
    <ul className={styles.list} aria-label="Blocked">
      {blocks.data?.map(item => <li key={item.id} className={styles.row}>
        <span>
          {item.page_id ? <Link href={`/pages/${item.page_id}`}>{item.label}</Link> : <strong>{item.label}</strong>}
          <span className={styles.meta}> / {item.target_type === "page" ? "Page" : "Person"} / blocked {time.format(new Date(item.created_at))}</span>
        </span>
        {confirm === item.id
          ? <span className={styles.actions} role="group" aria-label={`Confirm unblock ${item.label}`}>
            <button className="primary-button" disabled={busy} onClick={() => remove(item.id)}>Unblock</button>
            <button className="secondary-button" disabled={busy} onClick={() => setConfirm(null)}>Keep blocked</button>
          </span>
          : <button className="secondary-button" disabled={busy} onClick={() => setConfirm(item.id)} aria-label={`Unblock ${item.label}`}>Unblock</button>}
      </li>)}
    </ul>
  </CommunityFrame>;
}
