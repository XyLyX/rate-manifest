'use client';
import { useEffect, useState } from 'react';
import { pendingIdeas, tripIdeas } from '@/lib/rami/ideas';
import styles from './experience.module.css';

export default function SuggestionStream({ context, selected, onSelect }: { context: string; selected: string; onSelect: (answer: string) => void }) {
  const [ideas] = useState(() => tripIdeas(context).filter(idea => idea.id !== 'own'));
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const available = pendingIdeas(ideas, selected);
  const idea = available[index % Math.max(1, available.length)];
  useEffect(() => {
    if (paused || interacting || available.length < 2) return;
    const timer = window.setInterval(() => setIndex(current => current + 1), 10000);
    return () => window.clearInterval(timer);
  }, [paused, interacting, available.length, selected]);
  return <section className={styles.ideas} aria-label="RaMi's experience suggestions" onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocus={() => setInteracting(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteracting(false); }}>
    <h3>While we’re curating your plan…</h3>
    <p>I’d like to suggest a few experiences you could add to make this trip even more yours.</p>
    {idea ? <article className={styles.suggestion}><span className={styles.eyebrow}>RAMI SUGGESTS</span><h4>{idea.title}</h4><p>{idea.detail}</p><button className={styles.primary} disabled={selected.length + idea.answer.length + 1 > 1000} onClick={() => { onSelect(idea.answer); setIndex(0); }}>Select</button><button onClick={() => setIndex(current => current + 1)}>Not now</button></article> : <p>You’ve selected these ideas. I’ll keep them ready while your plan takes shape.</p>}
    {available.length > 1 && <><button aria-pressed={paused} onClick={() => setPaused(current => !current)}>{paused ? 'Resume suggestions' : 'Pause suggestions'}</button><p className={styles.suggestionNote}>I’ll show the next suggestion automatically. Your selected ideas stay ready below.</p></>}
  </section>;
}
