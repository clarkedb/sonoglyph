import type { DtmfPayload } from '@sonoglyph/plugin-dtmf';
import { useController, useControllerTick } from '../hooks.js';
import { Panel } from './Panel.js';

const EXPLAINER =
  'Glyphs are the output of recognition: a symbol with a time span, a confidence, and ' +
  'plugin-defined detail. The DTMF recognizer emits one when a tone pair persisted long ' +
  'enough (≥40 ms) and then ended — which is why the glyph appears as you release, not as ' +
  'you press. The payload shows why it decided what it did: the measured frequencies against ' +
  'the nominals it matched, and the level difference between the two tones (“twist”). ' +
  'Confidence falls as the measured frequencies drift from nominal.';

const CELL = 'border-b border-edge-soft py-1 pr-2';

export function GlyphTimeline() {
  const controller = useController();
  useControllerTick();
  const glyphs = controller.glyphs;

  return (
    <Panel
      title="Glyph timeline"
      explainer={EXPLAINER}
      controls={
        <button onClick={() => controller.clearGlyphs()} disabled={glyphs.length === 0}>
          Clear
        </button>
      }
    >
      {glyphs.length === 0 ? (
        <p className="text-[12.5px] leading-normal text-faint">
          No glyphs yet — press a keypad key or hold your phone’s dialer up to the microphone.
        </p>
      ) : (
        <>
          <div className="mb-2.5 flex flex-wrap gap-1">
            {glyphs.map((g, i) => (
              <span
                key={i}
                className="dialed-symbol rounded-[5px] border border-accent bg-accent-dim px-2 py-[3px] text-[17px] font-bold"
              >
                {g.symbol}
              </span>
            ))}
          </div>
          <table className="glyph-table w-full border-collapse text-[12.5px] tabular-nums">
            <thead>
              <tr>
                {['Symbol', 'Start', 'Duration', 'Confidence', 'Detected pair', 'Twist'].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="border-b border-edge py-1 pr-2 text-left font-medium text-muted"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {[...glyphs].reverse().map((glyph, i) => {
                const payload = glyph.payload as DtmfPayload | undefined;
                return (
                  <tr key={glyphs.length - i}>
                    <td className={`${CELL} text-base font-bold text-accent`}>{glyph.symbol}</td>
                    <td className={CELL}>{glyph.start.toFixed(2)} s</td>
                    <td className={CELL}>{(glyph.duration * 1000).toFixed(0)} ms</td>
                    <td className={CELL}>
                      <meter min={0} max={1} value={glyph.confidence} />{' '}
                      {(glyph.confidence * 100).toFixed(0)}%
                    </td>
                    <td className={CELL}>
                      {payload
                        ? `${payload.lowHz.toFixed(1)} + ${payload.highHz.toFixed(1)} Hz ` +
                          `(nominal ${payload.nominalLowHz} + ${payload.nominalHighHz})`
                        : '—'}
                    </td>
                    <td className={CELL}>{payload ? `${payload.twistDb.toFixed(1)} dB` : '—'}</td>
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
