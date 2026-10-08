"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { typingSchema } from "@/features/messaging/client";
import { notificationPage } from "@/features/scheduling/client";

export type SseFrame = { event: string; data: string };

export function createSseParser(listener: (frame: SseFrame) => void) {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  function line(text: string) {
    if (!text) {
      const frame = data.length ? { event: event || "message", data: data.join("\n") } : null;
      event = "";
      data = [];
      if (frame) listener(frame);
      return;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon < 0 ? text : text.slice(0, colon);
    const value = colon < 0 ? "" : text.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    if (field === "data") data.push(value);
  }
  return {
    push(chunk: string) {
      buffer += chunk;
      let start = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const character = buffer[index];
        if (character !== "\r" && character !== "\n") continue;
        if (character === "\r" && index === buffer.length - 1) break;
        line(buffer.slice(start, index));
        if (character === "\r" && buffer[index + 1] === "\n") index += 1;
        start = index + 1;
      }
      buffer = buffer.slice(start);
    },
    finish() {
      if (buffer.endsWith("\r")) line(buffer.slice(0, -1));
      buffer = "";
      event = "";
      data = [];
    },
  };
}

const changeSchema = z.union([typingSchema, z.discriminatedUnion("kind", [
  // A Main Agent run (DEC-060) names no Space.
  z.object({ kind: z.literal("agent"), space_id: z.string().uuid().nullable(), run_id: z.string().uuid(), reason: z.literal("changed") }),
  // "access": a membership ended (T86); "member_left": an erased account left the Space (T68). Both make an open chat read again.
  z.object({ kind: z.literal("conversation"), conversation_id: z.string().uuid(), space_id: z.string().uuid(), reason: z.enum(["opened", "message", "deleted", "read", "access", "member_left", "changed"]) }),
  z.object({ kind: z.literal("notifications"), reason: z.enum(["delivered", "read", "acknowledge", "snoozed"]) }),
  // A document, task, event or the name of a Space changed, or a place in a Space ended (DEC-051). The search screen
  // reads its results again; the hint names no content.
  z.object({ kind: z.literal("search"), space_id: z.string().uuid(), reason: z.enum(["document", "task", "event", "space", "access"]) }),
  // A vote, a withdrawn vote, a new poll or a closed poll in a Space: the polls screen reads its lists again.
  z.object({ kind: z.literal("poll"), space_id: z.string().uuid(), poll_id: z.string().uuid(), reason: z.literal("changed") }),
])]);
const readySchema = z.object({ heartbeat_seconds: z.number().int().positive(), max_seconds: z.number().int().positive() });
const endSchema = z.object({ reason: z.enum(["time_limit", "signed_out", "too_many_connections"]) });
export type LiveUpdate = (z.infer<typeof changeSchema> | { kind: "resync" }) & { accountId: string };

type Connection = {
  accountId: string;
  references: number;
  clients: Map<QueryClient, number>;
  attempt: number;
  terminal: boolean;
  controller: AbortController | null;
  timer: number | null;
  alerts: AbortController | null;
  alertsQueued: boolean;
  online: () => void;
  offline: () => void;
};

const delays = [1000, 2000, 5000, 10000, 30000];
const listeners = new Set<(event: LiveUpdate) => void>();
const connectionListeners = new Set<() => void>();
const shownAlerts = new Map<string, Set<string>>();
const retryDeadlines = new Map<string, number>();
let connection: Connection | null = null;
let connected = false;

function current(owner: Connection) {
  return connection === owner && owner.references > 0 && !owner.terminal;
}

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  connectionListeners.forEach(listener => listener());
}

export function subscribeLive(listener: (event: LiveUpdate) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function subscribeConnection(listener: () => void) {
  connectionListeners.add(listener);
  return () => { connectionListeners.delete(listener); };
}

export function useLiveConnected() {
  return useSyncExternalStore(subscribeConnection, () => connected, () => false);
}

export function browserAlertsEnabled(accountId: string) {
  try {
    return window.Notification?.permission === "granted" && window.localStorage.getItem(`cp-browser-alerts:${accountId}`) === "on";
  } catch { return false; }
}

export function setBrowserAlertsEnabled(accountId: string, enabled: boolean) {
  try {
    if (enabled) window.localStorage.setItem(`cp-browser-alerts:${accountId}`, "on");
    else window.localStorage.removeItem(`cp-browser-alerts:${accountId}`);
    return true;
  } catch { return false; }
}

function mayAlert(owner: Connection) {
  return current(owner) && document.hidden && browserAlertsEnabled(owner.accountId);
}

async function alertReminders(owner: Connection) {
  if (!mayAlert(owner)) return;
  if (owner.alerts) { owner.alertsQueued = true; return; }
  const controller = new AbortController();
  owner.alerts = controller;
  try {
    do {
      owner.alertsQueued = false;
      const page = await notificationPage(owner.accountId, null, controller.signal);
      if (!mayAlert(owner) || controller.signal.aborted) return;
      const shown = shownAlerts.get(owner.accountId) ?? new Set<string>();
      shownAlerts.set(owner.accountId, shown);
      for (const item of page.data) {
        if (item.read_at || shown.has(item.id) || !mayAlert(owner)) continue;
        const alert = new window.Notification("Reminder", { body: item.task_title, tag: item.id });
        shown.add(item.id);
        alert.onclick = () => {
          if (connection?.accountId === owner.accountId && !connection.terminal) {
            window.focus();
            window.location.assign("/app/notifications");
          }
          alert.close();
        };
      }
    } while (owner.alertsQueued && mayAlert(owner));
  } catch {} finally { owner.alerts = null; }
}

function update(owner: Connection, event: LiveUpdate) {
  if (!current(owner)) return;
  const keys = event.kind === "conversation" ? ["conversations"]
    : event.kind === "notifications" ? ["notifications", "home"]
      : event.kind === "agent" ? ["agentRuns", "agentMessageRun", "agentMemories"]
      : event.kind === "poll" ? ["spacePolls"]
      // Search results are read again by the open search screen itself, after a short wait that joins bursts of hints.
      : event.kind === "search" || event.kind === "typing" ? [] : ["conversations", "notifications", "home", "agentRuns", "agentMessageRun", "agentMemories", "spacePolls"];
  owner.clients.forEach((_references, client) => {
    keys.forEach(key => { void client.invalidateQueries({ queryKey: [key, owner.accountId] }).catch(() => undefined); });
  });
  listeners.forEach(listener => listener(event));
  if (event.kind === "notifications" && event.reason === "delivered") void alertReminders(owner);
}

function clearRetry(owner: Connection) {
  if (owner.timer !== null) window.clearTimeout(owner.timer);
  owner.timer = null;
}

function halt(owner: Connection) {
  owner.terminal = true;
  clearRetry(owner);
  owner.controller?.abort();
  owner.alerts?.abort();
  if (connection === owner) setConnected(false);
}

function retry(owner: Connection, milliseconds?: number) {
  if (!current(owner) || navigator.onLine === false || owner.timer !== null) return;
  const delay = Math.max(milliseconds ?? delays[Math.min(owner.attempt++, delays.length - 1)], (retryDeadlines.get(owner.accountId) ?? 0) - Date.now());
  owner.timer = window.setTimeout(() => { owner.timer = null; void connect(owner); }, Math.min(delay + Math.floor(Math.random() * 250), 2147483647));
}

function retryAfter(value: string | null) {
  const text = value?.trim() ?? "";
  if (/^\d+$/.test(text)) return Math.min(Number(text) * 1000, Number.MAX_SAFE_INTEGER - Date.now());
  const timestamp = /^[A-Za-z]/.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 30000;
}

async function connect(owner: Connection) {
  if (!current(owner) || navigator.onLine === false || owner.controller || owner.timer !== null) return;
  const remaining = (retryDeadlines.get(owner.accountId) ?? 0) - Date.now();
  if (remaining > 0) { retry(owner, remaining); return; }
  retryDeadlines.delete(owner.accountId);
  const controller = new AbortController();
  owner.controller = controller;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let wait: number | undefined;
  try {
    const response = await fetch("/api/live", {
      headers: { "X-Account-ID": owner.accountId }, credentials: "same-origin", cache: "no-store", signal: controller.signal,
    });
    if (!current(owner) || controller.signal.aborted) { await response.body?.cancel(); return; }
    if (response.status === 401) { halt(owner); await response.body?.cancel(); return; }
    if (response.status === 409) {
      const payload = await response.json();
      if (payload.error?.code === "ACCOUNT_CHANGED") halt(owner);
      return;
    }
    if (response.status === 429) {
      wait = retryAfter(response.headers.get("retry-after"));
      retryDeadlines.set(owner.accountId, Date.now() + wait);
      await response.body?.cancel();
      return;
    }
    if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
      await response.body?.cancel();
      return;
    }
    reader = response.body.getReader();
    const parser = createSseParser(frame => {
      if (!current(owner) || controller.signal.aborted) return;
      let payload: unknown;
      try { payload = JSON.parse(frame.data); } catch { return; }
      if (frame.event === "ready" && readySchema.safeParse(payload).success) {
        owner.attempt = 0;
        setConnected(true);
        update(owner, { kind: "resync", accountId: owner.accountId });
      } else if (frame.event === "change") {
        const change = changeSchema.safeParse(payload);
        if (change.success) update(owner, { ...change.data, accountId: owner.accountId });
      } else if (frame.event === "resync") {
        update(owner, { kind: "resync", accountId: owner.accountId });
      } else if (frame.event === "end") {
        const end = endSchema.safeParse(payload);
        if (!end.success) return;
        if (end.data.reason === "signed_out") halt(owner);
        else controller.abort();
      }
    });
    const decoder = new TextDecoder();
    while (current(owner) && !controller.signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) { parser.push(decoder.decode()); parser.finish(); break; }
      parser.push(decoder.decode(chunk.value, { stream: true }));
    }
  } catch {} finally {
    if (reader) { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (owner.controller === controller) owner.controller = null;
    if (connection === owner) setConnected(false);
    retry(owner, wait);
  }
}

function dispose(owner: Connection) {
  halt(owner);
  window.removeEventListener("online", owner.online);
  window.removeEventListener("offline", owner.offline);
  if (connection === owner) connection = null;
}

function retain(accountId: string, client: QueryClient) {
  for (const [account, deadline] of retryDeadlines) {
    if (deadline <= Date.now()) retryDeadlines.delete(account);
  }
  if (connection && connection.accountId !== accountId) dispose(connection);
  if (!connection) {
    const owner: Connection = {
      accountId, references: 0, clients: new Map(), attempt: 0, terminal: false, controller: null, timer: null,
      alerts: null, alertsQueued: false, online: () => { void connect(owner); },
      offline: () => {
        clearRetry(owner);
        owner.controller?.abort();
        owner.alerts?.abort();
        if (connection === owner) setConnected(false);
      },
    };
    connection = owner;
    window.addEventListener("online", owner.online);
    window.addEventListener("offline", owner.offline);
  }
  const owner = connection;
  owner.references += 1;
  owner.clients.set(client, (owner.clients.get(client) ?? 0) + 1);
  void connect(owner);
  return () => {
    owner.references -= 1;
    const references = (owner.clients.get(client) ?? 1) - 1;
    if (references) owner.clients.set(client, references); else owner.clients.delete(client);
    if (!owner.references) dispose(owner);
  };
}

export function resumeLiveUpdates(accountId: string) {
  const owner = connection;
  if (!owner || owner.accountId !== accountId || !owner.terminal || owner.references <= 0) return;
  owner.terminal = false;
  owner.attempt = 0;
  void connect(owner);
}

export function useLiveUpdates(accountId: string | undefined) {
  const client = useQueryClient();
  useEffect(() => accountId ? retain(accountId, client) : undefined, [accountId, client]);
}