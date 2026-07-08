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

const LABEL = 'flex flex-col gap-1 text-xs text-muted';

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
            className={mode === 'mic' ? 'border-accent bg-accent-dim' : ''}
            disabled={mode === 'starting'}
            onClick={() =>
              run(() => (mode === 'mic' ? controller.stop() : controller.startMicrophone()))
            }
          >
            {mode === 'mic'
              ? '● Stop microphone'
              : mode === 'starting'
                ? 'Starting…'
                : 'Microphone'}
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
      <div className="grid grid-cols-[auto_1fr] gap-4.5">
        <div className="grid grid-cols-4 content-start gap-1.5">
          {ALL_KEYS.map((key) => (
            <button
              key={key}
              className="key h-12 w-12 text-lg font-semibold active:bg-accent-dim"
              onClick={() => run(() => controller.playKey(key))}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="tone-gen flex flex-col items-start gap-2">
          <h3 className="text-[13px] font-bold text-heading">Tone generator</h3>
          <label className={LABEL}>
            Frequencies (Hz, comma-separated)
            <input
              value={toneFreqs}
              onChange={(event) => setToneFreqs(event.target.value)}
              placeholder="697, 1209"
            />
          </label>
          <label className={LABEL}>
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
          <p className="text-[12.5px] leading-normal text-faint">
            Try 697 + 1209 — the exact pair for key “1” — or detune one of them and watch the
            recognizer refuse it.
          </p>
        </div>
      </div>
      <details className="phone-howto mt-2.5 rounded-md border border-dashed border-edge px-2.5 py-2 text-[12.5px] text-soft">
        <summary className="cursor-pointer text-[#9fb0c7]">Use a real phone as the input</summary>
        <p className="mt-1.5 leading-normal">
          Start the microphone above, then open your smartphone’s Phone app and bring up its keypad
          — no call needed. Turn the media volume up and take the phone off silent, hold it near
          this device’s microphone, and tap digits: each tap plays the same two-tone pair this
          keypad synthesizes.
        </p>
        <ul className="mt-1.5 list-disc pl-[18px] leading-normal">
          <li>
            <strong className="font-semibold text-[#b8c4d6]">iPhone:</strong> keypad taps play tones
            out of the box; if you hear nothing, flip the ring/silent switch to ring.
          </li>
          <li>
            <strong className="font-semibold text-[#b8c4d6]">Android:</strong> if taps are silent,
            enable Settings → Sound & vibration → “Dial pad tones” (wording varies by vendor).
          </li>
        </ul>
        <p className="mt-1.5 leading-normal">
          During a live call the keypad sends real DTMF down the line — that’s the same signaling
          this recognizer decodes, in use since 1963.
        </p>
      </details>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </Panel>
  );
}
