import type { FeatureFrame, PluginMetadata, SamplesData } from '@sonoglyph/core';
import { STREAM_SAMPLES } from '@sonoglyph/core';
import { goertzelPower } from '@sonoglyph/dsp';
import type { FrameMatch, Press } from '@sonoglyph/plugin-sdk';
import { SegmentingRecognizer } from '@sonoglyph/plugin-sdk';
import { HIGH_GROUP, keyFor, LOW_GROUP } from './frequencies.js';

export interface GoertzelDtmfOptions {
  /** A key must persist at least this long to count as a press. */
  minToneMs: number;
  /** Silence (or a different key) this long ends the current press. */
  minGapMs: number;
  /** Maximum level difference between the two tones, in dB ("twist"). */
  maxTwistDb: number;
  /**
   * Samples per low-group Goertzel block, taken from the end of each
   * frame. Block length is the probe's bandwidth knob (main lobe
   * ≈ 2·sampleRate/block) and its noise-averaging knob at once, so each
   * group gets its own: the low group is 73 Hz-spaced and sits next to
   * the room-rumble band, so it wants the long block (2048 ≈ 43 ms at
   * 48 kHz — 47 Hz lobe, 2× the noise averaging). Blocks are silently
   * capped at the frame length: run the engine at a smaller window and
   * you also shrink this decoder's selectivity and noise immunity.
   */
  lowBlockSize: number;
  /**
   * Samples per high-group block. The high group is 127–156 Hz-spaced so
   * it doesn't need the selectivity — and it can't have it: ±1.5% of
   * 1633 Hz (ITU-T Q.24's must-accept) is 24.5 Hz, past a 2048 block's
   * first null. 1024 (~21 ms, 94 Hz lobe) keeps must-accept in the lobe.
   */
  highBlockSize: number;
  /**
   * Each tone must rise above its own probe's tracked noise floor by this
   * power ratio. The floor (a running minimum per probe frequency) is
   * what "no tone here" reads under current conditions, so the threshold
   * adapts to colored noise per frequency instead of fighting it — how
   * this decoder keeps working when the noise is much louder than the
   * tone, as long as it is noise the room already had.
   */
  minSnr: number;
  /** Within each group, the best tone must beat the runner-up by this
   * power ratio. */
  dominance: number;
  /**
   * Off-nominal probes at ±this fraction of each matched frequency must
   * both read below the nominal probe. This is the frequency check: a
   * deviated tone reads hotter at the offset probe than at the nominal,
   * which is how Goertzel — with no interpolated peak frequency to
   * measure — still rejects ITU-T Q.24's ≥3.5% must-reject band.
   */
  edgeFraction: number;
  /**
   * High-pass cutoff applied to the block before probing, in Hz. Room
   * rumble (fans, HVAC) lives far below the DTMF band and would otherwise
   * eat the block's dynamic range — band-limiting is what real DTMF
   * front-ends do. Probe powers are compensated for this filter's
   * response, so twist still compares the tones as they entered the mic.
   */
  highPassHz: number;
  /** Absolute power floor added to the noise reference, so silence never
   * passes the SNR check. Full-scale sine ≈ 1.0 in these units. */
  noiseFloor: number;
}

export const DEFAULT_GOERTZEL_DTMF_OPTIONS: GoertzelDtmfOptions = {
  minToneMs: 40,
  minGapMs: 25,
  maxTwistDb: 12,
  lowBlockSize: 2048,
  highBlockSize: 1024,
  minSnr: 4,
  dominance: 2,
  edgeFraction: 0.04,
  highPassHz: 600,
  noiseFloor: 1e-7,
};

/**
 * Guard probes: in-band frequencies where no DTMF tone (even deviated by
 * ±4%) can land. They read the noise-and-interference floor the tones
 * must rise above — the Goertzel analog of the FFT recognizer's "no other
 * in-band peak may rival the pair" check. There is deliberately no guard
 * below the low group: that side is the room-rumble shoulder the
 * high-pass can only soften, and a guard sitting on it would read hotter
 * than the noise at the nominals and veto every press the noise still
 * permits. Deviated and off-frequency tones are the edge probes' job.
 */
const LOW_GUARDS = [1010] as const;
const HIGH_GUARDS = [1120, 1740] as const;

/** Payload attached to every Goertzel DTMF glyph. */
export interface GoertzelDtmfPayload {
  /** The nominal pair the detection matched. */
  nominalLowHz: number;
  /** The nominal pair the detection matched. */
  nominalHighHz: number;
  /** Mean level difference high−low across the press, in dB. */
  twistDb: number;
  /** Mean of the weaker tone's margin above the noise reference, in dB. */
  snrDb: number;
}

/** Per-frame detail carried on each match, aggregated in `finalize`. */
interface GoertzelMatchDetail {
  nominalLowHz: number;
  nominalHighHz: number;
  twistDb: number;
  snrDb: number;
}

/**
 * DTMF recognizer built on the Goertzel algorithm — the classic real-world
 * implementation, and Sonoglyph's demonstration that plugins own their
 * recognition strategy: it consumes the raw `samples` stream and never
 * looks at the FFT-derived `spectrum`/`peaks` the sibling recognizer uses.
 *
 * Per frame it probes a fixed set of frequencies — the 8 nominals, guard
 * frequencies for the noise floor, and ±edge offsets for frequency
 * discrimination — each probe a two-tap filter costing about one FFT bin.
 * Because detection compares matched-frequency measurements against a
 * noise reference instead of picking peaks out of a full spectrum, it
 * keeps decoding in the deep-noise regime past the FFT recognizer's
 * documented ~10:1 fan-noise limit. Segmentation (debouncing, minimum
 * duration, gaps) is the shared plugin-SDK machine.
 *
 * One consequence of learning the floors from the signal: the decoder
 * needs a moment of ambience before the first press. A stream that
 * opens mid-tone seeds the floor AT the tone, which then reads as "the
 * room sounds like this" and the opening press is missed (the floor
 * falls the instant the tone ends, so only the first press is at risk).
 * Real signals — and the playground's padded buffers — always lead with
 * ambience; synthetic ones should too.
 */
export class GoertzelDtmfRecognizer extends SegmentingRecognizer<
  GoertzelMatchDetail,
  GoertzelDtmfPayload
> {
  readonly options: GoertzelDtmfOptions;

  constructor(options: Partial<GoertzelDtmfOptions> = {}) {
    const opts = { ...DEFAULT_GOERTZEL_DTMF_OPTIONS, ...options };
    const metadata: PluginMetadata = {
      id: 'dtmf-goertzel',
      name: 'DTMF (Goertzel)',
      version: '0.1.0',
      requiredStreams: [STREAM_SAMPLES],
      description:
        'Recognizes the 16 telephone keypad tones by probing the 8 nominal frequencies directly',
    };
    super({
      metadata,
      segmentation: { minDurationMs: opts.minToneMs, minGapMs: opts.minGapMs },
      classify: makeClassifier(opts),
      finalize: aggregatePress,
    });
    this.options = opts;
  }
}

/**
 * Per-frame the tracked floor may rise by at most this factor, and it
 * falls instantly. At ~94 frames/s the decoder re-learns a changed room
 * in under a second, while an 80 ms key press (8 frames, ×1.5) cannot
 * masquerade as noise. The flip side: a key held for many seconds stops
 * matching once the floor catches up — a press is a change, not a state.
 */
const FLOOR_RISE = 1.05;

/**
 * Build the per-frame classifier. It carries state: a minimum-statistics
 * noise floor per probe frequency ("what does this probe read when no
 * tone is here?"), which is what lets detection adapt to the room —
 * colored noise reads hot at some probes and a fixed threshold would
 * either veto real presses there or hallucinate them elsewhere. The
 * floors survive reset() on purpose: the room does not change because
 * the audio source did, and a stale floor decays in under a second.
 */
function makeClassifier(
  opts: GoertzelDtmfOptions,
): (frame: FeatureFrame) => FrameMatch<GoertzelMatchDetail> | null {
  const floors = new Map<number, number>();
  const floorOf = (frequencyHz: number, power: number): number => {
    const prev = floors.get(frequencyHz);
    const floor = prev === undefined ? power : Math.min(power, prev * FLOOR_RISE);
    floors.set(frequencyHz, floor);
    return floor;
  };
  return (frame) => classifyBlock(frame, opts, floorOf);
}

/** Classify one samples frame as a DTMF pair, or null. */
function classifyBlock(
  frame: FeatureFrame,
  opts: GoertzelDtmfOptions,
  floorOf: (frequencyHz: number, power: number) => number,
): FrameMatch<GoertzelMatchDetail> | null {
  const { samples } = frame.data as SamplesData;
  const sampleRate = Math.round(samples.length / frame.span);

  // Compensating for the high-pass response makes probe powers comparable
  // to the signal as it entered the microphone, so twist and group
  // comparisons stay physical. (The compensation uses the analog filter
  // response, so an in-probe sine reads ~0.85 of its true power — a
  // uniform ~0.7 dB bias across the band that cancels in every ratio
  // and only slightly shades the reported snrDb.)
  const probeOn = (block: Float32Array) => (frequencyHz: number) =>
    goertzelPower(block, frequencyHz, sampleRate) / highPassPowerGain(frequencyHz, opts.highPassHz);
  const blockOf = (blockSize: number) =>
    highPass(
      samples.length > blockSize ? samples.subarray(samples.length - blockSize) : samples,
      opts.highPassHz,
      sampleRate,
    );

  const low = matchGroup(LOW_GROUP, LOW_GUARDS, probeOn(blockOf(opts.lowBlockSize)), floorOf, opts);
  const high = matchGroup(
    HIGH_GROUP,
    HIGH_GUARDS,
    probeOn(blockOf(opts.highBlockSize)),
    floorOf,
    opts,
  );
  if (!low || !high) return null;

  const twistDb = 10 * Math.log10(high.power / low.power);
  if (Math.abs(twistDb) > opts.maxTwistDb) return null;

  const key = keyFor(low.nominal, high.nominal);
  if (!key) return null;

  const snr = Math.min(low.snr, high.snr);
  return {
    symbol: key,
    // Confidence: the weaker tone's margin above the SNR threshold —
    // ~1 for a clean pair, falling toward 0 as noise closes in on it.
    confidence: clamp01(1 - opts.minSnr / snr),
    payload: {
      nominalLowHz: low.nominal,
      nominalHighHz: high.nominal,
      twistDb,
      snrDb: 10 * Math.log10(snr),
    },
  };
}

/** The group's strongest nominal, if it passes every per-group check. */
function matchGroup(
  group: readonly number[],
  guards: readonly number[],
  power: (frequencyHz: number) => number,
  floorOf: (frequencyHz: number, power: number) => number,
  opts: GoertzelDtmfOptions,
): { nominal: number; power: number; snr: number } | null {
  // Rank nominals by their rise ABOVE their own tracked floor, not by
  // raw power: colored noise keeps some probes chronically hot, and raw
  // ranking would hand marginal frames to the hottest probe instead of
  // the sounding tone. The floors update every frame, matched or not —
  // the bounded rise during a press is what eventually ends a held key,
  // and the instant fall re-arms the probe the moment the press stops.
  let best = -1;
  let bestPower = 0;
  let bestFloor = 0;
  let bestExcess = 0;
  let secondExcess = 0;
  for (let i = 0; i < group.length; i++) {
    const p = power(group[i]!);
    const floor = floorOf(group[i]!, p);
    const excess = p - floor;
    if (excess > bestExcess) {
      secondExcess = bestExcess;
      bestExcess = excess;
      bestPower = p;
      bestFloor = floor;
      best = i;
    } else if (excess > secondExcess) {
      secondExcess = excess;
    }
  }
  if (best === -1) return null;

  // No guard may rival the tone: in-band interference lights the guards
  // up exactly the way a press lights up a nominal.
  for (const g of guards) {
    if (power(g) > bestPower) return null;
  }

  const snr = bestPower / (bestFloor + opts.noiseFloor);
  if (snr < opts.minSnr) return null;
  if (secondExcess > 0 && bestExcess < opts.dominance * secondExcess) return null;

  // Frequency discrimination: a real press is centered on the nominal.
  const nominal = group[best]!;
  if (power(nominal * (1 + opts.edgeFraction)) >= bestPower) return null;
  if (power(nominal * (1 - opts.edgeFraction)) >= bestPower) return null;

  return { nominal, power: bestPower, snr };
}

/** Power gain of the two-stage high-pass at `frequencyHz` (see highPass). */
function highPassPowerGain(frequencyHz: number, cutoffHz: number): number {
  const stage = (frequencyHz * frequencyHz) / (frequencyHz * frequencyHz + cutoffHz * cutoffHz);
  return stage * stage;
}

/** Two cascaded one-pole high-pass stages (~12 dB/octave below cutoff). */
function highPass(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const out = new Float32Array(samples.length);
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let lp1 = 0;
  let lp2 = 0;
  for (let i = 0; i < samples.length; i++) {
    lp1 += alpha * (samples[i]! - lp1);
    const hp1 = samples[i]! - lp1;
    lp2 += alpha * (hp1 - lp2);
    out[i] = hp1 - lp2;
  }
  return out;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Average the per-frame detail into the glyph payload. */
function aggregatePress(press: Press<GoertzelMatchDetail>): { payload: GoertzelDtmfPayload } {
  let twistDb = 0;
  let snrDb = 0;
  for (const m of press.matches) {
    twistDb += m.payload!.twistDb;
    snrDb += m.payload!.snrDb;
  }
  const n = press.matches.length;
  const first = press.matches[0]!.payload!;
  return {
    payload: {
      nominalLowHz: first.nominalLowHz,
      nominalHighHz: first.nominalHighHz,
      twistDb: twistDb / n,
      snrDb: snrDb / n,
    },
  };
}
