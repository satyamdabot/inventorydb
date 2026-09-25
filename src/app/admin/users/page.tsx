import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { getStore } from "@/lib/store";
import styles from "../admin.module.css";
import { addUser, saveUser } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Please enter a valid email and role.",
  exists: "That email already has access.",
  person: "An IM login must be linked to an active IM from the People tab.",
  self: "You can't change your own access. Ask another admin.",
};

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireRole("admin");
  const { error } = await searchParams;
  const store = getStore();
  const [users, people] = await Promise.all([store.list("users"), store.list("people")]);
  users.sort((a, b) => a.email.localeCompare(b.email));
  const ims = people.filter((p) => p.role === "im" && p.active !== "false").sort((a, b) => a.name.localeCompare(b.name));

  const roleSelect = (value?: string) => (
    <select name="role" defaultValue={value ?? "im"}>
      <option value="im">IM</option>
      <option value="admin">Admin</option>
    </select>
  );
  const personSelect = (value?: string) => (
    <select name="person" defaultValue={value ?? ""}>
      <option value="">Linked person: none</option>
      {ims.map((p) => (
        <option key={p.person_id} value={p.person_id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <main className={styles.page}>
      <p className={styles.back}>
        <Link href="/">← Home</Link>
      </p>
      <h1>Users</h1>
      <p className={styles.muted}>
        Only these Google accounts can sign in. IMs record handovers and must be linked to their entry in
        the People tab. Changes apply the next time that person signs in. Deactivate instead of deleting.
      </p>
      {typeof error === "string" && ERRORS[error] && <p className={styles.error}>{ERRORS[error]}</p>}

      <form action={addUser} className={styles.row}>
        <input name="email" type="email" placeholder="Google email" required />
        {roleSelect()}
        {personSelect()}
        <button type="submit">Add user</button>
      </form>

      <div className={styles.list}>
        {users.map((u) => {
          const isMe = u.email.toLowerCase() === me.email?.toLowerCase();
          return (
            <form key={u.email} action={saveUser} className={styles.row}>
              <input type="hidden" name="email" value={u.email} />
              <span style={{ flex: "1 1 220px" }}>{u.email}{isMe && " (you)"}</span>
              {roleSelect(u.role)}
              {personSelect(u.person_id)}
              <label>
                <input type="checkbox" name="active" defaultChecked={u.active !== "false"} disabled={isMe} /> Active
              </label>
              <button type="submit" disabled={isMe}>
                Save
              </button>
            </form>
          );
        })}
      </div>
    </main>
  );
}
