export function assertUpdateActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Stopped waiting', 'AbortError');
}
export async function activeResult<T>(result: Promise<T>, signal: AbortSignal): Promise<T> {
  assertUpdateActive(signal);
  const value = await result;
  assertUpdateActive(signal);
  return value;
}
export function updateError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'Stopped waiting. Your current trip details and unfinished answer are retained.';
  return error instanceof Error ? error.message : 'The update failed.';
}
