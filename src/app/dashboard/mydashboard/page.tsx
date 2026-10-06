import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { ROLE_LABELS } from "@/lib/labels";
import styles from "../dashboard.module.css";

export default async function MyDashboardPage() {
  const user = await requireRole("admin", "im", "rig");

  return (
    <div className={styles.root}>
      <main className={styles.wrap}>
        <p className={styles.back}>
          <Link href="/">← Home</Link>
        </p>

        <h1>My dashboard</h1>

        <p className={styles.subtitle}>
          Signed in as {user.email ?? "Unknown user"}
        </p>

        <section
          className={styles.card}
          aria-label="My account"
        >
          <h2>My account</h2>

          <p>
            <strong>Email:</strong>{" "}
            {user.email ?? "Not available"}
          </p>

          <p>
            <strong>Role:</strong>{" "}
            {ROLE_LABELS[user.role]}
          </p>
        </section>

        <section
          className={styles.card}
          aria-label="My activity"
        >
          <h2>My activity</h2>

          <p className={styles.muted}>
            Activity tracking is not connected to this page yet.
          </p>
        </section>
      </main>
    </div>
  );
}