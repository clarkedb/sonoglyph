import { useState } from 'react';
import type { MorseLetter } from '@sonoglyph/plugin-morse';
import { textToMorse } from '@sonoglyph/plugin-morse';
import { useController, useControllerTick } from '../hooks.js';
import { Panel } from './Panel.js';

const EXPLAINER =
  'Morse is recognition in the time domain: the recognizer reads the envelope stream — ' +
  '"how loud is the signal right now" — and never sees a spectrum, which is why the tone’s ' +
  'pitch doesn’t matter. Key-downs become dot and dash glyphs (a dash is 3 dots long) — you ' +
  'can watch them arrive in the glyph timeline. Those elements are all the recognizer emits; ' +
  'turning them into letters and words is meaning, not recognition, so it happens one stage ' +
  'later, in a translator. It reads the silences between elements — ~3 units closes a letter, ' +
  '~7 separates words — because in Morse the silences carry as much structure as the tones. ' +
  'The decode below is that Meaning layer: each letter shows the dot/dash code it came from.';

const LABEL = 'flex flex-col gap-1 text-xs text-muted';

/** Group the flat letter list into words, splitting on word breaks. */
function toWords(letters: MorseLetter[]): MorseLetter[][] {
  const words: MorseLetter[][] = [];
  for (const letter of letters) {
    if (letter.wordBreakBefore || words.length === 0) words.push([letter]);
    else words[words.length - 1]!.push(letter);
  }
  return words;
}

export function MorsePanel() {
  const controller = useController();
  useControllerTick();
  const [text, setText] = useState('SOS');
  const [error, setError] = useState<string | null>(null);
  const enabled = controller.status.morseEnabled;
  const { letters } = controller.morseTranscript;
  const words = toWords(letters);

  const send = () => {
    setError(null);
    controller
      .playMorse(text)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  return (
    <Panel
      title="Morse"
      explainer={EXPLAINER}
      controls={
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => controller.setMorseEnabled(event.target.checked)}
          />
          Enable recognizer
        </label>
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-end gap-2">
          <label className={`${LABEL} grow`}>
            Text to key
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="SOS"
            />
          </label>
          <button onClick={send} disabled={!textToMorse(text)}>
            Key it
          </button>
        </div>
        <p aria-live="polite" className="text-[12.5px] text-faint">
          {textToMorse(text) || 'Nothing encodable yet — letters, digits, and .,?/= work.'}
        </p>

        <div>
          <h3 className="text-[13px] font-bold text-heading">Decoded meaning</h3>
          {letters.length === 0 ? (
            <p className="min-h-6 text-[12.5px] text-faint">
              {enabled
                ? 'Key some Morse — decoded letters appear here, dots and dashes in the glyph timeline.'
                : 'Enable the recognizer, then key some Morse.'}
            </p>
          ) : (
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2" aria-hidden>
              {words.map((word, w) => (
                <div key={w} className="flex flex-wrap gap-1">
                  {word.map((letter, i) => (
                    <LetterChip key={`${w}-${i}`} letter={letter} />
                  ))}
                </div>
              ))}
            </div>
          )}
          {/* The plain transcript, for screen readers and quick copying. */}
          {letters.length > 0 && (
            <p className="sr-only" aria-live="polite">
              {controller.morseTranscript.text}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}

/** One decoded letter: the character over the dot/dash code it came from.
 * Unknown codes (no matching letter) are flagged rather than hidden. */
function LetterChip({ letter }: { letter: MorseLetter }) {
  const unknown = letter.char === '?';
  return (
    <span
      title={`${letter.char === '?' ? 'unknown' : letter.char} · ${letter.code}`}
      className={`flex flex-col items-center rounded-[5px] border px-2 py-1 leading-none ${
        unknown
          ? 'border-danger bg-danger/10 text-danger'
          : 'border-accent bg-accent-dim text-accent'
      }`}
    >
      <span className="text-[17px] font-bold">{letter.char}</span>
      <span className="mt-1 font-mono text-[11px] tracking-widest text-muted">{letter.code}</span>
    </span>
  );
}
