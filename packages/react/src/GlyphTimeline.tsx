import type { Glyph } from '@sonoglyph/core';
import type { ReactNode } from 'react';

const CELL = 'border-b border-edge-soft py-1 pr-2';

/**
 * The fields the timeline knows how to display, across every payload it may
 * be handed (DTMF FFT / Goertzel / Morse element). Declared structurally so
 * this package stays independent of the recognizer plugins — a glyph's
 * payload is plugin-defined, and we only read what's present.
 */
interface KnownPayload {
  units?: number;
  lowHz?: number;
  highHz?: number;
  nominalLowHz?: number;
  nominalHighHz?: number;
  twistDb?: number;
  snrDb?: number;
}

/** The payload cells, for whichever payload shape the glyph carries. */
function payloadText(glyph: Glyph): { pair: string; detail: string } {
  const payload = glyph.payload as KnownPayload | undefined;
  if (!payload) return { pair: '—', detail: '—' };
  // Morse elements: a dot or dash, measured in timing units. (Letters and
  // words are meaning, not glyphs — see MeaningView.)
  if (payload.units !== undefined) {
    return { pair: '—', detail: `${payload.units.toFixed(1)} units long` };
  }
  const detail = payload.twistDb !== undefined ? `${payload.twistDb.toFixed(1)} dB twist` : '—';
  if (payload.lowHz !== undefined && payload.highHz !== undefined) {
    return {
      pair:
        `${payload.lowHz.toFixed(1)} + ${payload.highHz.toFixed(1)} Hz ` +
        `(nominal ${payload.nominalLowHz} + ${payload.nominalHighHz})`,
      detail,
    };
  }
  if (payload.nominalLowHz !== undefined) {
    return {
      pair: `nominal ${payload.nominalLowHz} + ${payload.nominalHighHz} Hz`,
      detail:
        payload.snrDb !== undefined ? `${detail} · ${payload.snrDb.toFixed(0)} dB SNR` : detail,
    };
  }
  return { pair: '—', detail };
}

/**
 * The recognition history: symbol chips plus a detail table (start, duration,
 * confidence, payload). When glyphs come from more than one recognizer, it
 * splits into a labeled chip row per plugin so "did they agree?" is one
 * glance. Pure presentation — the consumer supplies the glyph list and, for a
 * multi-recognizer comparison, a `decoderLabel` for plugin ids.
 */
export function GlyphTimeline({
  glyphs,
  showPair,
  decoderLabel = (id) => id,
  emptyMessage,
}: {
  glyphs: Glyph[];
  /** DTMF glyphs carry a frequency pair; Morse elements don't. */
  showPair: boolean;
  decoderLabel?: (pluginId: string) => string;
  emptyMessage: ReactNode;
}) {
  if (glyphs.length === 0) {
    return <p className="text-[12.5px] leading-normal text-faint">{emptyMessage}</p>;
  }

  // Attribution follows the glyphs actually collected: history survives
  // plugin switches, and a glyph from a since-disabled plugin must stay
  // labeled, never masquerade as another decoder's output.
  const idsInGlyphs = [...new Set(glyphs.map((g) => g.pluginId))];
  const comparing = idsInGlyphs.length > 1;
  const chipRows = comparing
    ? idsInGlyphs.map((id) => [decoderLabel(id), glyphs.filter((g) => g.pluginId === id)] as const)
    : [['', glyphs] as const];

  return (
    <>
      {chipRows.map(([label, rowGlyphs]) => (
        <div key={label} className="mb-2.5 flex flex-wrap items-center gap-1">
          {label && (
            <span className="w-16 text-[11px] font-semibold tracking-wide text-muted">{label}</span>
          )}
          {rowGlyphs.map((g, i) => (
            <span
              key={i}
              className="dialed-symbol rounded-[5px] border border-accent bg-accent-dim px-2 py-[3px] text-[17px] font-bold"
            >
              {g.symbol}
            </span>
          ))}
        </div>
      ))}
      <table className="glyph-table w-full border-collapse text-[12.5px] tabular-nums">
        <thead>
          <tr>
            {[
              'Symbol',
              ...(comparing ? ['Decoder'] : []),
              'Start',
              'Duration',
              'Confidence',
              ...(showPair ? ['Detected pair'] : []),
              'Detail',
            ].map((heading) => (
              <th
                key={heading}
                className="border-b border-edge py-1 pr-2 text-left font-medium text-muted"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...glyphs].reverse().map((glyph, i) => {
            const { pair, detail } = payloadText(glyph);
            return (
              <tr key={glyphs.length - i}>
                <td className={`${CELL} text-base font-bold text-accent`}>{glyph.symbol}</td>
                {comparing && <td className={CELL}>{decoderLabel(glyph.pluginId)}</td>}
                <td className={CELL}>{glyph.start.toFixed(2)} s</td>
                <td className={CELL}>{(glyph.duration * 1000).toFixed(0)} ms</td>
                <td className={CELL}>
                  <meter min={0} max={1} value={glyph.confidence} />{' '}
                  {(glyph.confidence * 100).toFixed(0)}%
                </td>
                {showPair && <td className={CELL}>{pair}</td>}
                <td className={CELL}>{detail}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
