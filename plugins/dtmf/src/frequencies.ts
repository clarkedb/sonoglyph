/**
 * DTMF frequency plan (ITU-T Q.23). Every key is one tone from the low
 * group (rows) plus one from the high group (columns):
 *
 *            1209  1336  1477  1633
 *      697    1     2     3     A
 *      770    4     5     6     B
 *      852    7     8     9     C
 *      941    *     0     #     D
 *
 * The groups are deliberately inharmonic — no low tone is a harmonic of
 * another, and no sum/difference lands on a valid tone — which is what
 * makes the pair detectable amid speech.
 */

export const LOW_GROUP = [697, 770, 852, 941] as const;
export const HIGH_GROUP = [1209, 1336, 1477, 1633] as const;

const KEYS = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['*', '0', '#', 'D'],
] as const;

export type DtmfKey = (typeof KEYS)[number][number];

/** All 16 keys in keypad order. */
export const ALL_KEYS: DtmfKey[] = KEYS.flat();

/** Look up the key for a low/high nominal frequency pair. */
export function keyFor(lowHz: number, highHz: number): DtmfKey | undefined {
  const row = LOW_GROUP.indexOf(lowHz as (typeof LOW_GROUP)[number]);
  const col = HIGH_GROUP.indexOf(highHz as (typeof HIGH_GROUP)[number]);
  if (row === -1 || col === -1) return undefined;
  return KEYS[row]![col]!;
}

/** The nominal frequency pair for a key. */
export function frequenciesFor(key: DtmfKey): { lowHz: number; highHz: number } {
  for (let row = 0; row < KEYS.length; row++) {
    const col = (KEYS[row]! as readonly string[]).indexOf(key);
    if (col !== -1) return { lowHz: LOW_GROUP[row]!, highHz: HIGH_GROUP[col]! };
  }
  throw new Error(`Not a DTMF key: ${key}`);
}
