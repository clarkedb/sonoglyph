import type { DecoderChoice } from '../controller.ts';
import { GlyphTimeline as GlyphTable, Panel } from '@sonoglyph/react';
import { useController, useControllerTick } from '../hooks.ts';

const DTMF_EXPLAINER =
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

const MORSE_EXPLAINER =
  'Glyphs are the output of recognition: a symbol with a time span, a confidence, and ' +
  'plugin-defined detail. Here each glyph is one keyed element — a dot or a dash, named by ' +
  'its duration (a dash is 3 dots long) and emitted when the key-down ends. That is all the ' +
  'recognizer produces; the elements assemble into letters and words one stage later, in the ' +
  'meaning panel. Note the same waveform/spectrum/features pipeline above fed the DTMF ' +
  'decoder moments ago — nothing in it knows a signal changed.';

/** Short decoder names for the comparison view. */
const DECODER_LABELS: Record<string, string> = {
  dtmf: 'FFT',
  'dtmf-goertzel': 'Goertzel',
  morse: 'Morse',
};
const decoderLabel = (pluginId: string) => DECODER_LABELS[pluginId] ?? pluginId;

export function GlyphTimeline() {
  const controller = useController();
  useControllerTick();
  const glyphs = controller.glyphs;
  const { decoders, system } = controller.status;
  // DTMF glyphs carry a frequency pair; Morse elements don't, so that
  // column (and the decoder comparison) only belong in DTMF mode.
  const showPair = system === 'dtmf';

  return (
    <Panel
      title="Glyph timeline"
      explainer={showPair ? DTMF_EXPLAINER : MORSE_EXPLAINER}
      controls={
        <>
          {showPair && (
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
          )}
          <button onClick={() => controller.clearGlyphs()} disabled={glyphs.length === 0}>
            Clear
          </button>
        </>
      }
    >
      <GlyphTable
        glyphs={glyphs}
        showPair={showPair}
        decoderLabel={decoderLabel}
        emptyMessage={
          showPair
            ? 'No glyphs yet — press a keypad key or hold your phone’s dialer up to the microphone.'
            : system === 'eridian'
              ? 'No glyphs yet — play an Eridian phrase in the input panel, or speak one at the microphone.'
              : 'No glyphs yet — key a message in the input panel, or feed Morse from the microphone.'
        }
      />
    </Panel>
  );
}
