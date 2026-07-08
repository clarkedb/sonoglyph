# Building a recognizer plugin

This is the walkthrough for adding a new signal system to Sonoglyph. It
assumes you have never read the framework's internals — if you finish it
and still had to, that's a bug; please file it.

We'll build a real plugin end to end: a **smoke-alarm chirp detector**
that emits a glyph every time it hears the ~3.2 kHz beep, survives fan
noise, and is tested against synthesized audio in a dozen lines. The
finished example lives in
[`packages/testing/src/walkthrough.test.ts`](../packages/testing/src/walkthrough.test.ts),
which CI runs — the code below is kept honest.

## The 60-second version

A plugin is a consumer of **feature streams** and a producer of
**glyphs**:

```
Samples → Features → Glyphs → Meaning
          ~~~~~~~~~~~~~~~~~~
          your plugin lives here
```

- The DSP engine turns raw audio into named streams of `FeatureFrame`s
  (`spectrum`, `peaks`, `envelope`, `samples`). You declare which ones
  you need; the pipeline delivers them to you.
- Your plugin turns frames into `Glyph`s: a symbol with a time span, a
  confidence, and whatever payload explains the decision.
- You implement one small interface — `RecognizerPlugin` from
  `@sonoglyph/core` — and `@sonoglyph/plugin-sdk` implements most of it
  for you: write a per-frame classifier, get debouncing and segmentation
  for free.

You need two packages, and a third for tests:

| Package                 | What it gives you                                          |
| ----------------------- | ---------------------------------------------------------- |
| `@sonoglyph/core`       | The contracts: `Glyph`, `FeatureFrame`, `RecognizerPlugin` |
| `@sonoglyph/plugin-sdk` | `defineRecognizer(...)` — segmentation for free            |
| `@sonoglyph/testing`    | Signal builders + a decode harness (dev dependency)        |

## Step 0 — pick your stream

Different signals need different features. Pick the stream that makes
your per-frame question easy:

| Stream     | One frame answers…                              | Pick it for…                                     |
| ---------- | ----------------------------------------------- | ------------------------------------------------ |
| `peaks`    | "what are the strongest frequencies right now?" | tones, chords, whistles — most frequency signals |
| `spectrum` | "what does the whole spectrum look like?"       | broadband shapes, custom peak logic              |
| `envelope` | "how loud is it right now?"                     | on/off keying, rhythm (this is Morse's stream)   |
| `samples`  | "give me the raw audio of this frame"           | owning your spectral strategy (Goertzel DTMF)    |

A chirp is a single strong tone, so `peaks` makes our classifier nearly
trivial: look at the loudest peak, check its frequency.

## Step 1 — scaffold

A plugin is a plain npm package. In this repo, drop it under `plugins/`
and pnpm picks it up (lint, typecheck, and vitest are glob-based):

```jsonc
// plugins/chirp/package.json
{
  "name": "@sonoglyph/plugin-chirp",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@sonoglyph/core": "workspace:*",
    "@sonoglyph/plugin-sdk": "workspace:*",
  },
  "devDependencies": {
    "@sonoglyph/testing": "workspace:*",
  },
}
```

(Outside this repo the shape is identical — replace `workspace:*` with
versions.)

## Step 2 — write the classifier

The only judgment you must write is instantaneous: _does this one frame
contain my signal?_ No timers, no state, no "how long has it been
sounding" — that all comes free in step 3.

```ts
// plugins/chirp/src/chirp.ts
import type { FeatureFrame, PeaksData, RecognizerPlugin } from '@sonoglyph/core';
import { STREAM_PEAKS } from '@sonoglyph/core';
import { defineRecognizer } from '@sonoglyph/plugin-sdk';

export interface ChirpOptions {
  /** The chirp's nominal frequency. Smoke alarms sit near 3.2 kHz. */
  frequencyHz: number;
  /** Accepted deviation from nominal, in Hz. */
  toleranceHz: number;
  /** A chirp must persist at least this long. */
  minChirpMs: number;
  /** Silence this long ends the chirp. */
  minGapMs: number;
}

export const DEFAULT_CHIRP_OPTIONS: ChirpOptions = {
  frequencyHz: 3200,
  toleranceHz: 150,
  minChirpMs: 60,
  minGapMs: 40,
};

/** Payload on every chirp glyph: why the recognizer said yes. */
export interface ChirpPayload {
  /** Mean detected frequency across the chirp, in Hz. */
  meanHz: number;
}

export function createChirpRecognizer(options: Partial<ChirpOptions> = {}): RecognizerPlugin {
  const opts = { ...DEFAULT_CHIRP_OPTIONS, ...options };
  return defineRecognizer<{ frequencyHz: number }, ChirpPayload>({
    metadata: {
      id: 'chirp',
      name: 'Smoke-alarm chirp',
      version: '0.1.0',
      requiredStreams: [STREAM_PEAKS],
    },
    segmentation: { minDurationMs: opts.minChirpMs, minGapMs: opts.minGapMs },

    // The per-frame judgment. Return a match, or null.
    classify: (frame: FeatureFrame) => {
      const { peaks } = frame.data as PeaksData; // sorted by magnitude
      const loudest = peaks[0];
      if (!loudest) return null;
      const offHz = Math.abs(loudest.frequencyHz - opts.frequencyHz);
      if (offHz > opts.toleranceHz) return null;
      return {
        symbol: '!',
        confidence: 1 - offHz / opts.toleranceHz,
        payload: { frequencyHz: loudest.frequencyHz },
      };
    },

    // Optional: turn the finished press into the emitted glyph. This is
    // where per-frame payloads aggregate into one story.
    finalize: (press) => ({
      payload: {
        meanHz:
          press.matches.reduce((sum, m) => sum + m.payload!.frequencyHz, 0) / press.matches.length,
      },
    }),
  });
}
```

## Step 3 — what the SDK just did for you

`defineRecognizer` wraps your classifier in the segmentation state
machine extracted from the DTMF reference plugin. Concretely:

- **Minimum duration.** A symbol must persist `minDurationMs` before a
  glyph is ever emitted — single noisy frames can't fire your plugin.
- **Gap debouncing.** Silence (or a _different_ symbol) must last
  `minGapMs` to end a press. A one-frame dropout, or noise flipping one
  frame to a neighboring symbol, is absorbed — and credited to the
  duration, since the signal was evidently sounding through it.
- **Span-corrected durations.** A tone appears in every analysis window
  that overlaps it, so raw frame counts overstate duration by up to one
  window; the machine subtracts half a window — the empirically honest
  correction — before checking `minDurationMs` and reporting
  `glyph.duration`, which therefore lands within about half a window of
  the true duration.
- **Emission on release.** The glyph is emitted when the press _ends_,
  so its duration covers the whole press.
- **`finalize` superpowers.** Override the symbol (Morse decides dot
  vs. dash by duration here), override the confidence, veto the press by
  returning `null`, or aggregate per-frame payloads.

If your recognition isn't a per-frame classification — you need custom
state, multiple glyph kinds, your own timing — see
[beyond `defineRecognizer`](#beyond-definerecognizer) below.

## Step 4 — test it like the microphone

`@sonoglyph/testing` runs your plugin through the _exact_ pipeline the
live microphone uses — same engine, same worklet-sized chunks — against
audio synthesized in code. (House rule: no audio fixtures, ever. A test
you can't read end to end is a fixture you can't regenerate.)

```ts
// plugins/chirp/src/chirp.test.ts
import { describe, expect, it } from 'vitest';
import type { Glyph } from '@sonoglyph/core';
import { decode, fanRumble, symbols, toneSequence } from '@sonoglyph/testing';
import { mix } from '@sonoglyph/dsp';
import type { ChirpPayload } from './chirp.js';
import { createChirpRecognizer } from './chirp.js';

describe('chirp recognizer', () => {
  const threeChirps = () =>
    toneSequence(
      Array.from({ length: 3 }, () => ({ tones: [{ frequencyHz: 3210, amplitude: 0.3 }] })),
      { toneMs: 100, gapMs: 150 },
    );

  it('hears three chirps and reports the measured frequency', () => {
    const glyphs = decode(threeChirps(), createChirpRecognizer()) as Glyph<ChirpPayload>[];
    expect(symbols(glyphs)).toBe('!!!');
    expect(glyphs[0]!.payload!.meanHz).toBeCloseTo(3210, -1);
  });

  it('still hears them over fan rumble', () => {
    const chirps = threeChirps();
    const noisy = mix(chirps, fanRumble(chirps.length / 48_000, 48_000, 0.2));
    expect(symbols(decode(noisy, createChirpRecognizer()))).toBe('!!!');
  });

  it('ignores tones at other frequencies', () => {
    const wrong = toneSequence([{ tones: [{ frequencyHz: 1000, amplitude: 0.3 }] }]);
    expect(decode(wrong, createChirpRecognizer())).toHaveLength(0);
  });
});
```

What the harness gives you:

- `decode(signal, plugin)` — signal in, glyphs out. It reads your
  `requiredStreams` and configures the engine accordingly; declaring
  them is all it takes. Pass `{ engineOptions }` to override — Morse,
  for example, tests with a smaller window because envelope edges smear
  by the window length.
- `toneSequence(steps, opts)` — tones/chords with per-step timing,
  lead-in, and a tail long enough for the last glyph's gap threshold.
- `pinkNoise` / `fanRumble` (and `whiteNoise` from `@sonoglyph/dsp`) —
  deterministic, seeded noise colors for realistic conditions.
- `symbols(glyphs)` — the recognized string, for one-line assertions.

Run it: `pnpm test`.

## Step 5 — run it live

Anywhere there's a pipeline, your plugin can join it:

```ts
import { Pipeline, TsDspEngine } from '@sonoglyph/dsp';

const pipeline = new Pipeline(new TsDspEngine({ sampleRate: 48_000 }));
pipeline.addPlugin(createChirpRecognizer());
pipeline.onGlyph((glyph) => console.log(glyph.symbol, glyph));
// …then push samples from any AudioSource (mic, WAV, generator).
```

In the playground, recognizers are wired in
`apps/playground/src/controller.ts` (`activeRecognizers()`); add yours
there and glyphs appear in the timeline with zero UI work. Note the
engine only computes streams it's asked for — the controller derives
the stream list from the active plugins' `requiredStreams`, so
declaring them (again) is all it takes.

## Beyond `defineRecognizer`

Three shipped plugins mark the escalation path — read them in order:

1. **`plugins/dtmf` — `DtmfRecognizer`** (the reference). A class of its
   own: `extends SegmentingRecognizer` and passes the spec to `super`,
   keeping a public `options` field and pure-function classifiers. Same
   machine, class ergonomics.
2. **`plugins/dtmf` — `GoertzelDtmfRecognizer`** (own your strategy). It
   consumes the raw `samples` stream and never looks at the engine's
   FFT. Its classifier is _stateful_ — a closure tracking per-frequency
   noise floors across frames — which is fine: `classify` is called
   once per frame in stream order. If you need state, close over it.
3. **`plugins/morse` — `MorseRecognizer`** (multiple glyph kinds).
   Implements `RecognizerPlugin` directly and _composes_ an inner
   `defineRecognizer` machine for dot/dash elements, then aggregates
   letters on top with its own gap logic. When one press-machine isn't
   the whole story, wrap it instead of fighting it.

## The Meaning layer

Glyphs are symbols; meaning is what sequences of them say. If your
signal system has structure beyond single symbols (letters → words,
digits → phone numbers), implement `Translator<M>` from core:

```ts
export interface Translator<M = unknown> {
  readonly id: string;
  push(glyph: Glyph): void; // consume the glyph stream
  onMeaning(cb: (meaning: M) => void): Unsubscribe;
  reset(): void;
}
```

Wire it with `pipeline.onGlyph((g) => translator.push(g))`. It should
ignore glyphs it doesn't understand (check `glyph.pluginId`).
`MorseTextTranslator` in `plugins/morse` is the reference: letter
glyphs in, running transcript out, word breaks read from gap payloads.

## Conventions checklist

Before you call it done:

- [ ] **Metadata**: stable unique `id`, semver `version`, honest
      `requiredStreams`, one-line `description`.
- [ ] **Options**: a single options interface, an exported
      `DEFAULT_*_OPTIONS`, constructor takes `Partial<Options>`. Every
      option's doc comment says what breaks when you change it.
- [ ] **Payloads**: a documented payload type on every glyph — the
      payload is your recognizer showing its work ("why did it decide
      that"), and UIs render it.
- [ ] **Confidence**: 0..1, meaningful — 1 should mean "textbook
      signal", not "I ran".
- [ ] **Determinism**: same bytes in, same glyphs out. No wall-clock
      time, no randomness without a seed.
- [ ] **Tests**: synthesized signals through `decode`, including at
      least one noise condition and one rejection case. No fixtures.
- [ ] **Domain boundaries**: frequency tables and symbol maps belong in
      your plugin, never in `dsp` — the engine must not know what
      signals mean.
