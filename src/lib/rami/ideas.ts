export type TripIdea = { id: string; title: string; detail: string; answer: string };

// Optional planning prompts, not properties, offers, or a scene-theme selector.
export function tripIdeas(context: string): TripIdea[] {
  const text = context.toLowerCase();
  const ideas: TripIdea[] = [];
  const add = (id: string, title: string, detail: string, answer: string) => ideas.push({ id, title, detail, answer });
  if (/beach|coast|ocean|island|sea\b/.test(text) && !/sunset/.test(text)) add('coast-moment', 'A sunset by the water', 'A quiet moment at the end of the day.', 'I would like a quiet sunset experience by the water.');
  if (/mountain|hill|forest|jungle|tropical|lake/.test(text) && !/nature walk|guided walk/.test(text)) add('nature', 'Explore at your pace', 'Consider a nature walk suited to your comfort level.', 'I would like a nature walk, with the pace and difficulty suited to us.');
  if (/snow|winter|ski/.test(text) && !/fireplace|fireside/.test(text)) add('warm-evening', 'A warm evening indoors', 'How would you like to unwind after a cold day?', 'I would like a cosy indoor place to unwind after being out in the cold.');
  if (/desert|remote|night sky/.test(text) && !/stargaz/.test(text)) add('sky', 'A night under the stars', 'Explore whether a guided stargazing experience would suit you.', 'I would like to explore a guided stargazing experience if suitable for the destination.');
  if (!/food experience|local food|dietary|cuisine/.test(text)) add('food', 'Taste the place', 'Explore local food, with your dietary preferences in mind.', 'I would like a local food experience, with options that suit our dietary preferences.');
  if (!/local guide|cultural|culture/.test(text)) add('culture', 'Discover its stories', 'A local guide or cultural experience could add another dimension.', 'I would like to explore a local guide or cultural experience.');
  if (!/rest day|unplanned|slow morning/.test(text)) add('slow', 'Leave room to slow down', 'Keep some time free rather than filling every day.', 'I would like some unplanned time and slow mornings during the trip.');
  if (!/transfer|airport pickup/.test(text)) add('arrival', 'Make arrival easy', 'Think about how you want to get from your arrival point to your stay.', 'I would like help planning a comfortable transfer to the stay.');
  add('own', 'Something only you would think of', 'A celebration, a hobby, or a small detail that would make this trip yours.', 'Another thing I would love to include is ');
  return ideas;
}

export function appendIdea(draft: string, idea: string): string {
  if (draft.includes(idea.trim())) return draft;
  return [draft.trim(), idea.trim()].filter(Boolean).join('\n').slice(0, 1000);
}
