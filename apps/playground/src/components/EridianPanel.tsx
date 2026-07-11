import { Panel } from '@sonoglyph/react';
import type { EridianUtterance } from '@sonoglyph/plugin-eridian';
import { useController, useControllerTick } from '../hooks.ts';

const EXPLAINER =
  'The last stage: meaning. The recognizer emits one glyph per sounded chord (a syllable), ' +
  'in the glyph timeline; turning those into words is interpretation, so it happens one stage ' +
  'later, in a translator. Like Morse, it reads the silences between glyphs — a short gap ' +
  'continues a word, a longer one starts the next, a longer one still ends the utterance. ' +
  'Grouped syllables are looked up in the shared Eridian lexicon and handed to the language’s ' +
  'own grammar; the octave register is read back as emotional affect, and a chord that isn’t a ' +
  'dictionary word is flagged rather than hidden.';

export function EridianPanel() {
  const controller = useController();
  useControllerTick();
  const { utterances } = controller.eridianTranslation;

  return (
    <Panel title="Meaning" explainer={EXPLAINER}>
      {utterances.length === 0 ? (
        <p className="text-[13px] text-faint">
          Speak an Eridian phrase (a preset in the input panel, or another device at the mic) — the
          decoded reading appears here, one chord per syllable in the glyph timeline.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5" aria-live="polite">
          {utterances.map((utterance, u) => (
            <UtteranceView key={u} utterance={utterance} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function UtteranceView({ utterance }: { utterance: EridianUtterance }) {
  const register = `${utterance.register >= 0 ? '+' : ''}${utterance.register}`;
  return (
    <div className="rounded-sm border border-edge bg-control p-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {utterance.words.map((word, w) => (
          <span
            key={w}
            className={`font-mono text-[12px] ${word.entry ? 'text-muted' : 'text-danger'}`}
            title={word.syllables.join('-')}
          >
            {word.gloss}
            {word.tense ? ` [${word.tense}]` : ''}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-sm text-accent">“{utterance.gloss}”</p>
      <p className="mt-1 font-mono text-[11px] text-faint">
        {utterance.parsed
          ? 'parsed as a well-formed sentence'
          : 'literal gloss (not a full sentence)'}{' '}
        · register {register} — {utterance.affect}
      </p>
    </div>
  );
}
