/**
 * The Learn section's content registry — the single source of truth for the
 * index, the article routes, and their metadata. Articles are a deliberate
 * sequence (the index numbers them), promoted from the playground panels'
 * embedded explainers; each chapter's body lives in ./content/<slug>.tsx.
 */
export interface LearnArticle {
  slug: string;
  title: string;
  blurb: string;
}

export const ARTICLES: LearnArticle[] = [
  {
    slug: 'sound-and-sampling',
    title: 'Sound & sampling',
    blurb:
      'A pressure wave becomes a stream of numbers — amplitude, sample rate, and what a sample really is.',
  },
  {
    slug: 'nyquist',
    title: 'Nyquist & aliasing',
    blurb:
      'Why the sample rate sets a ceiling on the frequencies you can capture, and what happens when you cross it.',
  },
  {
    slug: 'fft-and-windowing',
    title: 'FFT & windowing',
    blurb:
      'From samples to a spectrum — and the resolution tradeoff between seeing frequency precisely and seeing it soon.',
  },
  {
    slug: 'harmonics',
    title: 'Harmonics & timbre',
    blurb:
      'Why a note is never one frequency, and how the overtone stack is what makes a voice a voice.',
  },
  {
    slug: 'peak-detection',
    title: 'Peak detection',
    blurb:
      'Finding the frequencies that matter in a noisy spectrum, and refining them below one bin with parabolic interpolation.',
  },
  {
    slug: 'feature-extraction',
    title: 'Feature extraction',
    blurb:
      'Reducing each analysis window to the named streams a recognizer actually consumes: spectrum, peaks, envelope.',
  },
  {
    slug: 'building-a-recognizer',
    title: 'Building a recognizer',
    blurb:
      'End to end: turn a feature stream into glyphs with segmentation and confidence — the plugin contract in practice.',
  },
  {
    slug: 'dtmf-history',
    title: 'DTMF: history & why it works',
    blurb:
      'The dual-tone scheme behind every phone keypad, and the design choices that make it robust to noise.',
  },
  {
    slug: 'fft-vs-goertzel',
    title: 'FFT vs. Goertzel',
    blurb:
      'Measure every frequency, or ask about the eight you care about — a general-purpose vs. purpose-built comparison.',
  },
];

/** Focused single-purpose demos hosted in the site (smaller than the full
 * playground at play.sonoglyph.dev), routed under /examples. */
export const EXAMPLES: { slug: string; title: string; blurb: string }[] = [
  {
    slug: 'dtmf',
    title: 'DTMF decoder',
    blurb: 'Press a key or feed a tone; watch it resolve to a digit.',
  },
  {
    slug: 'morse',
    title: 'Morse decoder',
    blurb: 'Key a message by hand and read the letters as they close.',
  },
  {
    slug: 'tone',
    title: 'Tone playground',
    blurb: 'Generate arbitrary tones and watch the spectrum respond.',
  },
];

export function getArticle(slug: string): LearnArticle | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}
