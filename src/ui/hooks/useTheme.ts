import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'cutroom.theme';

// The <html data-theme> attribute is the single source of truth (index.html sets
// it before first paint); every switch on the page subscribes to it.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

/** Light is the default; the choice is remembered per browser. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'light' as Theme);
  return { theme, setTheme };
}
