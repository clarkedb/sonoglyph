import { useMemo } from 'react';
import { PlaygroundController } from './controller.js';
import { ControllerContext } from './hooks.js';
import { FeaturesPanel } from './components/FeaturesPanel.js';
import { GlyphTimeline } from './components/GlyphTimeline.js';
import { InputPanel } from './components/InputPanel.js';
import { SpectrumPanel } from './components/SpectrumPanel.js';
import { WaveformPanel } from './components/WaveformPanel.js';

export function App() {
  const controller = useMemo(() => new PlaygroundController(), []);

  return (
    <ControllerContext.Provider value={controller}>
      <header className="px-6 pt-4 pb-1">
        <h1 className="text-xl font-bold tracking-wide">Sonoglyph playground</h1>
        <p className="mt-0.5 text-muted">
          samples → features → glyphs → meaning · every stage of the pipeline, live and inspectable
        </p>
      </header>
      <main className="grid grid-cols-1 gap-3.5 px-6 pt-4 pb-10 md:grid-cols-2">
        <InputPanel />
        <WaveformPanel />
        <SpectrumPanel />
        <FeaturesPanel />
        <GlyphTimeline />
      </main>
    </ControllerContext.Provider>
  );
}
