'use client';

import type { EnvelopeData, FeatureFrame, PeaksData, SpectrumData } from '@sonoglyph/core';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useAnimationFrame } from './hooks.ts';

/** The latest frame of each stream, as a recognizer plugin would see them.
 * Matches the shape a controller exposes; any field may be absent. */
export interface FeatureInput {
  spectrum?: FeatureFrame<SpectrumData>;
  peaks?: FeatureFrame<PeaksData>;
  envelope?: FeatureFrame<EnvelopeData>;
}

interface Snapshot {
  time: string;
  envelope: string;
  peaks: string[];
  spectrum: string;
}

/**
 * Human-readable live feature frames — the named streams the DSP engine
 * produces. Samples `read()` on a light interval (text doesn't need 60 Hz)
 * and renders the newest values.
 */
export function FeatureReadout({
  read,
  emptyMessage,
  intervalMs = 100,
}: {
  read: () => FeatureInput | null;
  emptyMessage: ReactNode;
  intervalMs?: number;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const lastUpdate = useRef(0);

  useAnimationFrame(() => {
    const now = performance.now();
    if (now - lastUpdate.current < intervalMs) return;
    lastUpdate.current = now;

    const latest = read();
    if (!latest) return;
    const { spectrum, peaks, envelope } = latest;
    if (!spectrum && !peaks && !envelope) return;

    setSnapshot({
      time: spectrum ? `${spectrum.time.toFixed(2)} s` : '—',
      envelope: envelope
        ? `rms ${envelope.data.rms.toFixed(4)} (${(20 * Math.log10(envelope.data.rms + 1e-9)).toFixed(1)} dBFS) · peak ${envelope.data.peak.toFixed(4)}`
        : '—',
      peaks:
        peaks && peaks.data.peaks.length > 0
          ? peaks.data.peaks
              .slice(0, 6)
              .map(
                (p) =>
                  `${p.frequencyHz.toFixed(1)} Hz  mag ${p.magnitude.toFixed(4)}  (bin ${p.bin})`,
              )
          : ['(no peaks above threshold)'],
      spectrum: spectrum
        ? `${spectrum.data.magnitudes.length} bins · ${spectrum.data.binHz.toFixed(2)} Hz/bin · ${spectrum.data.window} window · v${spectrum.version}`
        : '—',
    });
  });

  if (!snapshot) {
    return <p className="text-[12.5px] leading-normal text-faint">{emptyMessage}</p>;
  }

  return (
    <dl className="features grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 font-mono text-[12.5px]">
      <dt className="text-muted">stream time</dt>
      <dd className="tabular-nums">{snapshot.time}</dd>
      <dt className="text-muted">envelope</dt>
      <dd className="tabular-nums">{snapshot.envelope}</dd>
      <dt className="text-muted">peaks</dt>
      <dd className="tabular-nums">
        {snapshot.peaks.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </dd>
      <dt className="text-muted">spectrum</dt>
      <dd className="tabular-nums">{snapshot.spectrum}</dd>
    </dl>
  );
}
