import { OUT_STATUSES, STATUSES, type Hub, type Item, type Status } from "./schema";

export interface HubStats {
  held: number; // cards currently at this hub
  inStock: number;
  out: number; // pending, traveling, with FO or with rig
  byStatus: Record<Status, number>;
}

export interface HubNode {
  hub: Hub;
  parent?: HubNode;
  children: HubNode[];
  owned: number; // cards whose home hub is this hub
  own: HubStats; // this hub alone
  total: HubStats; // this hub plus every hub under it
}

const emptyStats = (): HubStats => ({
  held: 0,
  inStock: 0,
  out: 0,
  byStatus: Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>,
});

function add(a: HubStats, b: HubStats): HubStats {
  return {
    held: a.held + b.held,
    inStock: a.inStock + b.inStock,
    out: a.out + b.out,
    byStatus: Object.fromEntries(STATUSES.map((s) => [s, a.byStatus[s] + b.byStatus[s]])) as Record<Status, number>,
  };
}

/** True if giving `hubId` this parent would make a loop (the parent is the hub itself or sits under it). */
export function wouldCreateCycle(hubs: Hub[], hubId: string, newParent: string): boolean {
  const parentOf = new Map(hubs.map((h) => [h.hub_id, h.parent_hub]));
  const seen = new Set<string>();
  for (let cur: string | undefined = newParent; cur; cur = parentOf.get(cur)) {
    if (cur === hubId) return true;
    if (seen.has(cur)) return true; // a loop that already exists further up
    seen.add(cur);
  }
  return false;
}

/**
 * Builds the hub hierarchy with each card counted once, at the hub it is at, and rolled up to every ancestor.
 * A parent that is missing, is the hub itself, or would make a loop is ignored, so that hub becomes top-level.
 * Returns the top-level hubs. Siblings are ordered by cards held, then name.
 */
export function buildHubTree(hubs: Hub[], items: Item[]): HubNode[] {
  const held = new Map<string, Item[]>();
  for (const i of items) held.set(i.current_hub, [...(held.get(i.current_hub) ?? []), i]);

  const nodes = new Map<string, HubNode>();
  for (const hub of hubs) {
    const here = held.get(hub.hub_id) ?? [];
    const own = emptyStats();
    for (const i of here) {
      own.held++;
      if (i.status === "in_stock") own.inStock++;
      if (OUT_STATUSES.includes(i.status)) own.out++;
      if (i.status in own.byStatus) own.byStatus[i.status]++;
    }
    nodes.set(hub.hub_id, {
      hub,
      children: [],
      owned: items.filter((i) => i.home_hub === hub.hub_id).length,
      own,
      total: own,
    });
  }

  const roots: HubNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.hub.parent_hub ? nodes.get(node.hub.parent_hub) : undefined;
    if (parent && !wouldCreateCycle(hubs.filter((h) => h.hub_id !== node.hub.hub_id), node.hub.hub_id, parent.hub.hub_id)) {
      node.parent = parent;
      parent.children.push(node);
    } else roots.push(node);
  }

  // Roll totals up from the leaves, then order every level.
  const roll = (node: HubNode): HubStats => {
    node.children.sort((a, b) => a.hub.name.localeCompare(b.hub.name));
    node.total = node.children.reduce((sum, c) => add(sum, roll(c)), node.own);
    node.children.sort((a, b) => b.total.held - a.total.held || a.hub.name.localeCompare(b.hub.name));
    return node.total;
  };
  roots.forEach(roll);
  return roots.sort((a, b) => b.total.held - a.total.held || a.hub.name.localeCompare(b.hub.name));
}

export function findNode(roots: HubNode[], hubId: string): HubNode | undefined {
  for (const r of roots) {
    if (r.hub.hub_id === hubId) return r;
    const inside = findNode(r.children, hubId);
    if (inside) return inside;
  }
  return undefined;
}

/** The hub itself plus every hub under it. */
export function subtreeIds(node: HubNode): string[] {
  return [node.hub.hub_id, ...node.children.flatMap(subtreeIds)];
}

/** From the top-level hub down to this one, for a breadcrumb. */
export function pathTo(node: HubNode): HubNode[] {
  return node.parent ? [...pathTo(node.parent), node] : [node];
}
