import { PipelineFigure } from './pipeline-figure';
import { REPO_URL } from './site';

const PACKAGES = [
  {
    name: 'packages/core',
    blurb:
      'Shared contracts — Glyph, FeatureFrame, RecognizerPlugin, DspEngine, AudioSource. Types only, zero dependencies.',
  },
  {
    name: 'packages/dsp',
    blurb:
      'The TypeScript reference DSP engine: windowing, radix-2 FFT, spectral peaks, envelope, and the pipeline runner.',
  },
  {
    name: 'packages/browser',
    blurb:
      'Browser audio: microphone capture via a dumb AudioWorklet, ring buffer, WAV codec, streaming buffer source.',
  },
  {
    name: 'packages/plugin-sdk',
    blurb:
      'defineRecognizer(...) and friends — per-frame classifiers get debouncing and segmentation for free.',
  },
  {
    name: 'plugins/dtmf',
    blurb:
      'The reference recognizer: all 16 DTMF keys from spectral peak pairs — FFT and Goertzel strategies, side by side.',
  },
  {
    name: 'plugins/morse',
    blurb:
      'Time-domain recognition off the envelope stream: dots, dashes, letters — and a translator that gives them meaning.',
  },
] as const;

const GLYPHS = [
  { symbol: '5', system: 'dtmf' },
  { symbol: '–', system: 'morse' },
  { symbol: 'Am', system: 'chord' },
  { symbol: '♫', system: 'eridian' },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6">
      {/* Hero */}
      <section className="pt-16 pb-14 sm:pt-24">
        <p className="font-mono text-[13px] text-ink-dim">beep boop beep = hello, world?</p>
        <h1 className="mt-5 font-display text-5xl tracking-tight sm:text-6xl">Sonoglyph</h1>
        <p className="mt-4 font-display text-xl text-ink-dim italic">Signals in. Symbols out.</p>
        <p className="mt-6 max-w-[62ch] leading-relaxed">
          A browser-first, extensible signal recognition framework: a reusable DSP pipeline —
          microphone to spectrum to detected features — and a plugin architecture that turns those
          features into <Term>glyphs</Term>, symbolic representations of recognized signals.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={REPO_URL}
            className="rounded-md bg-ink px-4 py-2 font-mono text-sm text-paper transition-opacity hover:opacity-85"
          >
            github ↗
          </a>
          <a
            href={`${REPO_URL}/blob/main/docs/architecture.md`}
            className="rounded-md border border-line px-4 py-2 font-mono text-sm text-ink transition-colors hover:border-ink-dim"
          >
            architecture
          </a>
        </div>
      </section>

      <Rule />

      {/* Pipeline */}
      <section className="py-14">
        <SectionLabel>the pipeline</SectionLabel>
        <p className="mt-5 max-w-[62ch] leading-relaxed">
          Press <Mono>5</Mono> on a phone keypad and it sings two tones at once — 770 Hz and 1336
          Hz. Below, that signal moves through the pipeline; in the{' '}
          <a
            className="underline decoration-line underline-offset-4 transition-colors hover:decoration-ink-dim"
            href={`${REPO_URL}#quick-start`}
          >
            playground
          </a>{' '}
          every one of these stages is live and inspectable.
        </p>
        <div className="mt-7">
          <PipelineFigure />
        </div>
      </section>

      <Rule />

      {/* The idea */}
      <section className="py-14">
        <SectionLabel>the idea</SectionLabel>
        <p className="mt-5 max-w-[62ch] leading-relaxed">
          The core never knows what a signal <em>means</em>; plugins do. A DTMF key, a Morse dash, a
          musical chord, and a syllable of an alien language are all glyphs — one abstraction, any
          structured signal system. And every stage of the pipeline is observable, because the
          project is as much about <em>teaching</em> signal processing as performing it. Inspired by
          the translator in <em>Project Hail Mary</em>.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          {GLYPHS.map((g) => (
            <span
              key={g.system}
              className="flex items-baseline gap-2 rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-sm"
            >
              <span className="text-accent">⟨{g.symbol}⟩</span>
              <span className="text-[11px] text-ink-dim">{g.system}</span>
            </span>
          ))}
        </div>
      </section>

      <Rule />

      {/* Workspace */}
      <section className="py-14">
        <SectionLabel>inside the workspace</SectionLabel>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {PACKAGES.map((pkg) => (
            <div key={pkg.name} className="rounded-md border border-line bg-panel p-4">
              <h3 className="font-mono text-[13px]">{pkg.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{pkg.blurb}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 font-mono text-xs leading-relaxed text-ink-dim">
          next: a hosted playground and a Learn section — interactive articles grown from the
          playground&rsquo;s embedded explainers. until then: clone, <Mono>pnpm dev</Mono>.
        </p>
      </section>
    </main>
  );
}

function Rule() {
  return <div aria-hidden className="rule-ticks" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-xs tracking-[0.2em] text-ink-dim uppercase">
      <span aria-hidden className="text-accent">
        ∿{' '}
      </span>
      {children}
    </h2>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-accent">{children}</strong>;
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  );
}
