import { FeaturesFigure } from '../figures/feature-extraction-figure';

export default function FeatureExtraction() {
  return (
    <>
      <p>
        Here is a fact about this pipeline that surprises people: the recognizers never see samples.
        The DTMF plugin that decodes a phone keypad has no idea what a <code>Float32Array</code> of
        air pressure looks like. By the time a recognizer gets involved, the 48,000 numbers per
        second from <a href="/learn/sound-and-sampling">chapter 01</a> have already been distilled —
        windowed, transformed, measured — into a much smaller stream of <strong>features</strong>:
        descriptions of the signal a recognizer can actually reason about. This chapter is about
        that hand-off, the seam in the architecture where DSP ends and recognition begins.
      </p>
      <p>
        The obvious design is a single “feature vector” — one struct, computed once per analysis
        window, handed to every plugin. This pipeline deliberately doesn’t have one, because
        different signal systems want <em>fundamentally</em> different descriptions. DTMF wants
        dominant frequency pairs. Morse wants an amplitude envelope over time and could not care
        less about frequency. A chord recognizer wants harmonic relationships. Force all of that
        into one shape and you get either a kitchen-sink union that grows a field per plugin
        forever, or a lowest common denominator so thin that every plugin bypasses it and recomputes
        what it actually needed.
      </p>
      <p>
        So the engine produces <strong>named, versioned feature streams</strong> instead. Four exist
        today. <code>spectrum</code> is the windowed FFT magnitudes from{' '}
        <a href="/learn/fft-and-windowing">chapter 03</a> — one full frequency picture per frame.{' '}
        <code>peaks</code> is the distilled version from{' '}
        <a href="/learn/peak-detection">chapter 05</a>: just the frequencies that matter, sharpened
        below one bin. <code>envelope</code> is the loudness of the frame, nothing more.{' '}
        <code>samples</code> is the escape hatch — the raw, unwindowed samples of the analysis
        frame, for plugins that insist on owning their own spectral strategy (the Goertzel DTMF
        recognizer in <a href="/learn/fft-vs-goertzel">chapter 09</a> is one). Each plugin declares
        in its metadata which streams it requires, and the pipeline delivers each stream’s frames
        only to the plugins that asked. Future streams — pitch, chroma, mel coefficients — get added
        as plugins need them, without touching anyone else.
      </p>

      <h2>Anatomy of a frame</h2>
      <p>
        Every stream delivers its data in the same wrapper, a <strong>FeatureFrame</strong>, and its
        fields are worth reading slowly because recognizers live and die by them:{' '}
        <code>stream</code> (which stream this is), <code>version</code> (the stream’s schema
        version, so a stream can evolve without breaking plugins written against the old shape),{' '}
        <code>time</code> (where the frame starts, in seconds of stream time), <code>span</code>{' '}
        (how many seconds of signal the frame describes), <code>hop</code> (seconds until the next
        frame), and <code>data</code> (the stream-specific payload). Half of that wrapper is time
        bookkeeping, and that is not an accident. The glyphs that come out the far end of the
        pipeline carry a start and a duration — “a <em>7</em> from 1.20 s to 1.38 s” — and
        segmentation, the heart of <a href="/learn/building-a-recognizer">chapter 07</a>, is
        entirely a matter of durations. A recognizer can only say “this tone persisted 180 ms”
        because every frame it consumed told it exactly when it was.
      </p>
      <p>
        The <code>hop</code> is the subtle one. At this engine’s defaults, the analysis window is
        2,048 samples and the hop is 512 — so windows <em>overlap</em>, each frame sharing three
        quarters of its samples with the last. A fresh frame arrives every 512 samples, one every
        10.7 ms, and each one describes 42.7 ms of signal. That steady tick is the pipeline’s{' '}
        <strong>frame clock</strong>: every stream ticks on it together, so a recognizer reading
        peaks and a visualization reading the spectrum are always describing the same instant. The
        figure below puts your hand on that clock.
      </p>

      <FeaturesFigure />

      <p>
        The scene in the figure is two signals this manual keeps returning to: a keypad <em>5</em>{' '}
        (two tones at once, 770 and 1336 Hz) and then a Morse <em>S</em> (three 80 ms dots of 600
        Hz). The whole buffer ran through the real engine, offline, and every frame was kept. Scrub
        slowly across the leading edge of the key press and watch the rms climb over about four
        frames rather than jumping — those are the overlapping windows straddling the edge, each
        catching a little more tone than the last. Meanwhile <code>span</code> and <code>hop</code>{' '}
        in the readout never move. The clock doesn’t care what the signal is doing; that
        indifference is what makes durations measurable.
      </p>

      <h2>Two numbers are enough to read Morse</h2>
      <p>
        Look at what the envelope stream actually contains: <code>rms</code> and <code>peak</code>.
        Two floats per frame. It is almost embarrassing next to the 1,025-bin spectrum riding the
        same clock — and yet it is <em>everything</em> the Morse recognizer reads. The playground’s
        own explainer states it flatly: the recognizer reads only the amplitude envelope — never the
        spectrum — so the pitch is irrelevant. Key your dots at 600 Hz or 900 Hz or whistle them;
        the recognizer sees the same on/off rhythm either way, because dots and dashes are durations
        of loudness, not frequencies. Being pitch-blind isn’t a limitation, it’s the design:
        choosing the right stream means the recognizer never has to ignore information it shouldn’t
        have been handed in the first place.
      </p>
      <p className="aside">
        Why both rms and peak? Rms tracks the energy of the whole 42.7 ms frame — steady, hard to
        fool, the number the Morse recognizer thresholds against. Peak catches the single loudest
        sample, which is how you notice a click or clipping that rms would average away. Two views
        of “how loud,” each honest about a different thing.
      </p>
      <p>
        There is one more principle hiding in this figure: <strong>observability</strong>. The
        readout in zone (3) isn’t a diagram of roughly what flows through the pipeline — it{' '}
        <em>is</em> the frame, the exact object a plugin’s <code>process()</code> would receive at
        that instant, and the playground’s features panel shows the same thing live. When a
        recognizer misbehaves, you don’t guess what it saw; you scrub to the frame and look. Every
        stage of this pipeline is inspectable the same way, on the same clock, and{' '}
        <a href="/learn/building-a-recognizer">chapter 07</a> uses exactly that: it takes the frames
        you just scrubbed through and walks them into a recognizer, one tick at a time, until a
        glyph falls out.
      </p>
    </>
  );
}
