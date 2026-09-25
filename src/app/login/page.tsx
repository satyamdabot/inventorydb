import { signIn } from "@/auth";
import styles from "../shell.module.css";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className={styles.center}>
      <form
        className={styles.card}
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <h1>Inventory</h1>
        <p className={styles.muted}>Sign in with your Google account to continue.</p>
        {error && (
          <p className={styles.error}>
            {error === "AccessDenied"
              ? "This Google account is not authorised. Ask an admin to add your email."
              : "Sign-in failed. Please try again."}
          </p>
        )}
        <button className={styles.button} type="submit">
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
