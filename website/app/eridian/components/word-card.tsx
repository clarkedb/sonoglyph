'use client';

import { wordOf, type LexiconEntry, type WordCategory } from '@sonoglyph/eridian';

/**
 * A dictionary entry as a card: its canonical spelling (syllable codes joined
 * with "-"), gloss, and word class. Shared by the dictionary grid and the
 * composer's word palette — clicking selects (dictionary) or appends
 * (composer), whatever `onSelect` the consumer wires.
 */

export function CategoryBadge({ category }: { category: WordCategory }) {
  return (
    <span className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-ink-dim">
      {category}
    </span>
  );
}

export function WordCard({
  entry,
  selected = false,
  onSelect,
}: {
  entry: LexiconEntry;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex w-full flex-col gap-1.5 rounded-sm border p-3 text-left transition-colors ${
        selected
          ? 'border-phosphor-dim bg-phosphor/10'
          : 'border-line bg-void hover:border-phosphor-dim'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-mono text-sm font-semibold tracking-wide ${
            selected ? 'text-phosphor' : 'text-ink group-hover:text-phosphor'
          }`}
        >
          {wordOf(entry)}
        </span>
        <CategoryBadge category={entry.category} />
      </div>
      <span className="text-sm leading-snug text-ink-dim">{entry.gloss}</span>
    </button>
  );
}
