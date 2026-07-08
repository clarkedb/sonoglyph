import { useState } from 'react';
import { textToMorse } from '@sonoglyph/plugin-morse';
import { useController, useControllerTick } from '../hooks.js';
import { Panel } from './Panel.js';

const EXPLAINER =
  'Morse is recognition in the time domain: the recognizer reads the envelope stream — ' +
  '"how loud is the signal right now" — and never sees a spectrum, which is why the tone’s ' +
  'pitch doesn’t matter. Key-downs become dot and dash glyphs (a dash is 3 dots long), a ' +
  '~3-unit silence closes a letter, and a ~7-unit silence separates words: in Morse the ' +
  'silences carry as much structure as the tones. The transcript below is the Meaning ' +
  'layer at work — a translator consuming letter glyphs and reading word breaks from the ' +
  'gaps. The recognizer also adapts to the sender’s speed by tracking what one "unit" ' +
  'seems to be.';

const LABEL = 'flex flex-col gap-1 text-xs text-muted';

export function MorsePanel() {
  const controller = useController();
  useControllerTick();
  const [text, setText] = useState('SOS');
  const [error, setError] = useState<string | null>(null);
  const enabled = controller.status.morseEnabled;

  const send = () => {
    setError(null);
    controller
      .playMorse(text)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  return (
    <Panel
      title="Morse"
      explainer={EXPLAINER}
      controls={
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => controller.setMorseEnabled(event.target.checked)}
          />
          Enable recognizer
        </label>
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-end gap-2">
          <label className={`${LABEL} grow`}>
            Text to key ({text.trim() ? textToMorse(text) || '—' : '—'})
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="SOS"
            />
          </label>
          <button onClick={send} disabled={!text.trim()}>
            Key it
          </button>
        </div>
        <div>
          <h3 className="text-[13px] font-bold text-heading">Transcript (Meaning layer)</h3>
          <p className="min-h-6 font-mono text-[15px] tracking-wider text-accent">
            {controller.morseText ||
              (enabled ? '—' : 'Enable the recognizer, then key some Morse.')}
          </p>
        </div>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Panel>
  );
}
