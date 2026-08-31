import { NextRequest, NextResponse } from "next/server";
import { createPriceTracking } from "@/lib/priceTracking";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { hotelId, checkIn, checkOut, email, minDropAed, baselineTotal } = (body ?? {}) as Record<string, unknown>;

  if (
    typeof hotelId !== "string" ||
    typeof checkIn !== "string" ||
    typeof checkOut !== "string" ||
    typeof email !== "string" ||
    typeof minDropAed !== "number" ||
    typeof baselineTotal !== "number"
  ) {
    return NextResponse.json({ ok: false, error: "Missing or malformed fields." }, { status: 400 });
  }

  const result = await createPriceTracking({ hotelId, checkIn, checkOut, email, minDropAed, baselineTotal });
  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }
  return NextResponse.json(result);
}
