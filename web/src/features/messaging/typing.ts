"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/features/identity/client";
import { subscribeLive, useLiveConnected } from "@/features/realtime/live";
import { readMembers } from "@/features/spaces/client";
import { TYPING_TTL_MILLISECONDS, sendTyping, typingMentions } from "./client";
import type { Conversation, TypingIntent, TypingUpdate } from "./client";

const UPDATE_MILLISECONDS = 2000;
const IDLE_MILLISECONDS = 4000;
type Context = Pick<TypingIntent, "mentioned_account_ids" | "mentions_agent">;
type Activity = Context & { is_typing: boolean };

export function useConversationTyping(accountId: string, conversation: Conversation, available: boolean) {
  const live = useLiveConnected();
  const connected = available && live;
  const queryClient = useQueryClient();
  const conversationId = conversation.id;
  const spaceId = conversation.space_id;
  const roster = useQuery({
    queryKey: ["members", accountId, spaceId],
    queryFn: ({ signal }) => readMembers(accountId, spaceId, signal),
    enabled: connected && conversation.kind === "space",
    refetchInterval: connected ? 30000 : false,
  });
  const enabled = connected && (conversation.kind === "direct" || roster.isSuccess);
  const members = conversation.kind === "direct" ? conversation.participants : roster.data ?? [];
  const [updates, setUpdates] = useState<TypingUpdate[]>([]);
  const [problem, setProblem] = useState<unknown>(null);
  const controls = useRef<{ change: (context: Context) => void; stop: () => void } | null>(null);

  useEffect(() => {
    setUpdates([]);
    setProblem(null);
    if (!enabled) return;
    const clientId = crypto.randomUUID();
    let sequence = 0;
    let disposed = false;
    let running = false;
    let active = false;
    let lastSent = -Infinity;
    let cooldown = 0;
    let desired: Activity | null = null;
    let queued: number | undefined;
    let idle: number | undefined;
    const records = new Map<string, { hint: TypingUpdate; until: number; forgetAt: number }>();

    function flush() {
      window.clearTimeout(queued);
      queued = undefined;
      if (running || !desired) return;
      if (desired.is_typing) {
        const wait = lastSent + UPDATE_MILLISECONDS - Date.now();
        if (wait > 0) { queued = window.setTimeout(flush, wait); return; }
      }
      const intent = { ...desired, client_id: clientId, sequence: ++sequence };
      desired = null;
      running = true;
      lastSent = intent.is_typing ? Date.now() : -Infinity;
      void sendTyping(accountId, conversationId, intent, AbortSignal.timeout(5000)).then(() => {
        if (!disposed) setProblem(null);
      }).catch((error: unknown) => {
        if (!disposed) setProblem(error);
        else console.warn("A final typing update could not be confirmed; its presence will expire.");
        if (error instanceof ApiError && error.status === 429) {
          cooldown = Date.now() + 60000;
          if (desired?.is_typing) desired = null;
        }
      }).finally(() => { running = false; flush(); });
    }

    function stop() {
      window.clearTimeout(idle);
      window.clearTimeout(queued);
      if (!active) return;
      active = false;
      desired = { is_typing: false, mentioned_account_ids: [], mentions_agent: false };
      flush();
    }

    function change(context: Context) {
      if (disposed || document.hidden || navigator.onLine === false) { stop(); return; }
      if (Date.now() < cooldown) return;
      active = true;
      desired = { is_typing: true, ...context };
      window.clearTimeout(idle);
      idle = window.setTimeout(stop, IDLE_MILLISECONDS);
      flush();
    }
    controls.current = { change, stop };

    function refresh() {
      const now = Date.now();
      const people = new Map<string, TypingUpdate>();
      for (const [key, record] of records) {
        if (record.forgetAt <= now) records.delete(key);
        else if (record.hint.is_typing && record.until > now) people.set(record.hint.account_id, record.hint);
      }
      const next = [...people.values()].sort((a, b) => a.account_id.localeCompare(b.account_id));
      setUpdates(previous => previous.length === next.length && previous.every((item, index) => item === next[index]) ? previous : next);
    }

    const unsubscribe = subscribeLive(event => {
      if (event.accountId !== accountId) return;
      if (event.kind === "resync" || (event.kind === "conversation" && event.conversation_id === conversationId
        && ["access", "member_left"].includes(event.reason))) {
        records.clear();
        refresh();
        stop();
        void queryClient.invalidateQueries({ queryKey: ["members", accountId, spaceId] }).catch(setProblem);
      }
      if (event.kind !== "typing" || event.conversation_id !== conversationId || event.space_id !== spaceId
        || event.account_id === accountId || document.hidden) return;
      const key = `${event.account_id}:${event.client_id}`;
      const previous = records.get(key);
      if (previous && previous.hint.sequence >= event.sequence) return;
      // A stopped/expired source keeps its sequence briefly so a delayed update cannot revive it.
      records.delete(key);
      records.set(key, {
        hint: event, until: Math.min(Date.parse(event.expires_at), Date.now() + TYPING_TTL_MILLISECONDS),
        forgetAt: Date.now() + TYPING_TTL_MILLISECONDS * 2,
      });
      refresh();
    });
    const expiry = window.setInterval(refresh, 250);
    const hide = () => {
      if (!document.hidden) return;
      stop();
      records.clear();
      refresh();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", stop);
    window.addEventListener("pagehide", stop);
    window.addEventListener("offline", stop);
    return () => {
      disposed = true;
      stop();
      controls.current = null;
      unsubscribe();
      window.clearInterval(expiry);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", stop);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("offline", stop);
    };
  }, [accountId, conversationId, spaceId, enabled, queryClient]);

  return {
    people: enabled ? updates.flatMap(update => {
      const person = members.find(member => member.account_id === update.account_id);
      return person ? [{
        accountId: person.account_id, name: person.display_name, mentionsAgent: update.mentions_agent,
        mentions: update.mentioned_account_ids.flatMap(id => {
          const mentioned = members.find(member => member.account_id === id);
          return mentioned ? [mentioned.display_name] : [];
        }),
      }] : [];
    }) : [],
    error: problem ?? (conversation.kind === "space" ? roster.error : null),
    change(text: string) {
      if (!enabled || !text.trim() || members.length < 2) controls.current?.stop();
      else controls.current?.change(typingMentions(text, members));
    },
    stop() { controls.current?.stop(); },
  };
}
