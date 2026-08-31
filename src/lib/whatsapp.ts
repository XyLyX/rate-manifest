// The WhatsApp check-in mechanism, MVP version — see DECISIONS.md for the
// full writeup of why this exists in this shape.
//
// Short version: the original framing ("send every clicker a check-in
// message") doesn't actually work — nothing in this app collects a
// guest's phone number, so there's no number to send TO. What's buildable
// today, with zero signups and zero API: after someone clicks through to
// book, invite THEM to message Rate Manifest's own WhatsApp number to
// confirm — that's a normal wa.me click-to-chat link, no WhatsApp Business
// API account needed. /admin/checkins is where those replies get
// reconciled by hand against the BookingOutcome row they belong to.

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim());
}

interface CheckinLinkParams {
  outcomeId: string;
  hotelName: string;
  supplierName: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
}

/**
 * Builds a wa.me link, pre-filled with enough detail (hotel, supplier,
 * dates, and a short reference code) that whoever reads it on the other
 * end — today, that's Navin himself — can match it to the right
 * BookingOutcome row on /admin/checkins without any other lookup.
 */
export function buildCheckinLink(params: CheckinLinkParams): string | null {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim().replace(/[^\d]/g, "");
  if (!number) return null;

  const ref = params.outcomeId.slice(0, 8);
  const message =
    `Hi! I just booked ${params.hotelName} via ${params.supplierName} ` +
    `(${params.checkIn} to ${params.checkOut}) through Rate Manifest. ` +
    `Confirming my stay — ref ${ref}.`;

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
