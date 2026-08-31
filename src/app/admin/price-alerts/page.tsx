import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { markAlertSent } from "./actions";
export const dynamic = "force-dynamic";

// Internal, unauthenticated by design (see DECISIONS.md — same rule as
// /admin/checkins). Every row here is a customer who opted into "track
// this price" and whose stated drop threshold has now been cleared;
// someone needs to actually email them, since there's no sender wired up
// yet.
export default async function PriceAlertsAdminPage() {
  const triggered = await db.query.priceTracking.findMany({
    where: eq(schema.priceTracking.status, "triggered"),
    orderBy: [desc(schema.priceTracking.triggeredAt)],
    limit: 100,
  });

  const recentlySent = await db.query.priceTracking.findMany({
    where: eq(schema.priceTracking.status, "sent"),
    orderBy: [desc(schema.priceTracking.sentAt)],
    limit: 20,
  });

  const rows = await Promise.all(
    [...triggered, ...recentlySent].map(async (t) => {
      const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, t.hotelId) });
      return { tracker: t, hotel };
    })
  );

  const triggeredRows = rows.filter((r) => r.tracker.status === "triggered");
  const sentRows = rows.filter((r) => r.tracker.status === "sent");

  return (
    <div className="shell">
      <div className="top-strip">
        <Link className="wordmark" href="/" style={{ textDecoration: "none" }}>
          Rate Manifest
        </Link>
        <span className="tagline">Price alerts (internal)</span>
      </div>

      <p className="footnote" style={{ marginBottom: "1.5rem" }}>
        Every "track this price" opt-in gets checked against the cheapest total the next time anyone
        searches that hotel/dates. A row lands here once the customer&apos;s own stated drop threshold has
        been cleared — email them, then mark it sent.
      </p>

      <h2 className="card-title">Needs sending ({triggeredRows.length})</h2>
      {triggeredRows.length === 0 ? (
        <p className="empty-state">Nothing triggered right now.</p>
      ) : (
        <div className="offer-list">
          {triggeredRows.map(({ tracker, hotel }) => {
            const drop = tracker.baselineTotal - (tracker.triggeredTotal ?? tracker.baselineTotal);
            return (
              <div key={tracker.id} className="offer-row admin-row">
                <div>
                  <div className="offer-source">
                    {hotel?.name ?? "Unknown hotel"}
                    <span className="offer-badge" style={{ marginLeft: "0.5rem" }}>
                      {tracker.email}
                    </span>
                  </div>
                  <div className="offer-reasons">
                    <span>
                      {tracker.checkIn.toISOString().slice(0, 10)} → {tracker.checkOut.toISOString().slice(0, 10)}
                    </span>
                    <span>
                      Was AED {Math.round(tracker.baselineTotal).toLocaleString("en-AE")} → now AED{" "}
                      {Math.round(tracker.triggeredTotal ?? 0).toLocaleString("en-AE")} (down AED{" "}
                      {Math.round(drop).toLocaleString("en-AE")}, wanted at least AED{" "}
                      {Math.round(tracker.minDropAed).toLocaleString("en-AE")})
                    </span>
                  </div>
                  <form action={markAlertSent} className="admin-form">
                    <input type="hidden" name="id" value={tracker.id} />
                    <button type="submit" className="btn btn-ghost">
                      Mark as sent
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sentRows.length > 0 && (
        <>
          <h2 className="card-title" style={{ marginTop: "2.5rem" }}>
            Recently sent
          </h2>
          <div className="offer-list">
            {sentRows.map(({ tracker, hotel }) => (
              <div key={tracker.id} className="offer-row admin-row">
                <div>
                  <div className="offer-source">
                    {hotel?.name ?? "Unknown hotel"}
                    <span className="offer-badge" style={{ marginLeft: "0.5rem" }}>
                      {tracker.email}
                    </span>
                  </div>
                  <div className="offer-reasons">
                    <span>Sent {tracker.sentAt?.toISOString().slice(0, 16).replace("T", " ")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
