import { db, schema } from "@/db/client";
import { asc } from "drizzle-orm";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
export const dynamic = "force-dynamic";

function defaultCheckIn(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function defaultCheckOut(): string {
  const d = new Date();
  d.setDate(d.getDate() + 16);
  return d.toISOString().slice(0, 10);
}

export default async function HomePage() {
  const hotels = await db.query.hotels.findMany({ orderBy: asc(schema.hotels.name) });

  return (
    <div className="shell">
      <NavBar />

      <div className="hero">
        <div className="hero-eyebrow">Hotel rate intelligence</div>
        <h1>
          Every rate.
          <br />
          One clear decision.
        </h1>
        <p>
          We compare available hotel offers, normalize the differences, and show you which deal actually
          makes sense.
        </p>
      </div>

      <div className="card search-card">
        <form className="search-form" action="/search" method="GET">
          <div className="field">
            <label htmlFor="hotel">Property</label>
            <select id="hotel" name="hotel" required defaultValue="">
              <option value="" disabled>
                Choose a property…
              </option>
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} — {h.area} ({h.starRating}★)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="checkin">Check-in</label>
            <input id="checkin" name="checkin" type="date" defaultValue={defaultCheckIn()} required />
          </div>
          <div className="field">
            <label htmlFor="checkout">Check-out</label>
            <input id="checkout" name="checkout" type="date" defaultValue={defaultCheckOut()} required />
          </div>
          <button className="btn" type="submit">
            Find my rate →
          </button>
        </form>
      </div>

      <section id="how-it-works" className="how-it-works">
        <h2>What makes Rate Manifest different?</h2>
        <div className="how-it-works-grid">
          <div className="how-card">
            <div className="how-card-label">Compare</div>
            <p>Multiple rate sources, checked in one search.</p>
          </div>
          <div className="how-card">
            <div className="how-card-label">Normalize</div>
            <p>Same room. Same dates. Real terms — not a side-by-side of apples and oranges.</p>
          </div>
          <div className="how-card">
            <div className="how-card-label">Decide</div>
            <p>We tell you which deal is actually worth taking, and why.</p>
          </div>
        </div>
      </section>

      <p className="footnote">
        Rate Manifest checks every source it has access to and shows its own computed summary first —
        the named supplier and link only appear once you choose to reveal one.
      </p>

      <Footer />
    </div>
  );
}
