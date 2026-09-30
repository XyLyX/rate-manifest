import type { World } from './world';
import type { WishSelection } from './priorities';
import type { SavedShortlist } from './shortlist';

export function completePlanBrief(world: World, answers: string[], priorities: WishSelection[], pending: string, shortlist: SavedShortlist | null): string {
  const sections = ['MY RAMI PLAN', '', 'Accepted trip wishes', ...world.requirements.map(wish => `• ${wish} [${priorities.find(s => s.wish === wish)?.priority || 'priority not chosen'}]`), '',
    'Selected experiences awaiting submission', pending.trim() || 'None', 'These are pending requests, not accepted or booked experiences.', '',
    'My answers', ...answers.map((answer, index) => `${index + 1}. ${answer}`), '', 'Imagined scene', world.scene];
  if (shortlist) sections.push('', 'Saved shortlist copy — included by your choice', `Saved: ${shortlist.savedAt}`, 'This earlier copy may differ from the current wishes. Source data, prices and availability have not been refreshed.', shortlist.brief);
  sections.push('', 'Before booking', 'Confirm that the chosen stays and experiences meet your essential wishes.', 'Confirm dates, party-specific availability, itemised prices, taxes, inclusions and cancellation terms.', 'Planning document only. No reservation or payment has been made. No confirmed total trip price is available.');
  return sections.join('\n');
}
