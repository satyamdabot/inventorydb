import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "./schema";

/** Use at the top of server pages and actions. Redirects if not signed in or not allowed. */
export async function requireRole(...roles: Role[]) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (roles.length && !roles.includes(session.user.role)) redirect("/?denied=1");
  return session.user;
}
