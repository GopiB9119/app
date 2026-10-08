"use client";

import { useEffect, useState } from "react";
import { BookOpen, CircleDot, Layers, MessageCircle, ScanText, Search, ShieldCheck, Square } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useText } from "@/features/i18n/i18n";
import type { AgentRun } from "./client";
import styles from "./agent-progress.module.css";

type RunEvent = AgentRun["events"][number];

// Steps that only say the request exists, not what the agent is doing.
const quiet = new Set(["run.created", "run.running"]);
// A working stretch starts again after the person waited, approved or answered.
const restarts = new Set(["run.created", "run.running", "approval.approved", "run.answered"]);
const trailLength = 3;
const hourSeconds = 3600;

export function stepIcon(type: string): LucideIcon {
  if (type === "run.searching") return Search;
  if (type === "run.reading") return BookOpen;
  if (type === "run.research") return Layers;
  if (type.startsWith("approval.")) return ShieldCheck;
  if (type === "run.question" || type === "run.answered") return MessageCircle;
  if (type === "run.reviewing" || type === "run.continued") return ScanText;
  return CircleDot;
}

function useSecondsSince(instant: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const started = instant ? Date.parse(instant) : NaN;
  return Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null;
}

/** What a working run is doing now, from its recorded events only; nothing here is shown unless the server reported it. */
export function AgentProgress({ run, stopping, onStop }: { run: AgentRun; stopping: boolean; onStop: () => void }) {
  const t = useText();
  const steps = run.events.filter(event => !quiet.has(event.event_type));
  const current: RunEvent | undefined = steps.at(-1);
  const trail = steps.slice(0, -1).slice(-trailLength);
  const since = [...run.events].reverse().find(event => restarts.has(event.event_type))?.created_at ?? run.created_at;
  const seconds = useSecondsSince(since);
  const Icon = current ? stepIcon(current.event_type) : CircleDot;
  const text = current?.summary.trim() || t("agent.thinking");
  return <div className={styles.progress}>
    {trail.length > 0 && <ol className={styles.trail} aria-hidden>{trail.map(step => {
      const StepIcon = stepIcon(step.event_type);
      return <li key={step.sequence}><StepIcon size={16} aria-hidden /><span>{step.summary.trim() || t("agent.missingRecordText")}</span></li>;
    })}</ol>}
    <div className={styles.head}>
      <span className={styles.signal} aria-hidden />
      <p className={styles.now} role="status">
        <Icon size={16} aria-hidden />
        <span key={current?.sequence ?? 0} className={styles.nowText}>{text}</span>
      </p>
      {seconds !== null && seconds < hourSeconds && <span className={styles.elapsed} aria-hidden>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </span>}
      <button className="text-button" type="button" disabled={stopping} onClick={onStop}><Square size={14} aria-hidden />{t("agent.stop")}</button>
    </div>
  </div>;
}
