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
      'A microphone turns a pressure wave into numbers. What amplitude is, what a sample actually captures, and why the rate matters.',
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
      'Samples become a spectrum through the FFT, at a price: you can know a frequency precisely, or know it soon, not both.',
  },
  {
    slug: 'harmonics',
    title: 'Harmonics & timbre',
    blurb:
      'A musical note is never just one frequency. The overtone stack riding on top is what turns a plain tone into someone in particular.',
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
      'Every analysis window collapses into the handful of streams a recognizer actually looks at: spectrum, peaks, envelope.',
  },
  {
    slug: 'building-a-recognizer',
    title: 'Building a recognizer',
    blurb:
      'Turning a feature stream into glyphs, from segmentation through confidence to the plugin contract that ties it together.',
  },
  {
    slug: 'dtmf-history',
    title: 'DTMF: history & why it works',
    blurb:
      'The dual-tone scheme wired into every phone keypad, and the deliberate choices that keep it readable through noise and crosstalk.',
  },
  {
    slug: 'fft-vs-goertzel',
    title: 'FFT vs. Goertzel',
    blurb:
      'The FFT measures every frequency at once; Goertzel only asks about the ones you care about. General-purpose versus purpose-built.',
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
