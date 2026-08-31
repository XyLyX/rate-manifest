import { cookies } from "next/headers";

const SESSION_COOKIE = "rm_session";

/** Reads the anonymous session id middleware.ts guarantees is set. */
export async function getSessionId(): Promise<string> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? "unknown_session";
}
