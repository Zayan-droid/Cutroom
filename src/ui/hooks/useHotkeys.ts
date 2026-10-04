import { useEffect } from 'react';

type Handler = (e: KeyboardEvent) => void;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

/**
 * Global keyboard bindings. Keys like 'r', 'escape', 'arrowleft', 'mod+enter'.
 * Bindings are ignored while the user is typing, EXCEPT combos with a modifier
 * (mod/ctrl/meta) and 'escape', which always fire. Nothing fires while a modal
 * dialog is open — the dialog owns the keyboard (including Esc to cancel).
 */
export function useHotkeys(bindings: Record<string, Handler>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const combo = `${mod ? 'mod+' : ''}${key}`;
      const handler = bindings[combo] ?? bindings[key];
      if (!handler) return;

      const bareKey = !mod && key !== 'escape';
      if (bareKey && isTypingTarget(e.target)) return;

      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindings]);
}
