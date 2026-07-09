import { describe, expect, it } from 'vitest';
import { ALL_KEYS, frequenciesFor, HIGH_GROUP, keyFor, LOW_GROUP } from './frequencies.ts';

describe('DTMF frequency plan', () => {
  it('has 16 keys', () => {
    expect(ALL_KEYS).toHaveLength(16);
    expect(new Set(ALL_KEYS).size).toBe(16);
  });

  it('keyFor and frequenciesFor round-trip for every key', () => {
    for (const key of ALL_KEYS) {
      const { lowHz, highHz } = frequenciesFor(key);
      expect(LOW_GROUP).toContain(lowHz);
      expect(HIGH_GROUP).toContain(highHz);
      expect(keyFor(lowHz, highHz)).toBe(key);
    }
  });

  it('spot-checks the classic pairs', () => {
    expect(keyFor(697, 1209)).toBe('1');
    expect(keyFor(770, 1336)).toBe('5');
    expect(keyFor(941, 1209)).toBe('*');
    expect(keyFor(941, 1477)).toBe('#');
    expect(keyFor(941, 1336)).toBe('0');
    expect(keyFor(697, 1633)).toBe('A');
  });

  it('rejects non-DTMF pairs', () => {
    expect(keyFor(700, 1209)).toBeUndefined();
    expect(keyFor(697, 697)).toBeUndefined();
  });
});
