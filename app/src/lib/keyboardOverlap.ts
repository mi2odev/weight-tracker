/**
 * How much of a container the keyboard still covers, once whatever room the
 * system made by shrinking the container is taken off.
 *
 * Pure, so the three phone behaviours are tested on Node: the system made no
 * room (iOS, some Android set-ups), all of it (Android resize), or part.
 */
export function keyboardOverlap(keyboardHeight: number, fullHeight: number, currentHeight: number): number {
  if (keyboardHeight <= 0) return 0;
  const madeRoom = fullHeight > 0 ? Math.max(0, fullHeight - currentHeight) : 0;
  return Math.max(0, Math.round(keyboardHeight - madeRoom));
}
