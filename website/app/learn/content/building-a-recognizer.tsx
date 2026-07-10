import { RecognizerFigure } from '../figures/building-a-recognizer-figure';

export default function BuildingARecognizer() {
  return (
    <>
      <p>
        Everything so far has been measurement. <a href="/learn/feature-extraction">Chapter 06</a>{' '}
        ended with the pipeline emitting tidy feature frames — a spectrum, a peak list, an envelope,
        every 10.7 milliseconds — and none of it <em>means</em> anything yet. This chapter crosses
        that line. A recognizer is the component that stares at the feature stream and commits:{' '}
        <em>that was a 5</em>. In this codebase it is also the component you are most likely to
        write yourself, so the contract deserves a close look.
      </p>
      <p>
        The contract is push-in, emit-out. A plugin declares which streams it needs, the pipeline
        calls its <code>process(frame)</code> for every frame of those streams, and the plugin emits
        a <strong>glyph</strong> through <code>onGlyph</code> whenever it has accumulated enough
        evidence — which is almost never on the frame that convinced it. Recognition is rarely a
        per-frame classification, because signals live in time: DTMF needs a tone to{' '}
        <em>persist</em>, Morse is nothing but durations. So plugins are deliberately stateful —
        little machines that remember what they have seen and decide when a run of evidence has
        opened and closed.
      </p>
      <p>
        The glyph itself is the framework’s central abstraction: a symbol, a time span, a
        confidence, and a plugin-defined payload. The payload is the part to appreciate — it is the
        recognizer showing its work. A DTMF glyph doesn’t just say <code>“5”</code>; it carries the
        measured frequencies, the nominals it matched, and the level difference between the two
        tones, so anything downstream (a timeline, a debugger, a skeptical engineer) can ask{' '}
        <em>why did you decide that?</em> and get an answer.
      </p>
      <p>
        The DTMF recognizer makes a good anatomy lesson because it decomposes into three honest
        stages. <strong>Classify</strong>: per frame, do the detected peaks contain exactly one
        low-group and one high-group tone, each within ±2% of a nominal, at compatible levels? That
        yields a symbol-or-nothing verdict every 10.7 ms. <strong>Segment</strong>: don’t believe
        one frame. The same symbol must persist for at least 40 ms — the debounce the Bell spec
        demanded of hardware decoders in 1963 (<a href="/learn/dtmf-history">chapter 08</a>) — and a
        gap of at least 25 ms must separate repeated digits, or <code>555</code> would collapse into
        one long 5. <strong>Finalize</strong>: when the run closes, aggregate it — average the
        measured frequencies across the run, score the confidence — and emit one glyph. Which is why
        the digit appears as the tone <em>ends</em>, not as it begins: the recognizer cannot know
        the run is over until silence proves it.
      </p>

      <RecognizerFigure />

      <p>
        The figure runs the real plugin and exposes all three stages. Each square is one frame of
        the peaks stream with its classification verdict; the bracket underneath is the segmenter’s
        run; the chip is the finalized glyph. The two failure modes are worth producing on purpose.
        Shrink the tone to 30 ms: frames classify happily — the evidence is <em>there</em> — but the
        run never reaches 40 ms, so the segmenter discards it and no glyph appears. Now detune the
        low tone by 3%: the frames themselves go dark, because classification fails before
        segmentation ever gets a vote. Two different stages, two different refusals, and the readout
        tells you which one said no.
      </p>
      <p>
        Confidence deserves a word, because it is earned, not decorative. The recognizer scores how
        close the measured frequencies sat to their nominals relative to the tolerance band — a
        dead-center pair scores near 1.0, a pair scraping the ±2% edge scores low. Downstream
        consumers can set their own bar: a dialer might act on 0.6, a logger might record
        everything. The glyph carries the number; the policy stays out of the plugin.
      </p>
      <p className="aside">
        Most recognizers never write the segmentation machinery themselves. The plugin SDK’s{' '}
        <code>defineRecognizer</code> takes a pure per-frame classifier — a single function — and
        wraps it in the same debounce/gap/finalize state machine the DTMF plugin uses. The Morse
        recognizer is built on it too, even though its “classifier” is just an RMS threshold on the
        envelope stream: key down or key up. Write the one-liner, get the state machine free.
      </p>
      <p>
        One last clause in the contract, easy to miss and very deliberate: plugins fail{' '}
        <em>alone</em>. The pipeline catches a plugin that throws, reports it, and keeps delivering
        frames to everyone else — because Phase 2’s plugins are written by strangers sharing a live
        pipeline, and one broken recognizer must not silence the rest. Add <code>flush()</code> for
        end-of-stream (a file can end mid-tone; something must close the run) and{' '}
        <code>reset()</code> for source changes, and that is the entire surface: a recognizer is{' '}
        <code>process</code>, <code>onGlyph</code>, and honesty about time. The next two chapters
        put the contract under stress —{' '}
        <a href="/learn/dtmf-history">why DTMF’s numbers are what they are</a>, and{' '}
        <a href="/learn/fft-vs-goertzel">
          two rival strategies implementing the same plugin interface
        </a>
        .
      </p>
    </>
  );
}
