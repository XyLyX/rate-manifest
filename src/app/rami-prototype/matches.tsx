'use client';
import { useEffect, useRef, useState } from 'react';
import type { World } from '@/lib/rami/world';
import type { WishSelection } from '@/lib/rami/priorities';
import type { MatchResults } from '@/lib/rami/matches';
import { shortlistBrief, toggleCandidate } from '@/lib/rami/shortlist';
import styles from './experience.module.css';
import SuggestionStream from './suggestion-stream';
import { activeResult } from '@/lib/rami/update';

export default function Matches({ world, priorities, call, onSaveShortlist, selectedIdeas, onSelectIdea }: { world: World; priorities: WishSelection[]; call: (body: object, signal?: AbortSignal) => Promise<MatchResults>; onSaveShortlist: (brief: string) => void; selectedIdeas: string; onSelectIdea: (answer: string) => void }) {
  const [destination, setDestination] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<MatchResults | null>(null);
  const [hotelIds, setHotelIds] = useState<string[]>([]);
  const [experienceIds, setExperienceIds] = useState<string[]>([]);
  const activeSearch = useRef<AbortController | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => () => activeSearch.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now(); setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  function clearResults() { setResults(null); setHotelIds([]); setExperienceIds([]); }
  function select(kind: 'hotel' | 'experience', id: string) {
    if (!results) return;
    try {
      if (kind === 'hotel') setHotelIds(toggleCandidate(hotelIds, id, results.hotels.map(h => h.id), 5));
      else setExperienceIds(toggleCandidate(experienceIds, id, results.experiences.map(p => p.id), 6));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'The option could not be selected.'); }
  }
  function downloadShortlist() {
    if (!results || (!hotelIds.length && !experienceIds.length)) return;
    const url = URL.createObjectURL(new Blob([shortlistBrief(results, hotelIds, experienceIds, checkIn, checkOut)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'my-rami-shortlist.txt'; link.click(); URL.revokeObjectURL(url);
  }
  async function search(event: React.FormEvent) {
    event.preventDefault(); if (busy || activeSearch.current) return;
    const controller = new AbortController(); activeSearch.current = controller;
    setBusy(true); setError(''); clearResults();
    try { setResults(await activeResult(call({ action: 'matches', destination, checkIn, checkOut, world, priorities }, controller.signal), controller.signal)); }
    catch (e) { setError(e instanceof Error && e.name === 'AbortError' ? 'Stopped searching. Your trip wishes and selected suggestions are retained.' : e instanceof Error ? e.message : 'The search failed.'); }
    finally { if (activeSearch.current === controller) { activeSearch.current = null; setBusy(false); } }
  }
  return <section className={styles.matching} aria-label="Explore stays and experiences">
    <h3>Bring your trip closer</h3><p>Choose where and when to explore catalogue stays and supplier experiences.</p><p>Changing the destination, dates or wishes starts a fresh shortlist. Save or download your choices to keep a copy.</p>
    <form onSubmit={search}>
      <label className={styles.label}>Destination<input required maxLength={100} value={destination} onChange={e => { setDestination(e.target.value); clearResults(); }} disabled={busy} placeholder="City or destination name" /></label>
      <label className={styles.label}>Check-in<input required type="date" value={checkIn} onChange={e => { setCheckIn(e.target.value); clearResults(); }} disabled={busy} /></label>
      <label className={styles.label}>Check-out<input required type="date" value={checkOut} min={checkIn || undefined} onChange={e => { setCheckOut(e.target.value); clearResults(); }} disabled={busy} /></label>
      <button className={styles.primary} disabled={busy}>{busy ? 'Searching sources…' : 'Explore options'}</button>
    </form>
    {busy && <><p role="status">RaMi is checking sources for {destination} · {elapsed}s elapsed.</p><SuggestionStream context={[destination, ...world.requirements].join(' ')} selected={selectedIdeas} onSelect={onSelectIdea} /><button onClick={() => activeSearch.current?.abort()}>Stop searching</button></>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {results && <div aria-live="polite"><h4>Stays in {results.destination}</h4><p>Catalogue identities only. Your requested amenities, prices and room availability still need checking.</p>
      {results.hotelStatus === 'unavailable' && <p>The stay catalogue could not be reached. Try again later.</p>}
      {results.hotelStatus === 'ok' && !results.hotels.length && <p>No eligible catalogue properties were found for this destination.</p>}
      {results.hotels.map(h => <article key={h.id}><h4>{h.name}</h4><p>{h.area} · {h.city} · {h.starRating} stars</p><a href={`/hotel/${encodeURIComponent(h.id)}`} target="_blank" rel="noopener noreferrer">View property details</a><button onClick={() => select('hotel', h.id)} aria-pressed={hotelIds.includes(h.id)} aria-label={`${hotelIds.includes(h.id) ? 'Remove' : 'Shortlist'} ${h.name}`}>{hotelIds.includes(h.id) ? 'Remove from shortlist' : 'Shortlist stay'}</button></article>)}
      <h4>Experiences</h4><p>{results.experiencesMode === 'sandbox' ? 'Test supplier results — not live bookable offers.' : results.experiencesMode === 'production' ? 'Supplier search results. From prices are indicative; availability for your party has not been confirmed.' : 'The experience source is not connected.'}</p>
      {results.experiencesMode !== 'unavailable' && !results.experiences.length && <p>No experiences were returned. The source may be unavailable or have no results for these dates.</p>}
      {results.experiences.map(p => <article key={p.id}><h4>{p.title}</h4><p>{p.description}</p><p>From {p.currency} {p.fromPrice.toFixed(2)} · {results.experiencesMode === 'sandbox' ? 'test price' : 'supplier search price'}</p>{p.relatedWishes.length > 0 && <p>Related words in the description: {p.relatedWishes.join('; ')}. This does not confirm these wishes are met.</p>}<small>Source: Viator · checked {new Date(p.checkedAt).toLocaleString()}</small><button onClick={() => select('experience', p.id)} aria-pressed={experienceIds.includes(p.id)} aria-label={`${experienceIds.includes(p.id) ? 'Remove' : 'Shortlist'} ${p.title}`}>{experienceIds.includes(p.id) ? 'Remove from shortlist' : 'Shortlist experience'}</button></article>)}
      <section aria-label="Your shortlisted options" className={styles.shortlist}><h4>Your shortlist</h4><p>{hotelIds.length} stays · {experienceIds.length} experiences</p>
        {hotelIds.length + experienceIds.length === 0 ? <p>Choose the options you want to consider.</p> : <><ul>{results.hotels.filter(h => hotelIds.includes(h.id)).map(h => <li key={`hotel-${h.id}`}>{h.name} · stay · price and availability to confirm</li>)}{results.experiences.filter(p => experienceIds.includes(p.id)).map(p => <li key={`experience-${p.id}`}>{p.title} · experience · {results.experiencesMode === 'sandbox' ? 'test data' : 'availability to confirm'}</li>)}</ul><button onClick={() => onSaveShortlist(shortlistBrief(results, hotelIds, experienceIds, checkIn, checkOut))}>Save shortlist on this device</button><button onClick={downloadShortlist}>Download my shortlist</button><p>This is a planning shortlist. No reservation or payment has been made. A total trip price is not available.</p></>}
      </section>
      <h4>Still to confirm</h4><ul>{results.pendingWishes.map((s, i) => <li key={i}>{s.wish} · {s.priority} · needs confirmation</li>)}</ul>
    </div>}
  </section>;
}
