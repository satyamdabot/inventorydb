import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Redirects signed-out visitors to /login. Real permission checks happen in
// server code via requireRole(); this is only the first gate.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
