export type World = { scene: string; question: string; requirements: string[]; changed: boolean };
export function parseWorld(value: unknown): World {
  if (!value || typeof value !== 'object') throw new Error('Invalid scene response');
  const w = value as Record<string, unknown>;
  if (typeof w.scene !== 'string' || !w.scene.trim() || w.scene.length > 2400 ||
      typeof w.question !== 'string' || w.question.length > 500 ||
      typeof w.changed !== 'boolean' || !Array.isArray(w.requirements) ||
      w.requirements.length > 20 || w.requirements.some(x => typeof x !== 'string' || x.length > 240)) {
    throw new Error('Invalid scene response');
  }
  return w as World;
}
export function scenePrompt(scene: string) {
  return `Create an immersive, photorealistic landscape travel concept. Default to a wide scenic establishing view with depth, an open horizon and expansive surrounding scenery. The landscape is the main subject: mountains, snowfields, sea, coastline or other requested surroundings should occupy most of the frame. Any lodge, villa or hotel is a small supporting element in the middle distance, occupying roughly 10–20% of the frame, never blocking the view. Convey seclusion and coziness through atmosphere, warm light and setting, rather than a close-up building. Only use a close-up property or interior view when the traveller explicitly requests that framing. No text, logos, interface, identifiable people or property brands. When editing, retain unchanged features and their visual identity, but widen an existing building-dominated composition to restore the scenic view; remove features the traveller replaced. Show only requested amenities, never infer luxury from budget. This is imagined scenery, not evidence of an actual property. Traveller scene: ${scene}`;
}
