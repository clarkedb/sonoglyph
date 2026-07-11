import { Instrument } from './instrument';
import { REPO_URL } from './site';

const SPECS = [
  {
    unit: 'packages/core',
    role: 'Shared contracts — Glyph, FeatureFrame, RecognizerPlugin, DspEngine, AudioSource. Types only, zero dependencies.',
  },
  {
    unit: 'packages/dsp',
    role: 'The TypeScript reference DSP engine: windowing, radix-2 FFT, spectral peaks, envelope, and the pipeline runner.',
  },
  {
    unit: 'packages/browser',
    role: 'Browser audio: microphone capture via a dumb AudioWorklet, ring buffer, WAV codec, streaming buffer source.',
  },
  {
    unit: 'packages/plugin-sdk',
    role: 'defineRecognizer(...) and friends — per-frame classifiers get debouncing and segmentation for free.',
  },
  {
    unit: 'plugins/dtmf',
    role: 'The reference recognizer: all 16 DTMF keys from spectral peak pairs — FFT and Goertzel strategies, side by side.',
  },
  {
    unit: 'plugins/morse',
    role: 'Time-domain recognition off the envelope stream: dots, dashes, letters — and a translator that gives them meaning.',
  },
] as const;

const GLYPHS = [
  { symbol: '5', system: 'dtmf', href: '/examples/dtmf' },
  { symbol: '–', system: 'morse', href: '/examples/morse' },
  { symbol: 'Am', system: 'chord' }, // no recognizer yet — on the roadmap
  { symbol: '♫', system: 'eridian', href: '/eridian' },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6">
      {/* Hero */}
      <section className="pt-16 sm:pt-24">
        <p className="font-mono text-[13px] text-ink-dim">beep boop beep = hello, world?</p>
        <h1 className="mt-5 font-display text-6xl font-semibold tracking-wide text-ink uppercase sm:text-7xl">
          Sonoglyph
        </h1>
        <p className="mt-3 text-xl text-ink-dim">
          Watch sound become <span className="text-glow text-phosphor">symbols</span>.
        </p>
        <p className="mt-6 max-w-[62ch] leading-relaxed">
          A browser-first, extensible signal recognition framework: a reusable DSP pipeline —
          microphone to spectrum to detected features — and a plugin architecture that turns those
          features into <strong className="font-semibold text-phosphor">glyphs</strong>, symbolic
          representations of recognized signals.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={REPO_URL}
            className="rounded-sm border border-phosphor-dim px-4 py-2 font-mono text-sm text-phosphor transition-colors hover:border-phosphor"
          >
            github ↗
          </a>
          <a
            href={`${REPO_URL}/blob/main/docs/architecture.md`}
            className="rounded-sm border border-line px-4 py-2 font-mono text-sm text-ink transition-colors hover:border-ink-dim"
          >
            architecture
          </a>
        </div>
      </section>

      {/* Fig. 1 — the instrument */}
      <section className="mt-16 sm:mt-20">
        <Instrument />
      </section>

      {/* Theory of operation */}
      <section className="mt-20 sm:mt-24">
        <h2 className="font-display text-2xl font-medium tracking-wide text-ink uppercase">
          Theory of operation
        </h2>
        <p className="mt-4 max-w-[62ch] leading-relaxed">
          The core never knows what a signal <em>means</em>; plugins do. A DTMF key, a Morse dash, a
          musical chord, and a syllable of an alien language are all glyphs — one abstraction, any
          structured signal system. And every stage of the pipeline is observable, because the
          project is as much about <em>teaching</em> signal processing as performing it. Inspired by
          the translator in <em>Project Hail Mary</em>.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {GLYPHS.map((g) => {
            const chipClass =
              'flex items-baseline gap-2 rounded-sm border bg-panel px-3 py-1.5 font-mono text-sm';
            const inner = (
              <>
                <span className="text-phosphor">⟨{g.symbol}⟩</span>
                <span className="text-[11px] text-ink-dim">{g.system}</span>
              </>
            );
            const href = 'href' in g ? g.href : undefined;
            return href ? (
              <a
                key={g.system}
                href={href}
                className={`${chipClass} group border-line transition-colors hover:border-phosphor-dim`}
              >
                {inner}
                <span aria-hidden className="text-[11px] text-ink-dim group-hover:text-phosphor">
                  →
                </span>
              </a>
            ) : (
              <span key={g.system} className={`${chipClass} border-line`}>
                {inner}
              </span>
            );
          })}
        </div>
      </section>

      {/* Specifications */}
      <section className="mt-20 sm:mt-24">
        <h2 className="font-display text-2xl font-medium tracking-wide text-ink uppercase">
          Specifications
        </h2>
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] tracking-wide text-ink-dim uppercase">
              <th scope="col" className="py-2 pr-4 font-normal">
                unit
              </th>
              <th scope="col" className="py-2 font-normal">
                function
              </th>
            </tr>
          </thead>
          <tbody>
            {SPECS.map((spec) => (
              <tr key={spec.unit} className="border-b border-line align-top">
                <th
                  scope="row"
                  className="py-3 pr-4 text-left font-mono text-[13px] font-normal whitespace-nowrap text-phosphor-dim"
                >
                  {spec.unit}
                </th>
                <td className="py-3 leading-relaxed text-ink-dim">{spec.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6 max-w-[70ch] font-mono text-xs leading-relaxed text-ink-dim">
          start with the{' '}
          <a
            className="text-phosphor underline decoration-line underline-offset-4 transition-colors hover:decoration-phosphor"
            href="/learn"
          >
            Learn section
          </a>{' '}
          — interactive articles grown from the playground&rsquo;s embedded explainers. a hosted
          playground is on the way; until then, clone the repo and{' '}
          <code className="rounded-sm border border-line bg-panel px-1.5 py-0.5">pnpm dev</code>.
        </p>
      </section>
    </main>
  );
}
