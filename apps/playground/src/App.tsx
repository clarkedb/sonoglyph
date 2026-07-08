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
      <header className="app-header">
        <h1>Sonoglyph playground</h1>
        <p>
          samples → features → glyphs → meaning · every stage of the pipeline, live and inspectable
        </p>
      </header>
      <main className="panel-grid">
        <InputPanel />
        <WaveformPanel />
        <SpectrumPanel />
        <FeaturesPanel />
        <GlyphTimeline />
      </main>
    </ControllerContext.Provider>
  );
}
