'use client';
import { useState } from 'react';
import type { World } from '@/lib/rami/world';
import type { WishSelection } from '@/lib/rami/priorities';
import type { MatchResults } from '@/lib/rami/matches';
import styles from './experience.module.css';

export default function Matches({ world, priorities, call }: { world: World; priorities: WishSelection[]; call: (body: object) => Promise<MatchResults> }) {
  const [destination, setDestination] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<MatchResults | null>(null);
  async function search(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setResults(null);
    try { setResults(await call({ action: 'matches', destination, checkIn, checkOut, world, priorities })); }
    catch (e) { setError(e instanceof Error ? e.message : 'The search failed.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.matching} aria-label="Explore stays and experiences">
    <h3>Bring your trip closer</h3><p>Choose where and when to explore catalogue stays and supplier experiences.</p>
    <form onSubmit={search}>
      <label className={styles.label}>Destination<input required maxLength={100} value={destination} onChange={e => { setDestination(e.target.value); setResults(null); }} disabled={busy} placeholder="City or destination name" /></label>
      <label className={styles.label}>Check-in<input required type="date" value={checkIn} onChange={e => { setCheckIn(e.target.value); setResults(null); }} disabled={busy} /></label>
      <label className={styles.label}>Check-out<input required type="date" value={checkOut} min={checkIn || undefined} onChange={e => { setCheckOut(e.target.value); setResults(null); }} disabled={busy} /></label>
      <button className={styles.primary} disabled={busy}>{busy ? 'Searching sources…' : 'Explore options'}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {results && <div aria-live="polite"><h4>Stays in {results.destination}</h4><p>Catalogue identities only. Your requested amenities, prices and room availability still need checking.</p>
      {results.hotelStatus === 'unavailable' && <p>The stay catalogue could not be reached. Try again later.</p>}
      {results.hotelStatus === 'ok' && !results.hotels.length && <p>No eligible catalogue properties were found for this destination.</p>}
      {results.hotels.map(h => <article key={h.id}><h4>{h.name}</h4><p>{h.area} · {h.city} · {h.starRating} stars</p><a href={`/hotel/${encodeURIComponent(h.id)}`} target="_blank" rel="noopener noreferrer">View property details</a></article>)}
      <h4>Experiences</h4><p>{results.experiencesMode === 'sandbox' ? 'Test supplier results — not live bookable offers.' : results.experiencesMode === 'production' ? 'Supplier search results. From prices are indicative; availability for your party has not been confirmed.' : 'The experience source is not connected.'}</p>
      {results.experiencesMode !== 'unavailable' && !results.experiences.length && <p>No experiences were returned. The source may be unavailable or have no results for these dates.</p>}
      {results.experiences.map(p => <article key={p.id}><h4>{p.title}</h4><p>{p.description}</p><p>From {p.currency} {p.fromPrice.toFixed(2)} · {results.experiencesMode === 'sandbox' ? 'test price' : 'supplier search price'}</p>{p.relatedWishes.length > 0 && <p>Related words in the description: {p.relatedWishes.join('; ')}. This does not confirm these wishes are met.</p>}<small>Source: Viator · checked {new Date(p.checkedAt).toLocaleString()}</small></article>)}
      <h4>Still to confirm</h4><ul>{results.pendingWishes.map((s, i) => <li key={i}>{s.wish} · {s.priority} · needs confirmation</li>)}</ul>
    </div>}
  </section>;
}
