import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False while React hydrates the server's HTML and true on every later render, so a screen draws the loading state the server sent
// even if its account answer has already arrived.
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
