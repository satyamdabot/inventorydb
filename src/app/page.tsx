import Link from "next/link";
import { signOut } from "@/auth";
import { requireRole } from "@/lib/authz";
import styles from "./shell.module.css";

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await requireRole();
  const { denied } = await searchParams;

  return (
    <main className={styles.center}>
      <div className={styles.card}>
        <h1>Inventory</h1>
        {denied && <p className={styles.error}>Your role cannot open that page.</p>}
        <p className={styles.muted}>
          Signed in as {user.email} ({user.role})
        </p>
        <Link href="/inventory">Inventory</Link>
        {(user.role === "admin" || user.role === "im") && (
          <>
            <Link href="/handover/send">Send cards</Link>
            <Link href="/handover/receive">Receive cards</Link>
          </>
        )}
        {user.role === "admin" && (
          <>
            <Link href="/admin/hubs">Manage hubs</Link>
            <Link href="/admin/people">Manage people</Link>
            <Link href="/admin/users">Manage users</Link>
          </>
        )}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className={styles.buttonSecondary} type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
