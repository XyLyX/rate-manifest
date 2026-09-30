'use client';
import { useState } from 'react';
import type { World } from '@/lib/rami/world';
import styles from './experience.module.css';

export default function Experience() {
  const [access, setAccess] = useState('');
  const [input, setInput] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [world, setWorld] = useState<World | null>(null);
  const [image, setImage] = useState('');
  const [renderedScene, setRenderedScene] = useState('');
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState<number | null>(null);
  const [renders, setRenders] = useState(0);
  const [auto, setAuto] = useState(true);
  async function call(body: object) {
    const response = await fetch('/api/rami/prototype', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RaMi-Access': access }, body: JSON.stringify(body) });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); }
    catch {
      throw new Error(`The preview service returned an unexpected response (HTTP ${response.status}). ${response.status === 401 || response.status === 403 ? 'Sign in to the protected Netlify preview, then reload.' : 'The preview connection is not ready. Please retry after its deployment is updated.'}`);
    }
    if (!response.ok) throw new Error(result.error || 'The update failed.');
    return result;
  }
  async function render(next: World) {
    setPhase('Building your scene…');
    const result = await call({ action: 'render', world: next, image: image || undefined });
    // Preload before replacing the visible scene; a failed image keeps the old scene.
    await new Promise<void>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => reject(new Error('The scene image could not load.')); img.src = result.image; });
    setImage(result.image); setRenderedScene(next.scene); setSeconds(Math.round(result.elapsedMs / 1000)); setRenders(n => n + 1);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || phase || answers.length >= 12) return;
    setError(''); setPhase('Understanding your trip…');
    try {
      const nextAnswers = [...answers, input.trim()];
      const result = await call({ action: 'describe', answers: nextAnswers, previous: world });
      const next = result.world as World;
      setAnswers(nextAnswers); setWorld(next); setInput('');
      if (auto && renders < 12 && (!image || next.changed)) await render(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'The update failed.'); }
    finally { setPhase(''); }
  }
  async function retry() {
    if (!world || phase) return;
    setError('');
    try { await render(world); } catch (e) { setError(e instanceof Error ? e.message : 'The scene failed.'); } finally { setPhase(''); }
  }
  function reset() { setAnswers([]); setWorld(null); setImage(''); setRenderedScene(''); setError(''); setSeconds(null); setRenders(0); setInput(''); }
  return <main className={styles.root}>
    {image && <img className={styles.scene} src={image} alt={renderedScene} />}
    <div className={styles.shade} />
    <header className={styles.header}><a href="/">Rate Manifest</a><span>RaMi · Private prototype</span><button onClick={reset} disabled={!!phase}>Start over</button></header>
    <div className={styles.layout}>
      <section className={styles.world} aria-label="Your imagined trip">
        <span className={styles.eyebrow}>YOUR EXPERIENCE, TAKING SHAPE</span>
        <h1>{world ? 'Keep making it yours.' : 'Where does your mind take you?'}</h1>
        {!world && <p>Describe a place, a feeling, or a trip you have been imagining. There are no fixed themes.</p>}
        {world && <p className={styles.description}>{world.scene}</p>}
        <div className={styles.caption}>{image ? 'Imagined experience · not a confirmed property or booking' : 'Your personalised scenery will appear here after your first answer.'}</div>
        {image && world?.scene !== renderedScene && <p role="status">The visible scene is from your previous answer. Your new trip details are saved.</p>}
      </section>
      <aside className={styles.panel}>
        <h2>Imagine it with RaMi</h2>
        <label className={styles.label}>Prototype access code<input type="password" autoComplete="off" value={access} onChange={e => setAccess(e.target.value)} disabled={!!phase} /></label>
        <div className={styles.history} aria-label="Your answers">{answers.map((a, i) => <p key={i}>{a}</p>)}</div>
        <p className={styles.question}>{world?.question || 'What would your ideal trip feel like?'}</p>
        <form onSubmit={submit}>
          <label htmlFor="rami-answer" className={styles.label}>Your answer</label>
          <textarea id="rami-answer" value={input} maxLength={1000} onChange={e => setInput(e.target.value)} disabled={!!phase || answers.length >= 12} placeholder="Snowy mountains, a quiet lakeside cabin, a fireplace…" rows={3} />
          <button className={styles.primary} disabled={!!phase || !input.trim() || !access || answers.length >= 12}>{phase || 'Tell RaMi'}</button>
        </form>
        <label className={styles.toggle}><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} disabled={!!phase} />Update scenery after visual changes</label>
        {world && <button onClick={retry} disabled={!!phase || !access || renders >= 12}>Update scene now</button>}
        <p role="status" aria-live="polite">{phase || (seconds !== null ? `Last scene: ${seconds}s · ${renders} renders` : 'Live generation requires the prototype connection.')}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {answers.length >= 12 && <p>Prototype session complete. Start over to explore another trip.</p>}
        {world && <details open><summary>Your trip wishes</summary><ul>{world.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul><p>Matching these wishes to verified stays comes next. This prototype does not check prices or availability.</p></details>}
      </aside>
    </div>
  </main>;
}
