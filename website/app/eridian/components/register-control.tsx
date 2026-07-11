'use client';

import { REGISTER_AFFECT, type Register } from '@sonoglyph/eridian';

/**
 * The register (octave) selector — Eridian's emotion channel. Transposing an
 * utterance up or down whole octaves never changes which words it is, only the
 * affect it carries (docs/eridian.md#register), so this sits apart from word
 * choice the way a tone-of-voice knob would.
 */
const REGISTERS: Register[] = [-2, -1, 0, 1, 2];

export function RegisterControl({
  value,
  onChange,
}: {
  value: Register;
  onChange: (register: Register) => void;
}) {
  return (
    <div role="group" aria-label="Register (emotion)">
      <p className="font-mono text-[11px] text-ink-dim">register · emotion</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {REGISTERS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === value}
            title={REGISTER_AFFECT[r]}
            onClick={() => onChange(r)}
            className={`cursor-pointer rounded-sm border px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
              r === value
                ? 'border-phosphor-dim bg-accent-dim text-phosphor'
                : 'border-line bg-void text-ink-dim hover:border-ink-dim hover:text-ink'
            }`}
          >
            {r > 0 ? `+${r}` : r}
          </button>
        ))}
      </div>
      <p className="mt-1.5 font-mono text-[11px] leading-snug text-ink-dim">
        {REGISTER_AFFECT[value]}
      </p>
    </div>
  );
}
