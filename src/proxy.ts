import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "rm_session";

function generateSessionId(): string {
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// Ensures every visitor has a short-lived, anonymous session id before any
// page or API route runs. This is what groups one person's search →
// results_viewed → rate_revealed → outbound_click Events together — not a
// user account, no personal data attached.
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(SESSION_COOKIE);
  if (existing) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, generateSessionId(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
