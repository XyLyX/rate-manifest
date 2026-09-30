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
  return `Create an immersive, photorealistic landscape travel concept. No text, logos, interface, identifiable people or property brands. Preserve composition and unchanged features when editing; remove features the traveller replaced. Show only requested amenities, never infer luxury from budget. This is imagined scenery, not evidence of an actual property. Traveller scene: ${scene}`;
}
