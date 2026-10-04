/** The parts of a KeyboardEvent that shortcut matching looks at. */
export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Canonical name of a key press: modifiers in a fixed order, then the key.
 * Ctrl and Cmd both count as `mod`. Examples: 'r', 'mod+r', 'shift+r',
 * 'mod+shift+r', 'arrowleft', 'escape'.
 */
export function hotkeyName(e: KeyEventLike): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

/**
 * The binding a key press should trigger, if any. Matching is exact, so a
 * bare binding like 'r' never fires for Ctrl/Cmd+R (refresh), Shift+R, or
 * Alt+R — browser shortcuts keep working. While the user is typing, bare keys
 * are left to the field; Escape and modifier combinations still fire.
 */
export function resolveHotkey<T>(e: KeyEventLike, bindings: Readonly<Record<string, T>>, typing = false): T | undefined {
  const name = hotkeyName(e);
  const binding = bindings[name];
  if (binding === undefined) return undefined;
  const bare = !e.ctrlKey && !e.metaKey && !e.altKey;
  if (typing && bare && name !== 'escape') return undefined;
  return binding;
}
