import { PeaksFigure } from '../figures/peak-detection-figure';

export default function PeakDetection() {
  return (
    <>
      <p>
        A spectrum is a picture. It is a very good picture: 1,025 magnitudes, one per bin, the whole
        frequency axis laid out like a skyline. But a recognizer cannot act on a skyline. It needs a
        claim:{' '}
        <em>
          there is a tone at 697.1 Hz, and another at 1209.3 Hz, and nothing else that matters
        </em>
        . Turning the picture into that short list of claims is peak detection, the pipeline’s first
        act of interpretation and the first stage that throws information away on purpose.
      </p>
      <p>
        The first half of the job is almost embarrassingly plain. Walk the bins (skipping DC and
        Nyquist, which are edges, not peaks) and collect every bin that beats both of its neighbors
        — a local maximum. Then refuse to be impressed: a bump only counts if it clears a floor, and
        the floor in <code>detectPeaks</code> is the greater of an absolute minimum and a fraction
        of the loudest thing in the frame. That <strong>relative threshold</strong> is what keeps a
        quiet room from reading as a thousand tiny discoveries; the noise is full of local maxima,
        and every one of them beats its neighbors by a hair.
      </p>
      <p>
        The second half is the part with a trick in it. An FFT bin at this pipeline’s defaults is
        23.4 Hz wide, and a real tone almost never lands on a bin center. Its energy piles up in the
        nearest bin, leaks into the neighbors, and the honest answer “the peak is in bin 30” means
        only “somewhere between 691 and 714 Hz.” That is not good enough. The DTMF recognizer in{' '}
        <a href="/learn/building-a-recognizer">chapter 07</a> checks measured frequencies against a
        ±2% tolerance — about ±14 Hz at 697 Hz — so a bin-center answer could burn most of the
        budget before the phone line adds a single hertz of trouble.
      </p>
      <p>
        The trick: near its top, a windowed spectral peak plotted in <em>log</em> magnitude is very
        nearly a parabola. So take the peak bin and its two neighbors, three points in all, fit the
        parabola through them, and read off where its vertex sits. The vertex offset,{' '}
        <code>p = ½(a−c)/(a−2b+c)</code> in the code, lands somewhere in the half-bin either side of
        the winner, and that fraction of a bin is the correction. Three log-magnitudes and one
        division recover the true frequency to a small fraction of a bin —{' '}
        <strong>parabolic interpolation</strong>, the whole reason a 23 Hz-resolution FFT can check
        a ±14 Hz tolerance and pass.
      </p>

      <PeaksFigure />

      <p>
        The figure runs the real detector on a DTMF-shaped pair: one tone you can drag between 690
        and 710 Hz (deliberately straddling bin centers), plus a fixed partner at 1209 Hz, plus
        seeded noise. Watch the table as you drag: the bin column barely moves (23 Hz steps), while
        the interpolated column tracks the slider in half-hertz steps. The zoom shows the machinery:
        bars are what the FFT reported, the curve is the fitted parabola, and the two vertical lines
        are the before and after — bin center versus vertex.
      </p>
      <p>
        Then raise the noise and watch the other failure mode arrive. Noise doesn’t bend the
        parabola much; interpolation degrades gracefully. But it does grow bumps that clear the
        floor, and each one becomes a “peak” with a confident-looking interpolated frequency
        attached. The detector cannot know which claims are real; it can only rank them by magnitude
        and pass them on. Deciding which peaks <em>mean</em> something is the recognizer’s job, and
        it brings its own defenses: tolerance bands, twist checks, and the 40 ms persistence rule.
      </p>
      <p className="aside">
        The thresholds are honest knobs, not magic. Set the relative threshold too low and noise
        becomes signal; too high and a quiet second tone vanishes — a real DTMF failure, since the
        network attenuates the two groups differently. The defaults here (1% of the loudest bin, at
        most 16 peaks) are tuned for the pipeline’s reference plugins, and every recognizer is free
        to re-detect from the raw spectrum with its own settings.
      </p>
      <p>
        Where this lands in the pipeline: the detector runs once per analysis frame and its output
        becomes the <code>peaks</code> feature stream (frequency, magnitude, and bin for each
        survivor, strongest first), which is all the FFT-strategy DTMF recognizer ever reads.{' '}
        <a href="/learn/feature-extraction">Chapter 06</a> is about that reduction in general;{' '}
        <a href="/learn/fft-vs-goertzel">chapter 09</a> shows the rival philosophy that skips
        peak-picking entirely and just asks eight pointed questions.
      </p>
    </>
  );
}
