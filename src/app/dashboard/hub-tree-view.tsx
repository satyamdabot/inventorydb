import Link from "next/link";
import type { HubNode, HubStats } from "@/lib/hub-tree";
import { n } from "./charts";
import styles from "./dashboard.module.css";

/** "117 in stock · 3 with FO": only the parts that are not zero, in-stock first. */
export function breakdown(s: HubStats): string {
  return [
    `${n(s.byStatus.in_stock)} in stock`,
    s.byStatus.pending > 0 && `${n(s.byStatus.pending)} incoming`,
    s.byStatus.with_fo > 0 && `${n(s.byStatus.with_fo)} with FO`,
    s.byStatus.with_rig > 0 && `${n(s.byStatus.with_rig)} with rig`,
    s.byStatus.traveling > 0 && `${n(s.byStatus.traveling)} traveling`,
    s.byStatus.lost + s.byStatus.damaged > 0 && `${n(s.byStatus.lost + s.byStatus.damaged)} lost or damaged`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Hubs with no cards anywhere under them are hidden unless asked for. Top-level hubs always show. */
export const isVisible = (node: HubNode, showEmpty: boolean) => showEmpty || node.total.held > 0 || !node.parent;

export function countHidden(nodes: HubNode[], showEmpty: boolean): number {
  return nodes.reduce(
    (sum, node) => sum + (isVisible(node, showEmpty) ? countHidden(node.children, showEmpty) : 1 + countHidden(node.children, true)),
    0,
  );
}

function Row({ node }: { node: HubNode }) {
  const sub = node.total.held - node.own.held;
  return (
    <span className={styles.treeRow}>
      <Link href={`/dashboard/hub/${node.hub.hub_id}`} className={styles.treeName}>
        {node.hub.name}
        {node.hub.is_central === "true" && <span className={styles.treeTag}>main hub</span>}
        {node.hub.active === "false" && <span className={styles.treeTag}>inactive</span>}
      </Link>
      <span className={styles.treeCount}>{n(node.total.held)} cards</span>
      <span className={styles.treeMeta}>
        {breakdown(node.total)}
        {node.children.length > 0 && ` · ${n(node.own.held)} here, ${n(sub)} in sub-hubs`}
      </span>
    </span>
  );
}

function TreeNode({ node, depth, showEmpty }: { node: HubNode; depth: number; showEmpty: boolean }) {
  const children = node.children.filter((c) => isVisible(c, showEmpty));
  if (children.length === 0) {
    return (
      <div className={styles.treeLeaf}>
        <Row node={node} />
      </div>
    );
  }
  return (
    <details className={styles.treeNode} open={depth < 1}>
      <summary>
        <Row node={node} />
      </summary>
      <ul className={styles.treeChildren}>
        {children.map((c) => (
          <li key={c.hub.hub_id}>
            <TreeNode node={c} depth={depth + 1} showEmpty={showEmpty} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The hub hierarchy: a top-level hub with the hubs under it, each showing its stock. Click a name for details. */
export function HubTreeView({ roots, showEmpty }: { roots: HubNode[]; showEmpty: boolean }) {
  return (
    <ul className={styles.tree}>
      {roots
        .filter((r) => isVisible(r, showEmpty))
        .map((r) => (
          <li key={r.hub.hub_id}>
            <TreeNode node={r} depth={0} showEmpty={showEmpty} />
          </li>
        ))}
    </ul>
  );
}
