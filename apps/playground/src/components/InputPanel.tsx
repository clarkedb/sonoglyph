import { useEffect, useRef, useState } from 'react';
import type { DtmfKey } from '@sonoglyph/plugin-dtmf';
import { ALL_KEYS } from '@sonoglyph/plugin-dtmf';
import { useController, useControllerTick } from '../hooks.js';
import { Panel } from './Panel.js';

const EXPLAINER =
  'Everything starts as samples: numbers measuring air pressure thousands of times per ' +
  'second. The pipeline does not care where they come from — a microphone, a synthesized ' +
  'keypad tone, or an uploaded WAV file all flow through the exact same code. Press a keypad ' +
  'key: you hear the two-tone chord (one row tone + one column tone) and watch it travel ' +
  'through every stage below until the digit appears in the glyph timeline. While the ' +
  'microphone is live, keypad tones are only played out loud — the mic picks them up ' +
  'acoustically, like a phone would.';

export function InputPanel() {
  const controller = useController();
  useControllerTick();
  const [error, setError] = useState<string | null>(null);
  const [toneFreqs, setToneFreqs] = useState('440');
  const [toneMs, setToneMs] = useState(500);
  const fileRef = useRef<HTMLInputElement>(null);

  const { mode } = controller.status;

  const run = (action: () => Promise<void>) => {
    setError(null);
    action().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  // Physical keyboard presses the on-screen keypad.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toUpperCase();
      if ((ALL_KEYS as string[]).includes(key)) {
        run(() => controller.playKey(key as DtmfKey));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  return (
    <Panel
      title="Input"
      explainer={EXPLAINER}
      controls={
        <>
          <button
            className={mode === 'mic' ? 'active' : ''}
            onClick={() =>
              run(() => (mode === 'mic' ? controller.stop() : controller.startMicrophone()))
            }
          >
            {mode === 'mic' ? '● Stop microphone' : 'Microphone'}
          </button>
          <button onClick={() => fileRef.current?.click()}>WAV file…</button>
          <input
            ref={fileRef}
            type="file"
            accept=".wav,audio/wav"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) run(() => controller.playWavFile(file));
              event.target.value = '';
            }}
          />
        </>
      }
    >
      <div className="input-grid">
        <div className="keypad">
          {ALL_KEYS.map((key) => (
            <button key={key} className="key" onClick={() => run(() => controller.playKey(key))}>
              {key}
            </button>
          ))}
        </div>
        <div className="tone-gen">
          <h3>Tone generator</h3>
          <label>
            Frequencies (Hz, comma-separated)
            <input
              value={toneFreqs}
              onChange={(event) => setToneFreqs(event.target.value)}
              placeholder="697, 1209"
            />
          </label>
          <label>
            Duration (ms)
            <input
              type="number"
              min={10}
              max={5000}
              value={toneMs}
              onChange={(event) => setToneMs(Number(event.target.value))}
            />
          </label>
          <button
            onClick={() => {
              const freqs = toneFreqs
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((f) => Number.isFinite(f) && f > 0);
              if (freqs.length > 0) run(() => controller.playTones(freqs, toneMs));
            }}
          >
            Play
          </button>
          <p className="hint">
            Try 697 + 1209 — the exact pair for key “1” — or detune one of them and watch the
            recognizer refuse it.
          </p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </Panel>
  );
}
