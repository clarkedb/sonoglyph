import { useEffect, useRef, useState } from 'react';
import type { Register, SyllableCode } from '@sonoglyph/eridian';
import type { DtmfKey } from '@sonoglyph/plugin-dtmf';
import { ALL_KEYS } from '@sonoglyph/plugin-dtmf';
import { textToMorse } from '@sonoglyph/plugin-morse';
import type { PlaygroundController, SignalSystem } from '../controller.ts';
import { Panel } from '@sonoglyph/react';
import { useController, useControllerTick } from '../hooks.ts';

const DTMF_EXPLAINER =
  'Everything starts as samples: numbers measuring air pressure thousands of times per ' +
  'second. The pipeline does not care where they come from — a microphone, a synthesized ' +
  'keypad tone, or an uploaded WAV file all flow through the exact same code. Press a keypad ' +
  'key: you hear the two-tone chord (one row tone + one column tone) and watch it travel ' +
  'through every stage below until the digit appears in the glyph timeline. While the ' +
  'microphone is live, keypad tones are only played out loud — the mic picks them up ' +
  'acoustically, like a phone would.';

const MORSE_EXPLAINER =
  'Everything starts as samples: numbers measuring air pressure thousands of times per ' +
  'second — from a microphone, an uploaded WAV, or the keyer below. Type a message and key ' +
  'it: it is sent as on/off tones (dot = 1 unit, dash = 3, with 1/3/7-unit gaps) through the ' +
  'exact same pipeline the other panels show. The recognizer reads only the amplitude ' +
  'envelope — never the spectrum — so the pitch is irrelevant; the dots and dashes appear in ' +
  'the glyph timeline and assemble into text in the meaning panel.';

const ERIDIAN_EXPLAINER =
  'Everything starts as samples — here, chords of pure sine tones, the way the Eridian language ' +
  'is voiced (from Project Hail Mary). Press a phrase: you hear its syllables as chords and watch ' +
  'them travel through the exact same pipeline the other panels show. The recognizer reads the ' +
  'spectral peaks, matches each chord to a syllable, and the meaning panel groups those syllables ' +
  'into words. While the microphone is live, phrases are only played out loud — the mic picks them ' +
  'up acoustically, so a second device speaking Eridian at this one decodes just the same.';

const LABEL = 'flex flex-col gap-1 text-xs text-muted';

/** A phrase to speak: an ordered list of words, each a list of syllable codes,
 * voiced at a register. Mirrors the website composer's presets. */
interface EridianPreset {
  label: string;
  words: SyllableCode[][];
  register: Register;
}

const ERIDIAN_PRESETS: EridianPreset[] = [
  { label: 'you good', words: [['S2'], ['S5']], register: 0 },
  { label: 'are you good?', words: [['S2'], ['S5'], ['Q']], register: 0 },
  { label: 'I am not good', words: [['NEG'], ['S1'], ['S5']], register: 0 },
  { label: 'I am human', words: [['S1'], ['S3', 'S3'], ['BE']], register: 0 },
  { label: 'I will hear you', words: [['S1'], ['S2'], ['S3', 'S6'], ['FUT']], register: 0 },
  { label: 'Eridian amaze!', words: [['S4', 'S4'], ['S7']], register: 2 },
];

const EXPLAINERS: Record<SignalSystem, string> = {
  dtmf: DTMF_EXPLAINER,
  morse: MORSE_EXPLAINER,
  eridian: ERIDIAN_EXPLAINER,
};

/** Run an async action, surfacing any failure through `setError`. */
type Run = (action: () => Promise<void>) => void;
function makeRun(setError: (e: string | null) => void): Run {
  return (action) => {
    setError(null);
    action().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };
}

export function InputPanel() {
  const controller = useController();
  useControllerTick();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = makeRun(setError);
  const { mode, system } = controller.status;

  return (
    <Panel
      title="Input"
      explainer={EXPLAINERS[system]}
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
      {system === 'dtmf' ? (
        <DtmfInput controller={controller} run={run} />
      ) : system === 'morse' ? (
        <MorseInput controller={controller} run={run} />
      ) : (
        <EridianInput controller={controller} run={run} />
      )}
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </Panel>
  );
}

function DtmfInput({ controller, run }: { controller: PlaygroundController; run: Run }) {
  const [toneFreqs, setToneFreqs] = useState('440');
  const [toneMs, setToneMs] = useState(500);

  // Physical keyboard drives the keypad — mounted only while DTMF is shown.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Ignore auto-repeat: holding a key should play one tone, not
      // machine-gun playKey for as long as it's down.
      if (event.repeat) return;
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toUpperCase();
      if ((ALL_KEYS as string[]).includes(key)) {
        run(() => controller.playKey(key as DtmfKey));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `run` is recreated each render but only closes over setError (stable);
    // keying off controller alone keeps the listener from thrashing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  return (
    <>
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
      <details className="phone-howto mt-2.5 rounded-sm border border-dashed border-edge px-2.5 py-2 text-[12.5px] text-soft">
        <summary className="cursor-pointer text-soft">Use a real phone as the input</summary>
        <p className="mt-1.5 leading-normal">
          Start the microphone above, then open your smartphone’s Phone app and bring up its keypad
          — no call needed. Turn the media volume up and take the phone off silent, hold it near
          this device’s microphone, and tap digits: each tap plays the same two-tone pair this
          keypad synthesizes.
        </p>
        <ul className="mt-1.5 list-disc pl-[18px] leading-normal">
          <li>
            <strong className="font-semibold text-heading">iPhone:</strong> keypad taps play tones
            out of the box; if you hear nothing, flip the ring/silent switch to ring.
          </li>
          <li>
            <strong className="font-semibold text-heading">Android:</strong> if taps are silent,
            enable Settings → Sound & vibration → “Dial pad tones” (wording varies by vendor).
          </li>
        </ul>
        <p className="mt-1.5 leading-normal">
          During a live call the keypad sends real DTMF down the line — that’s the same signaling
          this recognizer decodes, in use since 1963.
        </p>
      </details>
    </>
  );
}

function MorseInput({ controller, run }: { controller: PlaygroundController; run: Run }) {
  const [text, setText] = useState('SOS');
  const code = textToMorse(text);
  const keying = controller.status.mode === 'key';

  // While the straight key is on, the spacebar IS the key: hold to sound a
  // tone, release to stop. preventDefault stops the page scrolling and the
  // focused button re-triggering; repeats are ignored so one hold is one
  // element of the held length.
  useEffect(() => {
    if (!keying) return;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      event.preventDefault();
      controller.keyDown();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      controller.keyUp();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [controller, keying]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-end gap-2">
        <label className={`${LABEL} grow`}>
          Message to key
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="SOS"
            disabled={keying}
          />
        </label>
        <button onClick={() => run(() => controller.playMorse(text))} disabled={!code || keying}>
          Key it
        </button>
      </div>
      <p aria-live="polite" className="font-mono text-[12.5px] tracking-widest text-faint">
        {code || 'Nothing encodable yet — letters, digits, and .,?/= work.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={keying ? 'border-accent bg-accent-dim' : ''}
          onClick={(event) => {
            // Drop focus so the spacebar keys the tone instead of
            // re-clicking this button.
            event.currentTarget.blur();
            run(() => (keying ? controller.stop() : controller.startStraightKey()));
          }}
        >
          {keying ? '● Stop straight key' : 'Straight key'}
        </button>
        {keying && (
          <span className="text-[12.5px] text-faint">
            Hold{' '}
            <kbd className="rounded-sm border border-edge px-1 font-mono text-[11px]">Space</kbd> to
            sound a tone — short tap = dot, long hold = dash.
          </span>
        )}
      </div>

      <p className="text-[12.5px] leading-normal text-faint">
        Dot = 1 unit, dash = 3; letters split on a 3-unit gap, words on 7. The recognizer tracks the
        sender’s speed, so brisk or slow both decode.
      </p>
    </div>
  );
}

function EridianInput({ controller, run }: { controller: PlaygroundController; run: Run }) {
  const listening = controller.status.mode === 'mic';

  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[13px] font-bold text-heading">Play Rocky</h3>
      <div className="flex flex-wrap gap-1.5">
        {ERIDIAN_PRESETS.map((preset) => (
          <button
            key={preset.label}
            className="active:bg-accent-dim"
            onClick={() => run(() => controller.playEridian(preset.words, preset.register))}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p className="text-[12.5px] leading-normal text-faint">
        Each phrase is voiced as chords — one per syllable — and decoded back to English in the
        meaning panel.{' '}
        {listening
          ? 'The microphone is live, so a phrase plays out loud and the mic hears it acoustically — the honest path, and how a second device speaking Eridian would reach this one.'
          : 'Start the microphone above to hear a phrase through the air instead of fed straight in, or point another device running the composer at the mic.'}
      </p>
    </div>
  );
}
