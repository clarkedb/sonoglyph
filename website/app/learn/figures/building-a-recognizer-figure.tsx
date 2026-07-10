'use client';

import { useMemo, useState } from 'react';
import type { FeatureFrame, Glyph, PeaksData } from '@sonoglyph/core';
import { STREAM_PEAKS } from '@sonoglyph/core';
import {
  concat,
  DEFAULT_ENGINE_OPTIONS,
  Pipeline,
  silence,
  tones,
  TsDspEngine,
} from '@sonoglyph/dsp';
import type { DtmfKey, DtmfPayload } from '@sonoglyph/plugin-dtmf';
import {
  DtmfRecognizer,
  frequenciesFor,
  HIGH_GROUP,
  keyFor,
  LOW_GROUP,
} from '@sonoglyph/plugin-dtmf';
import { FigureShell, ZoneLabel } from '../components/figure-shell';
import { Btn, Segmented, Slider } from '../components/controls';
import { fadeInPlace, useAudioPlayback } from '../components/use-audio';

/* Chapter 07 — the recognizer's three stages made visible. One synthesized
 * press runs through the real pipeline; every peaks-stream frame is shown
 * with its per-frame classification, and the bracket marks the run that
 * became (or failed to become) a glyph. */

const SAMPLE_RATE = DEFAULT_ENGINE_OPTIONS.sampleRate;
const { windowSize } = DEFAULT_ENGINE_OPTIONS;
const LEAD_SEC = (2 * windowSize) / SAMPLE_RATE;
const TAIL_SEC = 0.1;
const AMPLITUDE = 0.4;
const TOLERANCE = 0.02; // mirrors DEFAULT_DTMF_OPTIONS.freqTolerance
const MIN_TONE_MS = 40; // mirrors DEFAULT_DTMF_OPTIONS.minToneMs

const KEYS: DtmfKey[] = ['1', '5', '9', 'D'];

/* Frame strip geometry. */
const SW = 480;
const SH = 96;
const STRIP_Y = 34;

interface StripFrame {
  time: number;
  symbol: string | null;
}

/** The article's restatement of the per-frame test: one low-group and one
 * high-group peak, each within ±2% of a nominal. The real classifier
 * (plugins/dtmf/src/dtmf.ts) adds band limits and a twist check. */
function classifyFrame(peaks: PeaksData, tolerance = TOLERANCE): string | null {
  const match = (group: readonly number[]) => {
    for (const peak of peaks.peaks) {
      for (const nominal of group) {
        if (Math.abs(peak.frequencyHz - nominal) <= nominal * tolerance) return nominal;
      }
    }
    return null;
  };
  const low = match(LOW_GROUP);
  const high = match(HIGH_GROUP);
  if (low === null || high === null) return null;
  return keyFor(low, high) ?? null;
}

function buildSignal(key: DtmfKey, toneMs: number, detunePct: number): Float32Array {
  const { lowHz, highHz } = frequenciesFor(key);
  const tone = fadeInPlace(
    tones(
      [
        { frequencyHz: lowHz * (1 + detunePct / 100), amplitude: AMPLITUDE },
        { frequencyHz: highHz, amplitude: AMPLITUDE },
      ],
      toneMs / 1000,
      SAMPLE_RATE,
    ),
    SAMPLE_RATE,
  );
  return concat(silence(LEAD_SEC, SAMPLE_RATE), tone, silence(TAIL_SEC, SAMPLE_RATE));
}

export function RecognizerFigure() {
  const [key, setKey] = useState<DtmfKey>('5');
  const [toneMs, setToneMs] = useState(90);
  const [detune, setDetune] = useState(0);
  const play = useAudioPlayback();

  const run = useMemo(() => {
    const signal = buildSignal(key, toneMs, detune);
    const pipeline = new Pipeline(new TsDspEngine());
    pipeline.addPlugin(new DtmfRecognizer());

    const frames: StripFrame[] = [];
    let glyph: Glyph<DtmfPayload> | null = null;
    pipeline.onFrame((frame) => {
      if (frame.stream !== STREAM_PEAKS) return;
      const peaksFrame = frame as FeatureFrame<PeaksData>;
      frames.push({ time: peaksFrame.time, symbol: classifyFrame(peaksFrame.data) });
    });
    pipeline.onGlyph((g) => (glyph = g as Glyph<DtmfPayload>));
    pipeline.push(signal);
    pipeline.flush();
    pipeline.dispose();

    let reason: string | null = null;
    if (!glyph) {
      reason =
        Math.abs(detune) > TOLERANCE * 100
          ? `low tone ${detune > 0 ? '+' : ''}${detune}% off nominal — outside the ±2% tolerance, so frames never classify`
          : toneMs < MIN_TONE_MS
            ? `tone held ${toneMs} ms — under the ${MIN_TONE_MS} ms debounce, so the run never qualifies`
            : 'the run was too short once window smearing ate its edges';
    }
    return { signal, frames, glyph: glyph as Glyph<DtmfPayload> | null, reason };
  }, [key, toneMs, detune]);

  const duration = run.signal.length / SAMPLE_RATE;
  const xOf = (t: number) => (t / duration) * SW;
  const toneStart = LEAD_SEC;
  const toneEnd = LEAD_SEC + toneMs / 1000;
  const cell = Math.min(11, (SW - 8) / Math.max(run.frames.length, 1));
  const glyphFrames = run.glyph
    ? run.frames.filter(
        (f) => f.time + 1e-6 >= run.glyph!.start && f.time < run.glyph!.start + run.glyph!.duration,
      )
    : [];

  return (
    <FigureShell
      n={1}
      title="watch it decide"
      meta="engine: @sonoglyph/dsp · recognizer: plugin-dtmf · 1 frame / 10.7 ms"
      caption={
        <>
          (1) where the tone actually is · (2) one square per peaks-stream frame — filled when that
          frame classified as the key, hollow when it saw nothing, red if it read a different symbol
          · (3) the bracket spans the run that became the glyph. Shrink the tone below 40 ms: frames
          still classify, but no glyph is emitted. Detune past ±2%: the frames themselves stop
          classifying.
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Segmented
          label="key"
          value={key}
          options={KEYS.map((k) => ({ value: k, label: k }))}
          onChange={setKey}
        />
        <Slider
          label="tone length"
          value={toneMs}
          min={15}
          max={160}
          step={5}
          onChange={setToneMs}
          format={(v) => `${v} ms`}
        />
        <Slider
          label="detune low tone"
          value={detune}
          min={-4}
          max={4}
          step={0.5}
          onChange={setDetune}
          format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
        />
        <Btn primary onClick={() => play(run.signal, SAMPLE_RATE)}>
          ♪ play
        </Btn>
      </div>

      <div className="mt-5">
        <ZoneLabel n={2}>frame strip · classify → segment → finalize</ZoneLabel>
        <svg
          viewBox={`0 0 ${SW} ${SH}`}
          className="mt-2 w-full rounded-sm bg-canvas"
          aria-label={
            run.glyph
              ? `${run.frames.length} analysis frames; a run of ${glyphFrames.length} matching frames became the glyph ${run.glyph.symbol} with confidence ${run.glyph.confidence.toFixed(2)}.`
              : `${run.frames.length} analysis frames; no glyph was emitted.`
          }
        >
          {/* (1) The tone's true extent. */}
          <rect
            x={xOf(toneStart)}
            y={10}
            width={Math.max(1.5, xOf(toneEnd) - xOf(toneStart))}
            height={5}
            fill="var(--phosphor-dim)"
            opacity="0.8"
          />
          <text
            x={xOf(toneStart)}
            y={8}
            fontSize="8"
            fontFamily="var(--font-mono)"
            fill="var(--ink-dim)"
          >
            (1) tone · {toneMs} ms
          </text>

          {/* (2) One square per frame. */}
          {run.frames.map((frame, i) => {
            const x = xOf(frame.time);
            const matched = frame.symbol === key;
            const wrong = frame.symbol !== null && !matched;
            return (
              <rect
                key={i}
                x={x}
                y={STRIP_Y}
                width={cell - 2}
                height={cell - 2}
                rx={1}
                fill={matched ? 'var(--phosphor)' : wrong ? 'var(--danger)' : 'none'}
                stroke={matched || wrong ? 'none' : 'var(--line)'}
                strokeWidth="1"
              />
            );
          })}

          {/* (3) The emitted glyph's span. */}
          {run.glyph && glyphFrames.length > 0 && (
            <g>
              <line
                x1={xOf(run.glyph.start)}
                y1={STRIP_Y + cell + 8}
                x2={xOf(run.glyph.start + run.glyph.duration)}
                y2={STRIP_Y + cell + 8}
                stroke="var(--phosphor)"
                strokeWidth="1.5"
              />
              <text
                x={xOf(run.glyph.start)}
                y={STRIP_Y + cell + 22}
                fontSize="8.5"
                fontFamily="var(--font-mono)"
                fill="var(--phosphor)"
              >
                (3) glyph · {run.glyph.duration.toFixed(3)} s
              </text>
            </g>
          )}

          <line x1="0" y1={SH - 14} x2={SW} y2={SH - 14} stroke="var(--line)" />
          {[0, 0.1, 0.2, 0.3].map(
            (t) =>
              t < duration && (
                <text
                  key={t}
                  x={xOf(t)}
                  y={SH - 4}
                  fontSize="8"
                  fontFamily="var(--font-mono)"
                  fill="var(--ink-dim)"
                >
                  {t.toFixed(1)} s
                </text>
              ),
          )}
        </svg>
      </div>

      <div aria-live="polite" className="mt-4 flex flex-wrap items-center gap-4">
        {run.glyph ? (
          <>
            <span className="glyph-glow flex size-12 items-center justify-center rounded-sm border border-phosphor-dim bg-phosphor/10 font-display text-2xl text-phosphor">
              {run.glyph.symbol}
            </span>
            <div className="font-mono text-[11px] leading-relaxed text-ink-dim">
              <p className="text-ink">
                dtmf:{run.glyph.symbol} · confidence {run.glyph.confidence.toFixed(2)}
              </p>
              <p>
                measured {run.glyph.payload?.lowHz.toFixed(1)} +{' '}
                {run.glyph.payload?.highHz.toFixed(1)} Hz
              </p>
              <p>
                nominal {run.glyph.payload?.nominalLowHz} + {run.glyph.payload?.nominalHighHz} Hz ·
                twist {run.glyph.payload?.twistDb.toFixed(1)} dB
              </p>
            </div>
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-sm border border-dashed border-line font-display text-2xl text-ink-dim">
              ?
            </span>
            <p className="max-w-[52ch] font-mono text-[11px] leading-relaxed text-ink-dim">
              no glyph — {run.reason}
            </p>
          </>
        )}
      </div>
    </FigureShell>
  );
}
