import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { logEvent } from "@/lib/events";
import { getSessionId } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.hotelId || !body?.supplierSlug) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sessionId = await getSessionId();
  const supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.slug, body.supplierSlug) });

  await logEvent({
    type: "rate_revealed",
    sessionId,
    hotelId: body.hotelId,
    supplierId: supplier?.id,
    metadata: { searchId: body.searchId },
  });

  return NextResponse.json({ ok: true });
}
