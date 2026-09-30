'use client';
import { useRef, useState } from 'react';
import type { World } from '@/lib/rami/world';
import styles from './experience.module.css';

export default function Experience() {
  const [access, setAccess] = useState('');
  const accessInput = useRef<HTMLInputElement>(null);
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
  const [editing, setEditing] = useState<number | null>(null);
  const [review, setReview] = useState(false);
  const [focusScene, setFocusScene] = useState(false);
  const answerInput = useRef<HTMLTextAreaElement>(null);
  async function call(body: object) {
    const response = await fetch('/api/rami/prototype', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, accessCode: accessInput.current?.value ?? access }) });
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
    if (!input.trim() || phase || (editing === null && answers.length >= 12)) return;
    setError(''); setPhase('Understanding your trip…');
    try {
      const nextAnswers = editing === null ? [...answers, input.trim()] : answers.map((a, i) => i === editing ? input.trim() : a);
      // Rebuild from answers when correcting an earlier wish, so removed details cannot linger.
      const result = await call({ action: 'describe', answers: nextAnswers, previous: editing === null ? world : null });
      const next = result.world as World;
      setAnswers(nextAnswers); setWorld(next); setInput(''); setEditing(null); setReview(false);
      if (auto && renders < 12 && (!image || (next.scene !== renderedScene && (next.changed || editing !== null)))) await render(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'The update failed.'); }
    finally { setPhase(''); }
  }
  async function retry() {
    if (!world || phase || renders >= 12) return;
    setError('');
    try { await render(world); } catch (e) { setError(e instanceof Error ? e.message : 'The scene failed.'); } finally { setPhase(''); }
  }
  function editAnswer(index: number) { const answer = answers[index]; if (answer === undefined) return; setEditing(index); setInput(answer); setReview(false); answerInput.current?.focus(); }
  function reset() { setAnswers([]); setWorld(null); setImage(''); setRenderedScene(''); setError(''); setSeconds(null); setRenders(0); setInput(''); setEditing(null); setReview(false); setFocusScene(false); }
  function downloadBrief() {
    if (!world) return;
    const brief = ['MY RAMI TRIP', '', 'Selected wishes', ...world.requirements.map(r => `• ${r}`), '', 'My answers', ...answers.map((a, i) => `${i + 1}. ${a}`), '', 'Imagined scenery', world.scene, '', 'Planning brief only. Prices, availability and bookable experiences have not been verified.'].join('\n');
    const url = URL.createObjectURL(new Blob([brief], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'my-rami-trip.txt'; link.click(); URL.revokeObjectURL(url);
  }
  return <main className={`${styles.root} ${focusScene ? styles.focusScene : ''}`}>
    {image && <img className={styles.scene} src={image} alt={renderedScene} />}
    <div className={styles.shade} />
    <header className={styles.header}><a href="/">Rate Manifest</a><span>RaMi · Private prototype</span><div className={styles.actions}>{image && <button onClick={() => setFocusScene(!focusScene)} aria-pressed={focusScene}>{focusScene ? 'Continue imagining' : 'Immerse in my scene'}</button>}<button onClick={reset} disabled={!!phase}>Start over</button></div></header>
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
        <p className={styles.intro}>A place. A feeling. The little details that make it yours. Tell RaMi in your own words.</p>
        <details className={styles.connection} open={!world}><summary>Private preview access</summary><label className={styles.label}>Prototype access code<input ref={accessInput} type="password" autoComplete="off" defaultValue="" onChange={e => setAccess(e.target.value)} disabled={!!phase} /></label></details>
        <nav className={styles.tabs} aria-label="Trip view"><button aria-pressed={!review} onClick={() => setReview(false)}>Imagine</button><button aria-pressed={review} onClick={() => setReview(true)} disabled={!world}>My trip{world ? ` · ${world.requirements.length} wishes` : ''}</button></nav>
        {review && world ? <section aria-label="Your trip brief" className={styles.brief}><h3>This is what matters to you</h3><ul>{world.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul><p>These are your selected wishes. RaMi will need verified stays, experiences and itemised prices before you can book or pay.</p><button onClick={downloadBrief}>Download my trip brief</button><button onClick={() => setReview(false)}>Keep customising</button></section> : <>
        <details className={styles.answers}><summary>Your story so far · {answers.length} answers</summary><div className={styles.history} aria-label="Your answers">{answers.map((a, i) => <div className={styles.answer} key={i}><p>{a}</p><button onClick={() => editAnswer(i)} disabled={!!phase} aria-label={`Edit answer ${i + 1}`}>Edit</button></div>)}</div></details>
        <p className={styles.question}>{editing !== null ? 'What would you like to change in this answer?' : world?.question || 'What would your ideal trip feel like?'}</p>
        <form onSubmit={submit}>
          <label htmlFor="rami-answer" className={styles.label}>Your answer</label>
          <textarea ref={answerInput} id="rami-answer" value={input} maxLength={1000} onChange={e => setInput(e.target.value)} disabled={!!phase || (editing === null && answers.length >= 12)} placeholder="Snowy mountains, a quiet lakeside cabin, a fireplace…" rows={3} />
          <button className={styles.primary} disabled={!!phase || !input.trim() || (editing === null && answers.length >= 12)}>{phase || (editing !== null ? 'Update my answer' : 'Tell RaMi')}</button>
          {editing !== null && <button type="button" onClick={() => { setEditing(null); setInput(''); }} disabled={!!phase}>Cancel edit</button>}
        </form>
        <label className={styles.toggle}><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} disabled={!!phase} />Update scenery after visual changes</label>
        {world && <button onClick={retry} disabled={!!phase || renders >= 12}>Update scene now</button>}
        </>}
        <p role="status" aria-live="polite">{phase || (seconds !== null ? `Last scene: ${seconds}s · ${renders} renders` : 'Live generation requires the prototype connection.')}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {answers.length >= 12 && <p>Prototype session complete. Start over to explore another trip.</p>}
        {renders >= 12 && <p>The preview’s scene allowance is used. You can still review your wishes and download your brief.</p>}
      </aside>
    </div>
  </main>;
}
