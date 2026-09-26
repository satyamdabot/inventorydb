import NextAuth, { type DefaultSession } from "next-auth";
import { authConfig } from "./auth.config";
import { getStore } from "@/lib/store";
import type { Role } from "@/lib/schema";
import { resolveLinkedPerson, type LoginRole } from "@/lib/user-link";

declare module "next-auth" {
  interface Session {
    user: { role: Role; personId: string } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
    personId?: string;
  }
}

// Only people listed in the `users` tab can sign in. Role changes apply at next sign-in.
async function findUser(email: string) {
  const users = await getStore().list("users");
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.active !== "false");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ profile }) {
      if (!profile?.email || !profile.email_verified) return false;
      return !!(await findUser(profile.email));
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        // Present only at sign-in, so the sheet is read once per login, not per request.
        const user = await findUser(profile.email);
        token.role = user?.role;
        token.personId = user
          ? resolveLinkedPerson(user as { email: string; role: LoginRole; person_id: string }, await getStore().list("people"))
          : "";
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role as Role;
      session.user.personId = token.personId ?? "";
      return session;
    },
  },
});
