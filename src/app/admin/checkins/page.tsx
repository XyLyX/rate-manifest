import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { updateOutcomeStatus } from "./actions";
export const dynamic = "force-dynamic";

// Internal, unauthenticated by design (see DECISIONS.md — this stays a
// localhost-only tool until real auth is worth adding). This is where the
// manual half of the WhatsApp check-in mechanism lives: a guest messages
// Rate Manifest's own WhatsApp number from the stub-booking page (or, once
// real, the real booking confirmation), and whoever reads that reply
// records what happened here — matched by the short ref code both sides
// can see.
export default async function CheckinsAdminPage() {
  const outcomes = await db.query.bookingOutcomes.findMany({
    orderBy: [desc(schema.bookingOutcomes.clickedAt)],
    limit: 100,
  });

  const rows = await Promise.all(
    outcomes.map(async (o) => {
      const [hotel, supplier, rate] = await Promise.all([
        db.query.hotels.findFirst({ where: eq(schema.hotels.id, o.hotelId) }),
        db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, o.supplierId) }),
        db.query.rates.findFirst({ where: eq(schema.rates.id, o.rateId) }),
      ]);
      return { outcome: o, hotel, supplier, rate };
    })
  );

  return (
    <div className="shell">
      <div className="top-strip">
        <Link className="wordmark" href="/" style={{ textDecoration: "none" }}>
          Rate Manifest
        </Link>
        <span className="tagline">Check-ins (internal)</span>
      </div>

      <p className="footnote" style={{ marginBottom: "1.5rem" }}>
        Every outbound click opens a row here at "clicked." When someone replies on WhatsApp with their
        ref code, find the matching row below and record what they said — that's what turns a click into
        a real reliability signal for the supplier involved.
      </p>

      {rows.length === 0 ? (
        <p className="empty-state">No outbound clicks yet.</p>
      ) : (
        <div className="offer-list">
          {rows.map(({ outcome, hotel, supplier, rate }) => (
            <div key={outcome.id} className="offer-row admin-row">
              <div>
                <div className="offer-source">
                  {hotel?.name ?? "Unknown hotel"}
                  <span className="offer-badge" style={{ marginLeft: "0.5rem" }}>
                    ref {outcome.id.slice(0, 8)}
                  </span>
                </div>
                <div className="offer-reasons">
                  <span>
                    via {supplier?.name ?? "unknown source"}
                    {rate ? ` · ${rate.checkIn.toISOString().slice(0, 10)} → ${rate.checkOut.toISOString().slice(0, 10)}` : ""}
                  </span>
                  <span>Clicked {outcome.clickedAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                  <span>
                    Status: <strong>{outcome.status}</strong>
                    {outcome.issueNote ? ` — ${outcome.issueNote}` : ""}
                  </span>
                </div>
                <form
                  key={`${outcome.id}-${outcome.status}-${outcome.issueNote ?? ""}`}
                  action={updateOutcomeStatus}
                  className="admin-form"
                >
                  <input type="hidden" name="outcomeId" value={outcome.id} />
                  <select name="status" defaultValue={outcome.status}>
                    <option value="clicked">Clicked (awaiting reply)</option>
                    <option value="confirmed_via_followup">Confirmed via WhatsApp</option>
                    <option value="issue_reported">Issue reported</option>
                    <option value="unknown">Unknown / no reply</option>
                  </select>
                  <input type="text" name="issueNote" placeholder="Note (optional)" defaultValue={outcome.issueNote ?? ""} />
                  <button type="submit" className="btn btn-ghost">
                    Save
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
