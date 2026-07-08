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
        <p className="hint">
          No glyphs yet — press a keypad key or hold your phone’s dialer up to the microphone.
        </p>
      ) : (
        <>
          <div className="dialed">
            {glyphs.map((g, i) => (
              <span key={i} className="dialed-symbol">
                {g.symbol}
              </span>
            ))}
          </div>
          <table className="glyph-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Start</th>
                <th>Duration</th>
                <th>Confidence</th>
                <th>Detected pair</th>
                <th>Twist</th>
              </tr>
            </thead>
            <tbody>
              {[...glyphs].reverse().map((glyph, i) => {
                const payload = glyph.payload as DtmfPayload | undefined;
                return (
                  <tr key={glyphs.length - i}>
                    <td className="glyph-symbol">{glyph.symbol}</td>
                    <td>{glyph.start.toFixed(2)} s</td>
                    <td>{(glyph.duration * 1000).toFixed(0)} ms</td>
                    <td>
                      <meter min={0} max={1} value={glyph.confidence} />{' '}
                      {(glyph.confidence * 100).toFixed(0)}%
                    </td>
                    <td>
                      {payload
                        ? `${payload.lowHz.toFixed(1)} + ${payload.highHz.toFixed(1)} Hz ` +
                          `(nominal ${payload.nominalLowHz} + ${payload.nominalHighHz})`
                        : '—'}
                    </td>
                    <td>{payload ? `${payload.twistDb.toFixed(1)} dB` : '—'}</td>
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
