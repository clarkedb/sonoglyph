import { useState } from 'react';
import type { WindowName } from '@sonoglyph/core';
import { WINDOW_NAMES } from '@sonoglyph/dsp';
import { HIGH_GROUP, LOW_GROUP } from '@sonoglyph/plugin-dtmf';
import { Panel, SpectrumView } from '@sonoglyph/react';
import type { EngineChoice } from '../controller.ts';
import { useController, useControllerTick } from '../hooks.ts';

const EXPLAINER =
  'The FFT answers "which frequencies is this signal made of?" — amplitude (in dB) against ' +
  'frequency for the most recent analysis window. Detected peaks are marked, and the faint ' +
  'vertical guides are the eight DTMF frequencies. The window controls are the central DSP ' +
  'tradeoff made touchable: a bigger window resolves closer-together frequencies (narrower ' +
  'spikes) but smears events in time, so fast key presses blur together. A smaller window ' +
  'reacts faster but the spikes fatten until neighbors merge. The window function shapes the ' +
  'skirt around each spike — switch to rectangular and watch the leakage spread. Hover for ' +
  'exact values. The engine selector swaps which implementation runs the whole live pipeline — ' +
  'the readable TypeScript reference (the default) or the Rust core compiled to WebAssembly — ' +
  'and the spectrum, peaks, and decoded glyphs stay the same either way (that they agree is the ' +
  'whole point of keeping both). WASM needs the Rust build; without it the option stays disabled ' +
  'and the playground runs on TypeScript.';

const WINDOW_SIZES = [512, 1024, 2048, 4096, 8192];
const MAX_FREQ_CHOICES = [2500, 5000, 12000, 24000];
const GUIDES = [...LOW_GROUP, ...HIGH_GROUP];

const LABEL = 'flex items-center gap-1.5 text-xs text-muted';

export function SpectrumPanel() {
  const controller = useController();
  useControllerTick();
  const [maxFreq, setMaxFreq] = useState(2500);

  const { windowSize, window: windowName, sampleRate, engine, wasmState } = controller.status;

  return (
    <Panel
      title="Spectrum & peaks"
      explainer={EXPLAINER}
      className="col-span-full"
      controls={
        <>
          <label className={LABEL}>
            Engine
            <select
              value={engine}
              onChange={(event) => controller.setEngine(event.target.value as EngineChoice)}
            >
              <option value="ts">TypeScript</option>
              <option value="wasm" disabled={wasmState !== 'ready'}>
                {wasmState === 'ready'
                  ? 'WASM (Rust)'
                  : wasmState === 'init'
                    ? 'WASM (loading…)'
                    : 'WASM (not built)'}
              </option>
            </select>
          </label>
          <label className={LABEL}>
            Window
            <select
              value={windowSize}
              onChange={(event) =>
                controller.setEngineOptions({ windowSize: Number(event.target.value) })
              }
            >
              {WINDOW_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} ({((size / sampleRate) * 1000).toFixed(0)} ms,{' '}
                  {(sampleRate / size).toFixed(1)} Hz/bin)
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Function
            <select
              value={windowName}
              onChange={(event) =>
                controller.setEngineOptions({ window: event.target.value as WindowName })
              }
            >
              {WINDOW_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Max freq
            <select value={maxFreq} onChange={(event) => setMaxFreq(Number(event.target.value))}>
              {MAX_FREQ_CHOICES.map((hz) => (
                <option key={hz} value={hz}>
                  {hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      <SpectrumView
        read={() => ({
          spectrum: controller.latest.spectrum?.data ?? null,
          peaks: controller.latest.peaks?.data ?? null,
          sampleRate: controller.status.sampleRate,
        })}
        guides={GUIDES}
        maxFreq={maxFreq}
        ariaLabel="Live frequency spectrum: amplitude in decibels across frequency for the most recent analysis window, with detected peaks marked."
      />
    </Panel>
  );
}
