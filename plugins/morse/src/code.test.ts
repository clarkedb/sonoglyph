import { describe, expect, it } from 'vitest';
import { charFor, morseTiming, textToMorse } from './code.ts';

describe('textToMorse', () => {
  it('encodes letters, digits, and word breaks', () => {
    expect(textToMorse('SOS')).toBe('... --- ...');
    expect(textToMorse('HI U')).toBe('.... .. / ..-');
    expect(textToMorse('73')).toBe('--... ...--');
  });

  it('is case-insensitive and drops unencodable characters', () => {
    expect(textToMorse('Sos')).toBe(textToMorse('SOS'));
    expect(textToMorse('A~B')).toBe('.- -...');
  });

  it('round-trips through charFor', () => {
    for (const code of textToMorse('THE QUICK 5').split(/[/ ]+/)) {
      expect(charFor(code)).toBeDefined();
    }
  });
});

describe('morseTiming', () => {
  it('follows the 1/3 on and 1/3/7 off unit rules', () => {
    // "ET" = "." then "-": dot(1) gap(3) dash(3)
    expect(morseTiming('ET')).toEqual([
      { on: true, units: 1 },
      { on: false, units: 3 },
      { on: true, units: 3 },
    ]);
    // "E E" spans a 7-unit word gap.
    expect(morseTiming('E E')).toEqual([
      { on: true, units: 1 },
      { on: false, units: 7 },
      { on: true, units: 1 },
    ]);
    // "A" = ".-": intra-letter gap is 1 unit.
    expect(morseTiming('A')).toEqual([
      { on: true, units: 1 },
      { on: false, units: 1 },
      { on: true, units: 3 },
    ]);
  });

  it('drops words with no encodable characters, like textToMorse', () => {
    expect(morseTiming('A ~ B')).toEqual(morseTiming('A B'));
    expect(morseTiming('~ SOS')).toEqual(morseTiming('SOS'));
    expect(morseTiming('SOS ~')).toEqual(morseTiming('SOS'));
    expect(morseTiming('~~~')).toEqual([]);
  });

  it('total on-time matches the code', () => {
    const segments = morseTiming('SOS');
    const onUnits = segments.filter((s) => s.on).reduce((sum, s) => sum + s.units, 0);
    expect(onUnits).toBe(3 * 1 + 3 * 3 + 3 * 1);
  });
});
