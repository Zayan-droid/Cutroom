import type { Take } from '../types.ts';

export interface RailEntry {
  take: Take;
  depth: number;
  isActive: boolean;
  isAncestor: boolean;
}

/** Root-to-selection path; no duplicated history state. */
export function deriveLineage(takes: Take[], activeTakeId: string | null): Take[] {
  const byId = new Map(takes.map((take) => [take.id, take]));
  const path: Take[] = [];
  const seen = new Set<string>();
  let id = activeTakeId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const take = byId.get(id);
    if (!take) break;
    path.push(take);
    id = take.parentId;
  }
  return path.reverse();
}

/** Stable depth-first forest: ancestors precede children; sibling branches remain visible. */
export function deriveRail(takes: Take[], activeTakeId: string | null): RailEntry[] {
  const ids = new Set(takes.map((take) => take.id));
  const ancestors = new Set(deriveLineage(takes, activeTakeId).map((take) => take.id));
  const children = new Map<string | null, Take[]>();
  for (const take of takes) {
    const parent = take.parentId && ids.has(take.parentId) ? take.parentId : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(take);
    children.set(parent, siblings);
  }
  const entries: RailEntry[] = [];
  const seen = new Set<string>();
  const visit = (roots: Take[]) => {
    const stack = roots.map((take) => ({ take, depth: 0 })).reverse();
    while (stack.length) {
      const { take, depth } = stack.pop()!;
      if (seen.has(take.id)) continue;
      seen.add(take.id);
      entries.push({ take, depth, isActive: take.id === activeTakeId, isAncestor: take.id !== activeTakeId && ancestors.has(take.id) });
      const descendants = children.get(take.id) ?? [];
      for (let i = descendants.length - 1; i >= 0; i--) stack.push({ take: descendants[i], depth: depth + 1 });
    }
  };
  visit(children.get(null) ?? []);
  // Defensive against malformed imported forests; never loop or silently lose a take.
  visit(takes.filter((take) => !seen.has(take.id)));
  return entries;
}
