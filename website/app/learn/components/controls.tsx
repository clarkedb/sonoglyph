'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';

/*
 * Control primitives for the chapter interactives and hosted examples —
 * knobs on the instrument's front panel. Labels are always visible (a
 * spec sheet names every control) and every input is a native element,
 * so keyboard and screen-reader behavior come from the platform.
 */

export function Btn({
  onClick,
  children,
  primary = false,
  disabled = false,
  ariaLabel,
}: {
  onClick: () => void;
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`cursor-pointer rounded-sm border px-3 py-1.5 font-mono text-xs transition-colors disabled:cursor-default disabled:opacity-50 ${
        primary
          ? 'border-phosphor-dim text-phosphor hover:border-phosphor'
          : 'border-line text-ink hover:border-ink-dim'
      }`}
    >
      {children}
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Renders the readout next to the label, e.g. (v) => `${v} Hz`. */
  format?: (value: number) => string;
}) {
  const id = useId();
  return (
    <div className="min-w-40">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
        <label htmlFor={id} className="text-ink-dim">
          {label}
        </label>
        <span className="text-ink tabular-nums">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full accent-phosphor"
      />
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-[11px] text-ink-dim">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 block rounded-sm border border-line bg-void px-2 py-1 font-mono text-xs text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A labeled group of mutually exclusive buttons (presets, modes). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="font-mono text-[11px] text-ink-dim">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors ${
              o.value === value
                ? 'border-phosphor-dim bg-phosphor/10 text-phosphor'
                : 'border-line text-ink-dim hover:border-ink-dim hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The instrument's data readout: label over a tabular value. */
export function Readout({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="font-mono text-[11px]">
      <p className="text-ink-dim">{label}</p>
      <p className="mt-0.5 text-ink tabular-nums">{value}</p>
    </div>
  );
}
