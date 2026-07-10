import type { ReactNode } from 'react';

/** One decoded letter: the character and the dot/dash code it came from.
 * Declared structurally (not imported from plugin-morse) so this package
 * stays plugin-independent; a Morse transcript is assignable to it. */
export interface MeaningLetter {
  char: string;
  code: string;
  wordBreakBefore?: boolean;
}

export interface Transcript {
  text: string;
  letters: MeaningLetter[];
}

/** Group the flat letter list into words, splitting on word breaks. */
function toWords(letters: MeaningLetter[]): MeaningLetter[][] {
  const words: MeaningLetter[][] = [];
  for (const letter of letters) {
    if (letter.wordBreakBefore || words.length === 0) words.push([letter]);
    else words[words.length - 1]!.push(letter);
  }
  return words;
}

/**
 * The Meaning layer: decoded letters assembled from element glyphs, each
 * shown over the dot/dash code it came from. An unknown code (char `?`) is
 * flagged rather than hidden. A screen-reader-only live region carries the
 * plain transcript.
 */
export function MeaningView({
  transcript,
  emptyMessage,
}: {
  transcript: Transcript;
  emptyMessage: ReactNode;
}) {
  const { text, letters } = transcript;
  if (letters.length === 0) {
    return <p className="min-h-6 text-[12.5px] text-faint">{emptyMessage}</p>;
  }
  const words = toWords(letters);

  return (
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
  );
}

function LetterChip({ letter }: { letter: MeaningLetter }) {
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
