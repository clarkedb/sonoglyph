import type { Glyph } from '@sonoglyph/core';
import type { DtmfPayload, GoertzelDtmfPayload } from '@sonoglyph/plugin-dtmf';
import type { MorseElementPayload, MorseLetterPayload } from '@sonoglyph/plugin-morse';
import type { DecoderChoice } from '../controller.js';
import { useController, useControllerTick } from '../hooks.js';
import { Panel } from './Panel.js';

const EXPLAINER =
  'Glyphs are the output of recognition: a symbol with a time span, a confidence, and ' +
  'plugin-defined detail. A recognizer emits one when a tone pair persisted long enough ' +
  '(≥40 ms) and then ended — which is why the glyph appears as you release, not as you ' +
  'press. The payload shows why it decided what it did. Two recognizers implement DTMF ' +
  'here, and the decoder toggle demonstrates that plugins own their strategy: the FFT one ' +
  'reads interpolated spectral peaks (measure everything, then look for the pair), the ' +
  'Goertzel one probes exactly the 8 nominal frequencies against a per-frequency noise ' +
  'floor it learns from the room (ask only the question you care about — the classic ' +
  'real-world DTMF design). Run both and bury a tone in noise: the purpose-built ' +
  'measurement keeps decoding after peak-picking gives out.';

/** Short decoder names for the comparison view. */
const DECODER_LABELS: Record<string, string> = {
  dtmf: 'FFT',
  'dtmf-goertzel': 'Goertzel',
  morse: 'Morse',
};

const decoderLabel = (pluginId: string) => DECODER_LABELS[pluginId] ?? pluginId;

const CELL = 'border-b border-edge-soft py-1 pr-2';

/** The payload cells, for whichever payload shape the glyph carries. */
function payloadText(glyph: Glyph): { pair: string; detail: string } {
  const payload = glyph.payload as
    | Partial<DtmfPayload & GoertzelDtmfPayload & MorseElementPayload & MorseLetterPayload>
    | undefined;
  if (!payload) return { pair: '—', detail: '—' };
  if (payload.code !== undefined) {
    return {
      pair: `code ${payload.code}`,
      detail: Number.isFinite(payload.gapUnits)
        ? `${payload.gapUnits!.toFixed(1)} units of silence before`
        : '—',
    };
  }
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

export function GlyphTimeline() {
  const controller = useController();
  useControllerTick();
  const glyphs = controller.glyphs;
  const decoders = controller.status.decoders;
  const activeIds = [
    ...(decoders === 'both'
      ? ['dtmf', 'dtmf-goertzel']
      : [decoders === 'fft' ? 'dtmf' : 'dtmf-goertzel']),
    ...(controller.status.morseEnabled ? ['morse'] : []),
  ];
  // Label which plugin emitted each glyph whenever more than one runs.
  const comparing = activeIds.length > 1;
  // Chip rows: one per active plugin, so "did they agree?" is one glance.
  const chipRows = comparing
    ? activeIds.map((id) => [decoderLabel(id), glyphs.filter((g) => g.pluginId === id)] as const)
    : [['', glyphs] as const];

  return (
    <Panel
      title="Glyph timeline"
      explainer={EXPLAINER}
      controls={
        <>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Decoder
            <select
              value={decoders}
              onChange={(event) => controller.setDecoders(event.target.value as DecoderChoice)}
            >
              <option value="fft">DTMF (FFT peaks)</option>
              <option value="goertzel">DTMF (Goertzel)</option>
              <option value="both">Compare both</option>
            </select>
          </label>
          <button onClick={() => controller.clearGlyphs()} disabled={glyphs.length === 0}>
            Clear
          </button>
        </>
      }
    >
      {glyphs.length === 0 ? (
        <p className="text-[12.5px] leading-normal text-faint">
          No glyphs yet — press a keypad key or hold your phone’s dialer up to the microphone.
        </p>
      ) : (
        <>
          {chipRows.map(([label, rowGlyphs]) => (
            <div key={label} className="mb-2.5 flex flex-wrap items-center gap-1">
              {label && (
                <span className="w-16 text-[11px] font-semibold tracking-wide text-muted">
                  {label}
                </span>
              )}
              {rowGlyphs.map((g, i) => (
                <span
                  key={i}
                  className="dialed-symbol rounded-[5px] border border-accent bg-accent-dim px-2 py-[3px] text-[17px] font-bold"
                >
                  {g.symbol}
                </span>
              ))}
              {label && rowGlyphs.length === 0 && (
                <span className="text-[12.5px] text-faint">no glyphs</span>
              )}
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
                  'Detected pair',
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
                    <td className={CELL}>{pair}</td>
                    <td className={CELL}>{detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
}
