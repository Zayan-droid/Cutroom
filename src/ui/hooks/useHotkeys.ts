import { useEffect } from 'react';
import { resolveHotkey } from '@/lib/hotkeys';

type Handler = (e: KeyboardEvent) => void;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Global keyboard bindings, named like 'r', 'escape', 'arrowleft', 'mod+enter'.
 * Matching is exact (see `resolveHotkey`): Ctrl/Cmd+R still refreshes the page
 * instead of triggering 'r'. Bare keys are ignored while the user is typing;
 * Escape and modifier combinations always fire. Nothing fires while a modal
 * dialog is open — the dialog owns the keyboard (including Esc to cancel).
 */
export function useHotkeys(bindings: Record<string, Handler>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || document.querySelector('dialog[open]')) return;
      const handler = resolveHotkey(e, bindings, isTypingTarget(e.target));
      if (!handler) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindings]);
}
