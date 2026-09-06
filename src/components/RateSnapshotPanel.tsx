import type { SnapshotField } from "@/lib/scoring/rateSnapshot";

// Section 4 + 6 of Navin's "Handling Missing Rate Conditions" spec - one
// panel that lists every rate attribute a customer would want before
// booking, each explicitly marked CONFIRMED or ⚠ not confirmed, followed by
// a "Things to verify before booking" callout generated from whichever
// fields above actually came back unknown for this offer. Deliberately a
// plain list, not a table with green/red ticks either way - a red X next to
// "Breakfast" would read as "no breakfast," when the honest answer is "we
// don't know," and section 5's "unknown is never treated as negative" rule
// applies to how this is drawn, not just how it's scored.
export function RateSnapshotPanel({
  fields,
  verifyItems,
}: {
  fields: SnapshotField[];
  verifyItems: SnapshotField[];
}) {
  return (
    <div className="rate-snapshot-panel">
      <div className="rate-snapshot-title">Rate snapshot</div>
      <ul className="rate-snapshot-list">
        {fields.map((f) => (
          <li key={f.label} className={`rate-snapshot-row rate-snapshot-${f.status}`}>
            <span className="rate-snapshot-label">{f.label}</span>
            <span className="rate-snapshot-value">
              {f.status === "unknown" && (
                <span className="rate-snapshot-flag" aria-hidden="true">
                  ⚠
                </span>
              )}
              {f.value}
            </span>
          </li>
        ))}
      </ul>

      {verifyItems.length > 0 && (
        <div className="rate-snapshot-verify">
          <div className="rate-snapshot-verify-title">
            <span aria-hidden="true">⚠</span> Things to verify before booking
          </div>
          <ul className="rate-snapshot-verify-list">
            {verifyItems.map((f) => (
              <li key={f.label}>
                <strong>{f.label}:</strong> {f.value}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
