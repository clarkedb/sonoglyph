'use client';

import { useMemo, useState } from 'react';
import type { EnvelopeData, FeatureFrame, PeaksData, SpectrumData } from '@sonoglyph/core';
import { STREAM_ENVELOPE, STREAM_PEAKS, STREAM_SPECTRUM } from '@sonoglyph/core';
import { concat, DEFAULT_ENGINE_OPTIONS, silence, tones, TsDspEngine } from '@sonoglyph/dsp';
import { FeatureReadout, SpectrumView } from '@sonoglyph/react';
import { Readout, Slider } from '../components/controls';
import { FigureShell, ZoneLabel } from '../components/figure-shell';

/* Chapter 06 — the frame clock. A short scene (one DTMF '5' press, then
 * Morse 'S' as three 600 Hz dots) runs offline through the real TsDspEngine
 * with default options; every FeatureFrame it emits is kept, grouped by
 * stream. The slider scrubs the frame clock: an envelope map on top, the
 * scrubbed frame's spectrum and full feature readout below. */

const RATE = DEFAULT_ENGINE_OPTIONS.sampleRate; // 48 000
const WINDOW = DEFAULT_ENGINE_OPTIONS.windowSize; // 2048
const HOP_SEC = DEFAULT_ENGINE_OPTIONS.hopSize / RATE; // ~10.7 ms
const SPAN_SEC = WINDOW / RATE; // ~42.7 ms

const LEAD_SEC = (2 * WINDOW) / RATE; // ambience before any real signal
const PRESS_SEC = 0.18;
const SCENE_GAP_SEC = 0.12;
const DOT_SEC = 0.08; // Morse unit — dot and inter-dot gap alike
const TAIL_SEC = 0.15;
const MORSE_HZ = 600;
const DTMF_LOW_HZ = 770; // the '5' key: row 770 Hz × column 1336 Hz
const DTMF_HIGH_HZ = 1336;

const W = 480;
const H = 70;

interface Streams {
  spectrum: FeatureFrame<SpectrumData>[];
  peaks: FeatureFrame<PeaksData>[];
  envelope: FeatureFrame<EnvelopeData>[];
}

/** Build the scene buffer and run it through the real engine, collecting
 * every frame of every default stream. Fully deterministic — safe in SSR. */
function buildScene(): { streams: Streams; totalSec: number } {
  const press = tones(
    [
      { frequencyHz: DTMF_LOW_HZ, amplitude: 0.4 },
      { frequencyHz: DTMF_HIGH_HZ, amplitude: 0.4 },
    ],
    PRESS_SEC,
    RATE,
  );
  const dot = tones([{ frequencyHz: MORSE_HZ, amplitude: 0.5 }], DOT_SEC, RATE);
  const gap = silence(DOT_SEC, RATE);
  const buffer = concat(
    silence(LEAD_SEC, RATE),
    press,
    silence(SCENE_GAP_SEC, RATE),
    dot,
    gap,
    dot,
    gap,
    dot,
    silence(TAIL_SEC, RATE),
  );

  const engine = new TsDspEngine();
  const streams: Streams = { spectrum: [], peaks: [], envelope: [] };
  for (const frame of [...engine.push(buffer), ...engine.flush()]) {
    if (frame.stream === STREAM_SPECTRUM) {
      streams.spectrum.push(frame as FeatureFrame<SpectrumData>);
    } else if (frame.stream === STREAM_PEAKS) {
      streams.peaks.push(frame as FeatureFrame<PeaksData>);
    } else if (frame.stream === STREAM_ENVELOPE) {
      streams.envelope.push(frame as FeatureFrame<EnvelopeData>);
    }
  }
  return { streams, totalSec: buffer.length / RATE };
}

export function FeaturesFigure() {
  const { streams, totalSec } = useMemo(() => buildScene(), []);
  const frameCount = streams.spectrum.length;
  const [frameIndex, setFrameIndex] = useState(() =>
    // Start mid-press so the first thing you see is the '5' frequency pair.
    Math.min(frameCount - 1, Math.round((LEAD_SEC + PRESS_SEC / 2) / HOP_SEC)),
  );

  const spectrum = streams.spectrum[frameIndex];
  const peaks = streams.peaks[frameIndex];
  const envelope = streams.envelope[frameIndex];
  const time = spectrum?.time ?? 0;

  const xOf = (sec: number) => Math.min(W, (sec / totalSec) * W);

  const envelopeArea = useMemo(() => {
    const x = (sec: number) => Math.min(W, (sec / totalSec) * W);
    const maxRms = Math.max(1e-6, ...streams.envelope.map((f) => f.data.rms));
    const parts = [`M0 ${H}`];
    for (const f of streams.envelope) {
      const y = (H - 6 - (f.data.rms / maxRms) * (H - 14)).toFixed(1);
      parts.push(`L${x(f.time).toFixed(1)} ${y}`, `L${x(f.time + HOP_SEC).toFixed(1)} ${y}`);
    }
    parts.push(`L${W} ${H} Z`);
    return parts.join(' ');
  }, [streams, totalSec]);

  return (
    <FigureShell
      n={1}
      title="the frame clock"
      meta="engine: @sonoglyph/dsp TsDspEngine · 48 kHz · window 2048 / hop 512"
      caption={
        <>
          (1) the envelope stream’s rms, one step per frame — the scene’s map: a DTMF ‘5’ (
          {DTMF_LOW_HZ} + {DTMF_HIGH_HZ} Hz, 0.18 s), then Morse ‘S’ (three 80 ms dots of {MORSE_HZ}{' '}
          Hz) · (2)(3) every value shown is a real FeatureFrame from the real engine. Scrub across a
          tone edge and watch rms rise over a few frames while span and hop never move — a new frame
          every 10.7 ms, each describing 42.7 ms.
        </>
      }
    >
      <ZoneLabel n={1}>
        envelope map, one rms step per frame · (2) the scrubbed frame’s spectrum · (3) its feature
        readout
      </ZoneLabel>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-20 w-full"
        aria-label={`Amplitude envelope of the scene over ${totalSec.toFixed(2)} seconds: a DTMF press, then three Morse dots. A cursor marks the scrubbed frame at ${time.toFixed(3)} seconds.`}
      >
        <line x1="0" y1={H} x2={W} y2={H} stroke="var(--line)" />
        <path
          d={envelopeArea}
          fill="var(--phosphor-dim)"
          fillOpacity="0.18"
          stroke="var(--phosphor-dim)"
          strokeWidth="1"
        />
        {/* The scrubbed frame: its full 42.7 ms span, and a cursor at its start. */}
        <rect
          x={xOf(time)}
          y="0"
          width={Math.max(0, xOf(time + SPAN_SEC) - xOf(time))}
          height={H}
          fill="var(--phosphor)"
          fillOpacity="0.12"
        />
        <line
          x1={xOf(time)}
          y1="0"
          x2={xOf(time)}
          y2={H}
          stroke="var(--phosphor)"
          strokeWidth="1.2"
        />
        <text
          x={xOf(LEAD_SEC + PRESS_SEC / 2)}
          y="11"
          textAnchor="middle"
          fill="var(--ink-dim)"
          fontSize="8.5"
          fontFamily="var(--font-mono)"
        >
          {`'5' ${DTMF_LOW_HZ}+${DTMF_HIGH_HZ} Hz`}
        </text>
        <text
          x={xOf(LEAD_SEC + PRESS_SEC + SCENE_GAP_SEC + 2.5 * DOT_SEC)}
          y="11"
          textAnchor="middle"
          fill="var(--ink-dim)"
          fontSize="8.5"
          fontFamily="var(--font-mono)"
        >
          {`'S' ${MORSE_HZ} Hz · · ·`}
        </text>
      </svg>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <Slider
          label="frame"
          value={frameIndex}
          min={0}
          max={Math.max(0, frameCount - 1)}
          onChange={setFrameIndex}
          format={(i) => `t = ${(streams.spectrum[i]?.time ?? 0).toFixed(3)} s`}
        />
        <Readout label="hop (frame every)" value={`${(HOP_SEC * 1000).toFixed(1)} ms`} />
        <Readout label="span (frame describes)" value={`${(SPAN_SEC * 1000).toFixed(1)} ms`} />
        <Readout label="frame" value={`${frameIndex + 1} / ${frameCount}`} />
      </div>

      <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <div>
          <ZoneLabel n={2}>spectrum + peaks of this frame</ZoneLabel>
          <SpectrumView
            read={() =>
              spectrum
                ? { spectrum: spectrum.data, peaks: peaks?.data ?? null, sampleRate: RATE }
                : null
            }
            maxFreq={2000}
            className="mt-1 block h-[200px] w-full cursor-crosshair rounded-sm bg-canvas"
            ariaLabel="Frequency spectrum of the scrubbed analysis frame, with detected peaks marked."
          />
        </div>
        <div>
          <ZoneLabel n={3}>feature readout — what a plugin sees</ZoneLabel>
          <div className="mt-1 min-h-[200px] rounded-sm border border-line bg-canvas p-3">
            <FeatureReadout
              read={() => ({
                ...(spectrum && { spectrum }),
                ...(peaks && { peaks }),
                ...(envelope && { envelope }),
              })}
              emptyMessage="No frame at this position."
            />
          </div>
        </div>
      </div>

      <p aria-live="polite" className="mt-3 font-mono text-[11px] text-ink-dim">
        frame {frameIndex + 1}/{frameCount} · t = {time.toFixed(3)} s · rms{' '}
        {(envelope?.data.rms ?? 0).toFixed(4)} · same clock for every stream
      </p>
    </FigureShell>
  );
}
