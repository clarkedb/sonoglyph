import type { FeatureFrame, Glyph, SpectrumData } from '@sonoglyph/core';
import { STREAM_SPECTRUM } from '@sonoglyph/core';
import {
  concat,
  DEFAULT_ENGINE_OPTIONS,
  Pipeline,
  silence,
  tones,
  TsDspEngine,
} from '@sonoglyph/dsp';
import type { DtmfKey, DtmfPayload } from '@sonoglyph/plugin-dtmf';
import { DtmfRecognizer, frequenciesFor } from '@sonoglyph/plugin-dtmf';

/** Everything the instrument shows for one key press, produced by the real
 * pipeline: the audible tone, the hottest spectrum frame, and the glyph. */
export interface KeyDecode {
  /** The dual-tone signal (faded), for playback and the scope trace. */
  tone: Float32Array;
  sampleRate: number;
  /** FFT magnitudes of the loudest analysis frame. */
  spectrum: Float32Array;
  /** Frequency width of one spectrum bin, in Hz. */
  binHz: number;
  glyph: Glyph<DtmfPayload> | null;
}

const TONE_SEC = 0.18;
const AMPLITUDE = 0.4;

/**
 * Synthesize one DTMF press and run it through the exact pipeline the
 * playground uses — TsDspEngine → DtmfRecognizer — synchronously. A fresh
 * pipeline per press keeps every decode independent and deterministic.
 */
export function decodeKey(key: DtmfKey): KeyDecode {
  const sampleRate = DEFAULT_ENGINE_OPTIONS.sampleRate;
  const { lowHz, highHz } = frequenciesFor(key);
  const tone = applyFade(
    tones(
      [
        { frequencyHz: lowHz, amplitude: AMPLITUDE },
        { frequencyHz: highHz, amplitude: AMPLITUDE },
      ],
      TONE_SEC,
      sampleRate,
    ),
    sampleRate,
  );
  // Lead with silence (recognizers hear ambience before any real signal)
  // and trail a short gap; flush() closes the press either way.
  const lead = (2 * DEFAULT_ENGINE_OPTIONS.windowSize) / sampleRate;
  const signal = concat(silence(lead, sampleRate), tone, silence(0.05, sampleRate));

  const pipeline = new Pipeline(new TsDspEngine());
  pipeline.addPlugin(new DtmfRecognizer());

  let glyph: Glyph<DtmfPayload> | null = null;
  let spectrum: Float32Array = new Float32Array(0);
  let binHz = sampleRate / DEFAULT_ENGINE_OPTIONS.windowSize;
  let hottest = -1;
  pipeline.onGlyph((g) => {
    glyph = g as Glyph<DtmfPayload>;
  });
  pipeline.onFrame((frame) => {
    if (frame.stream !== STREAM_SPECTRUM) return;
    const { magnitudes, binHz: frameBinHz } = (frame as FeatureFrame<SpectrumData>).data;
    let energy = 0;
    for (let i = 0; i < magnitudes.length; i++) energy += magnitudes[i]!;
    if (energy > hottest) {
      hottest = energy;
      spectrum = magnitudes;
      binHz = frameBinHz;
    }
  });
  pipeline.push(signal);
  pipeline.flush();
  pipeline.dispose();

  return { tone, sampleRate, spectrum, binHz, glyph };
}

/** 2 ms raised-cosine fade at both ends to avoid audible clicks. */
function applyFade(samples: Float32Array, sampleRate: number): Float32Array {
  const fade = Math.min(Math.floor(sampleRate * 0.002), Math.floor(samples.length / 2));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    samples[i]! *= g;
    samples[samples.length - 1 - i]! *= g;
  }
  return samples;
}
