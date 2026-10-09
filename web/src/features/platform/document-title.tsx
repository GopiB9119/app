"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Names each screen in the tab, the history and the screen reader by mirroring its visible heading.
 * The server only knows the site name, so a screen without a heading yet keeps that, and leaving /app puts it back.
 */
export function DocumentTitle() {
  const pathname = usePathname();
  const refresh = useRef<() => void>(() => undefined);
  useEffect(() => {
    const site = document.title;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const heading = document.querySelector("main h1")?.textContent?.replace(/\s+/g, " ").trim();
      const next = heading ? `${heading} | ${site}` : site;
      if (document.title !== next) document.title = next;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    refresh.current = schedule;
    // The head is watched too: Next writes the server title back once the page has hydrated.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); document.title = site; };
  }, []);
  useEffect(() => refresh.current(), [pathname]);
  return null;
}
