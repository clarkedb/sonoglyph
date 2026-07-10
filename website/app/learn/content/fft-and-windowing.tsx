import { WindowingFigure } from '../figures/fft-and-windowing-figure';

export default function FftAndWindowing() {
  return (
    <>
      <p>
        <a href="/learn/sound-and-sampling">Chapter 01</a> left us holding 48,000 numbers per
        second, and <a href="/learn/nyquist">chapter 02</a> told us which frequencies those numbers
        can faithfully contain. Neither answered the question a decoder actually asks:{' '}
        <em>which frequencies is this signal made of, right now?</em> That question has a famous
        answer. The <strong>Fourier transform</strong> takes a block of samples and re-describes it
        — losslessly, reversibly — as a sum of sine waves. Feed it a block of N samples and it hands
        back N/2 + 1 <strong>bins</strong>, one magnitude for each frequency from 0 Hz up to the
        Nyquist limit, each bin covering a slice of spectrum exactly{' '}
        <code>sampleRate / windowSize</code> hertz wide. The wiggling line becomes a skyline: a
        spike wherever the signal has energy, silence between.
      </p>
      <p>
        The <strong>FFT</strong> — the <em>fast</em> Fourier transform — is not a different
        transform, just the trick that makes it affordable: instead of comparing the block against
        every sine wave separately (N² multiplications), it splits the problem in half, then in half
        again, log₂(N) times. The engine that computes every spectrum in this pipeline lives in{' '}
        <code>packages/dsp/src/fft.ts</code>, and its header says why it looks the way it does: a
        radix-2 Cooley–Tukey FFT, “hand-rolled on purpose: this implementation is meant to be read.”
        It is about sixty lines — a bit-reversal shuffle, then log₂(N) passes of little two-point
        “butterfly” merges with precomputed twiddle factors — and every figure in this chapter runs
        it for real. No library, no black box; you can open the file and watch the whole trick.
      </p>
      <p>
        Now the catch, and it is <em>the</em> catch — the central tradeoff of this entire field. The
        bin width is <code>sampleRate / windowSize</code>, so the only way to get finer frequency
        detail is to analyze a longer block of time. At 48 kHz, a 2048-sample window is 42.7 ms of
        signal and yields 23.4 Hz bins. Grow it to 8192 samples and the bins sharpen to 5.9 Hz — but
        now each spectrum describes 171 ms of the past, and anything that happened inside that
        window is smeared into one answer. Shrink it to 512 samples and the analysis reacts in 10.7
        ms, but the bins fatten to 93.8 Hz and neighboring tones melt together. You can resolve
        close-together frequencies, or you can notice events quickly. Never both. This is not a flaw
        in the code; it is an uncertainty principle, and no cleverness removes it — you only get to
        choose where it hurts.
      </p>

      <WindowingFigure />

      <p>
        The figure opens at the setting where this project lives: two equal tones 73 Hz apart — the
        true spacing of the telephone keypad’s low group — under a 2048-sample window. Two clean
        spikes, a valley between, and the guides landing on top of each. Now drop the window size to
        1024 and watch the spikes fuse into one fat peak: Δ is only 1.6 bins, and no downstream
        logic can recover what the transform already blurred. Widen Δ with the slider and the pair
        separates again even at small windows. Press play — the <em>sound</em> never changes when
        you change the window. Only the measurement does, which is exactly the point.
      </p>

      <h2>The seam, and why we taper it</h2>
      <p>
        The second control — the window <em>function</em> — exists because of a quiet assumption
        buried in the math. The Fourier transform doesn’t know your 2048 samples are a snippet; it
        treats them as one period of a signal that repeats forever, end spliced to beginning, for
        all time. A raw slice almost never cooperates: the wave exits the right edge mid-swing and
        re-enters the left edge somewhere else entirely. To the transform that splice is real — a
        sudden jump, and a jump is a click, and a click contains energy at <em>every</em> frequency.
        So a pure tone that should occupy one bin grows skirts that drape across the whole spectrum.
        The effect is called <strong>spectral leakage</strong>, and the fix is almost embarrassingly
        physical: before transforming, multiply the block by a curve that tapers smoothly to zero at
        both edges. Zero splices to zero. The seam is gone.
      </p>
      <p>
        The tapering curve is the <strong>window function</strong>, and the engine ships four (
        <code>packages/dsp/src/window.ts</code> — another file meant to be read).{' '}
        <em>Rectangular</em> is no window at all: the narrowest possible spike but the worst skirts
        — flip the figure to it and watch the leakage rise. <em>Hann</em>, the pipeline’s default,
        is one smooth cosine arch from zero to zero. <em>Hamming</em> is Hann adjusted to hover just
        above zero at the edges, tuned to cancel the nearest sidelobe. <em>Blackman</em> adds a
        second cosine term and buys the lowest skirts of the four. What you are trading is always
        the same pair of goods: how far down the skirts sit versus how wide the central spike
        swells. Taper harder and leakage falls, but each spike fattens — the same resolution
        currency the window <em>size</em> spends, collected by a different tollbooth.
      </p>
      <p className="aside">
        The algorithm is older than its name. Cooley and Tukey published in 1965, when the cold war
        wanted to distinguish Soviet nuclear tests from earthquakes in seismometer data — and only
        later did historians find the same recursion in Gauss’s unpublished notebooks from 1805,
        invented to interpolate asteroid orbits. The FFT was discovered twice, both times to listen
        to the ground and the sky.
      </p>
      <p>
        The tradeoff stops being abstract the moment a real signal shows up. DTMF’s low group sits
        at 697, 770, 852, and 941 Hz — neighbors just 73 Hz apart. At 48 kHz, separating them
        cleanly needs bins meaningfully narrower than that spacing: a 2048-sample FFT (23.4 Hz bins)
        is the floor, and 4096 (11.7 Hz) is comfortable. That is a 43–85 ms analysis window against
        key presses the standard allows to be as short as 40 ms — the recognizer in{' '}
        <a href="/learn/building-a-recognizer">chapter 07</a> lives its whole life inside that
        squeeze. It is exactly why the engine’s default window is 2048 samples: the smallest power
        of two that keeps a telephone keypad legible.
      </p>
      <p>
        A spectrum, though, is still just N/2 + 1 numbers — nothing in it says “here are the two
        tones.” Picking the spikes out of the skyline, and pinning them down <em>finer</em> than one
        bin, is <a href="/learn/peak-detection">chapter 05</a>. Before that,{' '}
        <a href="/learn/harmonics">chapter 04</a> uses the spectrum to answer an older question —
        why a piano and a trumpet playing the same note look nothing alike up here. And much later,{' '}
        <a href="/learn/fft-vs-goertzel">chapter 09</a> asks the heretical one: if you already know
        the eight frequencies you care about, why measure a thousand?
      </p>
    </>
  );
}
