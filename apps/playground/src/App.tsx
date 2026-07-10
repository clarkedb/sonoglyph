import type { PlaygroundController, SignalSystem } from './controller.ts';
import { ControllerContext, useController, useControllerTick } from './hooks.ts';
import { BenchmarkPanel } from './components/BenchmarkPanel.tsx';
import { FeaturesPanel } from './components/FeaturesPanel.tsx';
import { GlyphTimeline } from './components/GlyphTimeline.tsx';
import { InputPanel } from './components/InputPanel.tsx';
import { MeaningPanel } from './components/MeaningPanel.tsx';
import { SpectrumPanel } from './components/SpectrumPanel.tsx';
import { WaveformPanel } from './components/WaveformPanel.tsx';

// The controller is owned by main.tsx (not created here) so its lifecycle —
// and its disposal on HMR — sits outside React's render/StrictMode churn.
export function App({ controller }: { controller: PlaygroundController }) {
  return (
    <ControllerContext.Provider value={controller}>
      <Playground />
    </ControllerContext.Provider>
  );
}

const SYSTEMS: { id: SignalSystem; label: string }[] = [
  { id: 'dtmf', label: 'DTMF' },
  { id: 'morse', label: 'Morse' },
];

function Playground() {
  const controller = useController();
  useControllerTick();
  const { system } = controller.status;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3 px-6 pt-4 pb-1">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-wide uppercase">
            Sonoglyph playground
          </h1>
          <p className="mt-0.5 font-mono text-xs text-muted">
            samples → features → glyphs → meaning · one pipeline, any signal
          </p>
        </div>
        <div
          role="group"
          aria-label="Signal system"
          className="flex divide-x divide-edge overflow-hidden rounded-sm border border-edge"
        >
          {SYSTEMS.map((s) => (
            <button
              key={s.id}
              aria-pressed={system === s.id}
              onClick={() => controller.setSystem(s.id)}
              className={`rounded-none border-0 px-3.5 py-1.5 text-sm font-semibold ${
                system === s.id
                  ? 'bg-accent-dim text-accent hover:bg-accent-dim'
                  : 'bg-control text-muted hover:bg-control-hover'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>
      <main className="grid grid-cols-1 gap-3.5 px-6 pt-4 pb-10 md:grid-cols-2">
        <InputPanel />
        <WaveformPanel />
        <SpectrumPanel />
        <FeaturesPanel />
        <GlyphTimeline />
        {system === 'morse' && <MeaningPanel />}
        {system === 'dtmf' && <BenchmarkPanel />}
      </main>
    </>
  );
}
