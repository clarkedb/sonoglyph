/**
 * @sonoglyph/react — presentational React components for signal-recognition
 * UIs. The visualization views own their canvas + animation loop and read
 * their data through an injected `read()` accessor, so they stay decoupled
 * from any particular data source (the playground's controller, a Learn
 * article's fixture, a live mic). Styled against the token contract in
 * ./theme.css; canvas colors resolve from CSS custom properties.
 */
export { Panel } from './Panel.tsx';
export { WaveformView } from './WaveformView.tsx';
export { SpectrumView, type SpectrumInput } from './SpectrumView.tsx';
export { FeatureReadout, type FeatureInput } from './FeatureReadout.tsx';
export { GlyphTimeline } from './GlyphTimeline.tsx';
export { MeaningView, type MeaningLetter, type Transcript } from './MeaningView.tsx';
export { useAnimationFrame, scaleCanvas, useVizPalette, type VizPalette } from './hooks.ts';
