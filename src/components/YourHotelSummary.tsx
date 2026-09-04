// Step 1 of the Intelligence journey ("YOUR HOTEL") - shown on both
// /hotel (before any credit is spent) and /search (as the first thing
// inside the Intelligence page itself, so a visitor arriving at /search
// directly - a bookmark, a shared link - still gets the same "we
// understood exactly what you picked" recap rather than jumping straight
// to a verdict with no context). See DECISIONS.md, "The Analyse This
// Hotel gate."
//
// Deliberately does NOT show a "Selected rate" line the way the pasted
// product spec's example did - this app has no concept of a single
// pre-selected rate at this point. The whole point of RateManifest is
// comparing several competing offers for one hotel/room/date combination,
// not booking a single rate blind - showing an invented "selected rate"
// here would misstate what's actually happened so far. Occupancy and room
// type are real fields (rooms.occupancy, rooms.normalizedType), not
// invented either.
interface YourHotelSummaryProps {
  hotelName: string;
  area: string;
  city: string;
  starRating: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  occupancy: number;
  roomTypeLabel: string;
}

export function YourHotelSummary({
  hotelName,
  area,
  city,
  starRating,
  checkIn,
  checkOut,
  nights,
  occupancy,
  roomTypeLabel,
}: YourHotelSummaryProps) {
  return (
    <div className="your-hotel-panel">
      <div className="your-hotel-eyebrow">Your Hotel</div>
      <div className="your-hotel-name">{hotelName}</div>
      <div className="your-hotel-meta">
        {area}, {city} · {starRating}-star
      </div>
      <div className="your-hotel-stats">
        <div>
          <span className="your-hotel-stat-label">Dates</span>
          <span className="your-hotel-stat-value">
            {checkIn} → {checkOut}
          </span>
        </div>
        <div>
          <span className="your-hotel-stat-label">Length of stay</span>
          <span className="your-hotel-stat-value">
            {nights} night{nights === 1 ? "" : "s"}
          </span>
        </div>
        <div>
          <span className="your-hotel-stat-label">Guests</span>
          <span className="your-hotel-stat-value">
            {occupancy} adult{occupancy === 1 ? "" : "s"}
          </span>
        </div>
        <div>
          <span className="your-hotel-stat-label">Room</span>
          <span className="your-hotel-stat-value">{roomTypeLabel}</span>
        </div>
      </div>
    </div>
  );
}
