'use client';
import { useState } from 'react';
import type { World } from '@/lib/rami/world';
import type { WishSelection } from '@/lib/rami/priorities';
import type { SavedShortlist } from '@/lib/rami/shortlist';
import { completePlanBrief } from '@/lib/rami/plan';
import styles from './experience.module.css';

export default function PlanReview({ world, answers, priorities, pending, shortlist }: { world: World; answers: string[]; priorities: WishSelection[]; pending: string; shortlist: SavedShortlist | null }) {
  const [includeShortlist, setIncludeShortlist] = useState(false);
  function download() {
    const text = completePlanBrief(world, answers, priorities, pending, includeShortlist ? shortlist : null);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'my-rami-plan.txt'; link.click(); URL.revokeObjectURL(url);
  }
  return <section className={styles.planReview} aria-label="Complete plan review"><h3>Your plan, in one place</h3>
    <p>{world.requirements.length} accepted wishes · {priorities.filter(s => s.priority === 'essential').length} marked essential</p>
    <details><summary>Experiences still to add</summary>{pending.trim() ? <><p className={styles.pendingCopy}>{pending}</p><p>These selections are waiting for you to add them to the plan.</p></> : <p>No selected experiences are waiting to be added.</p>}</details>
    {shortlist && <label className={styles.toggle}><input type="checkbox" checked={includeShortlist} onChange={e => setIncludeShortlist(e.target.checked)} />Include my saved shortlist in the download</label>}
    {shortlist && includeShortlist && <p>Saved {new Date(shortlist.savedAt).toLocaleString()}. Check that it still belongs to this trip; its prices and availability have not been refreshed.</p>}
    <button onClick={download}>Download my complete plan</button>
    <details><summary>Before you book</summary><ul><li>Confirm that your essential wishes can be met.</li><li>Check availability for your dates and travelling party.</li><li>Review the itemised price, inclusions and cancellation terms.</li></ul><p>Your choices are a planning brief. Nothing has been reserved or paid for.</p></details>
  </section>;
}
