import { GoertzelFigure } from '../figures/fft-vs-goertzel-figure';

export default function FftVsGoertzel() {
  return (
    <>
      <p>
        Every chapter until now has leaned on one instrument: the FFT, the general-purpose
        measure-everything machine. Feed it 2,048 samples and it hands back 1,025 magnitudes — the
        entire frequency axis, itemized — and then you go hunting through the skyline for the two
        peaks you actually wanted. For a playground whose whole point is <em>watching</em>, that
        generosity is the feature. But step into the shoes of a 1970s telephone exchange, decoding
        digits on hardware with less arithmetic in it than a greeting card, and a question forms: if
        the only frequencies that will ever matter are DTMF’s eight, why compute the other 1,017
        answers at all?
      </p>
      <p>
        The <strong>Goertzel algorithm</strong> is that question, answered. It measures the energy
        at <em>one</em> known frequency as a two-tap recursive filter run across the block: two
        multiplies and two adds per sample, two state variables, and at the end a single magnitude —
        “how much 770 Hz is in here?” The implementation in <code>@sonoglyph/dsp</code> is a dozen
        lines. The probe frequency doesn’t even need to land on an FFT bin, because there are no
        bins; you ask about 770.0 Hz and get an answer about 770.0 Hz. Run eight probes and you have
        a complete DTMF front end — which is why Goertzel detectors, not FFTs, are the classic core
        of real-world DTMF decoding, from exchange line cards to modem chipsets.
      </p>
      <p>
        Be suspicious of the obvious next sentence, though — the one that says “and it’s much
        cheaper.” Do the honest arithmetic. Eight probes over a 2,048-sample block cost about 8 ×
        2,048 ≈ 16k multiply-adds. The FFT costs about N·log₂N ≈ 11 × 2,048 ≈ 22k butterfly steps —
        the same order. Goertzel’s real economies are subtler: no windowing pass, no magnitude
        normalization, no N-sized buffers of output to store, no peak-picking heuristics downstream,
        and the work scales with <em>how many questions you ask</em>, not with how finely the axis
        is diced. Ask one question and it’s twenty times cheaper than the FFT; ask a thousand and
        you’ve rebuilt a worse FFT. Eight sits comfortably on the right side of that line.
      </p>
      <p>
        There is no free lunch on resolution, either. A Goertzel probe over N samples has a main
        lobe about 2·fs/N wide — the same physics as an FFT bin, because it <em>is</em> the same
        physics: frequency selectivity is bought with observation time, whatever algorithm does the
        observing (<a href="/learn/fft-and-windowing">chapter 03</a>’s tradeoff, wearing a different
        hat). Shorten the block and the probe fattens exactly the way a bin does.
      </p>

      <GoertzelFigure />

      <p>
        What the figure demonstrates is the difference that <em>isn’t</em> about cost. The FFT
        strategy has to decide which parts of its 1,025 answers matter — peak-picking, a ranked
        shortlist (<a href="/learn/peak-detection">chapter 05</a>) — and ranking has a failure mode:
        it can be outvoted. Slide the chord in. Every added note is louder than the DTMF pair, every
        one outranks it, and by three notes the pair has been crowded off a four-deep shortlist
        entirely — the tones are still right there in the spectrum, plain to your eye, but the
        decoder’s shortlist is full of piano. The probes never rank anything. 770 Hz is one of the
        eight questions; a C-major chord is not; the answer doesn’t change. To be fair on the
        details: this pipeline’s FFT recognizer keeps sixteen peaks, not four, so it shrugs off this
        particular chord — but the depth of any shortlist is a guess about the world, and the probe
        strategy never has to make it.
      </p>
      <p>
        Both strategies live in this repo as recognizer plugins with the identical contract from{' '}
        <a href="/learn/building-a-recognizer">chapter 07</a> — <code>dtmf</code> reads the{' '}
        <code>peaks</code> stream, <code>dtmf-goertzel</code> reads raw <code>samples</code> and
        brings its own spectral opinion. That is the plugin architecture doing its job: strategy is
        the plugin’s business, and the pipeline cannot tell them apart. The Goertzel plugin also
        does something the shortlist can’t: because it watches the same eight frequencies forever,
        it learns a per-frequency noise floor from the room and reports each detection’s SNR — a
        purpose-built measurement, in the sense that matters.
      </p>
      <p className="aside">
        The playground runs both decoders side by side on live audio, with a toggle — and a
        benchmark panel that runs this exact Goertzel in TypeScript and in Rust compiled to WASM.
        The honest result: for a probe this small, WASM’s edge is modest or even negative, because
        copying the block across the JS↔WASM boundary costs more than the arithmetic saves.
        Purpose-built beats general-purpose only when you’ve measured the purpose.
      </p>
      <p>
        This is the last chapter of the manual, and it closes the loop the first one opened. Air
        became numbers (<a href="/learn/sound-and-sampling">01</a>), numbers became a spectrum (
        <a href="/learn/fft-and-windowing">03</a>), the spectrum became peaks (
        <a href="/learn/peak-detection">05</a>), peaks became features (
        <a href="/learn/feature-extraction">06</a>), features became glyphs (
        <a href="/learn/building-a-recognizer">07</a>) — and now you know two entirely different
        ways to build the middle of that chain, and why a sixty-year-old telephone standard (
        <a href="/learn/dtmf-history">08</a>) is still the perfect training ground. Sound became
        symbols. Go build a recognizer for something stranger.
      </p>
    </>
  );
}
