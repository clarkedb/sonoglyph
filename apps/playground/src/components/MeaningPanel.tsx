import type { MorseLetter } from '@sonoglyph/plugin-morse';
import { useController, useControllerTick } from '../hooks.ts';
import { Panel } from './Panel.tsx';

const EXPLAINER =
  'The last stage: meaning. The recognizer emits dots and dashes (glyphs); turning them into ' +
  'letters and words is interpretation, so it happens one stage later, in a translator. It ' +
  'reads the silences between elements — a ~3-unit gap closes a letter, ~7 separates words — ' +
  'because in Morse the silences carry as much structure as the tones. Each letter below shows ' +
  'the dot/dash code it was assembled from; an unknown code is flagged rather than hidden.';

/** Group the flat letter list into words, splitting on word breaks. */
function toWords(letters: MorseLetter[]): MorseLetter[][] {
  const words: MorseLetter[][] = [];
  for (const letter of letters) {
    if (letter.wordBreakBefore || words.length === 0) words.push([letter]);
    else words[words.length - 1]!.push(letter);
  }
  return words;
}

export function MeaningPanel() {
  const controller = useController();
  useControllerTick();
  const { text, letters } = controller.morseTranscript;
  const words = toWords(letters);

  return (
    <Panel title="Meaning" explainer={EXPLAINER}>
      {letters.length === 0 ? (
        <p className="min-h-6 text-[12.5px] text-faint">
          Key a message (or feed Morse from the mic) — decoded letters appear here, dots and dashes
          in the glyph timeline.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2" aria-hidden>
            {words.map((word, w) => (
              <div key={w} className="flex flex-wrap gap-1">
                {word.map((letter, i) => (
                  <LetterChip key={`${w}-${i}`} letter={letter} />
                ))}
              </div>
            ))}
          </div>
          {/* The plain transcript, for screen readers and quick copying. */}
          <p className="sr-only" aria-live="polite">
            {text}
          </p>
        </>
      )}
    </Panel>
  );
}

/** One decoded letter: the character over the dot/dash code it came from.
 * Unknown codes (no matching letter) are flagged rather than hidden. */
function LetterChip({ letter }: { letter: MorseLetter }) {
  const unknown = letter.char === '?';
  return (
    <span
      title={`${unknown ? 'unknown' : letter.char} · ${letter.code}`}
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
