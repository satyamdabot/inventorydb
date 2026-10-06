import { requireRole } from "@/lib/authz";
import { defaultActor } from "@/lib/actors";
import { getStore } from "@/lib/store";
import { computeMyStats } from "@/lib/my-stats";

export default async function MyDashboard() {
  const user = await requireRole();
  const me = defaultActor(user); // their linked person_id, or their email for an admin with no link
  const store = getStore();
  const [items, events] = await Promise.all([store.list("items"), store.list("events")]);
  const s = computeMyStats(items, events, me, new Date());
  // render it…
}