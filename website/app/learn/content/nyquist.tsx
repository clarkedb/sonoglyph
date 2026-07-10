import { NyquistFigure } from '../figures/nyquist-figure';

export default function Nyquist() {
  return (
    <>
      <p>
        <a href="/learn/sound-and-sampling">Chapter 01</a> ended at a cliff edge. The sample-rate
        slider felt forgiving. A 440 Hz tone survived 4 kHz, even 1 kHz, sounding rougher but
        recognizably itself. That forgiveness has a floor, and the floor is exact: to capture a wave
        you need <em>more than two samples per cycle</em>. The intuition is almost physical. A cycle
        goes up and comes down; if you want to know it happened, you must catch it at least once on
        the way up and once on the way down. Sample any slower and entire swings of the wave happen
        between your measurements, unrecorded.
      </p>
      <p>
        Turned around, that floor becomes a ceiling. A converter running at a sample rate{' '}
        <em>fs</em> can faithfully capture any frequency below <em>fs</em>/2. That boundary is
        called the <strong>Nyquist frequency</strong>, after Harry Nyquist, the Bell Labs engineer
        who worked out the limit in the 1920s (Claude Shannon proved the full theorem in 1949). At
        48 kHz the ceiling is 24 kHz; at the 8 kHz rate telephones use, it is 4 kHz. Below the
        ceiling, the samples pin down one and only one wave. The theorem’s promise is stronger than
        it first sounds: not “a decent approximation,” but <em>perfect</em> reconstruction, in
        principle, of everything under the limit.
      </p>
      <p>
        Here is the strange part — the part that makes this a cliff and not a slope. Feed a
        converter a tone <em>above</em> its ceiling and the samples don’t degrade. They{' '}
        <strong>lie</strong>. A 5,000 Hz tone sampled at 8 kHz produces a list of numbers that is,
        sample for sample, identical to the list a 3,000 Hz tone would produce. The frequency folds
        back around the ceiling like a ruler creased at the 4 kHz mark: the recorded frequency is |
        <em>f</em> − <em>fs</em>·round(<em>f</em>/<em>fs</em>)|. This is <strong>aliasing</strong>.
        The high tone travels under an assumed name, and nothing in the data betrays it.
      </p>

      <NyquistFigure />

      <p>
        Sweep the slider. Below 4,000 Hz there is one wave and twenty dots riding it. Cross the
        ceiling and a second sine appears, dashed: that is the alias. Notice what the figure is{' '}
        <em>not</em> doing: it isn’t drawing an error band or an approximation. Both curves are
        honestly computed, and both pass through every dot exactly, because at 8,000 samples per
        second they are the same list of numbers. Then press play. The tone is synthesized at 48
        kHz, where 7,000 Hz exists comfortably, and then decimated to 8 kHz by keeping every sixth
        sample — no filter, which is precisely the mistake. Sweep upward past 4 kHz and the pitch
        you hear stops rising and comes back down; by 7,800 Hz the converter swears it heard 200 Hz.
      </p>

      <h2>The information is gone</h2>
      <p>
        The reflex is to ask which algorithm fixes this. None does, and it’s worth sitting with why:
        aliasing isn’t distortion layered on top of a signal, like hiss or clipping, where the
        original is still in there somewhere, damaged. Two different waves produced{' '}
        <em>the same numbers</em>. Once only the numbers remain, no computation — not a cleverer
        FFT, not machine learning, nothing — can decide which wave made them, for the same reason
        you can’t un-add two numbers knowing only their sum. The information was never captured.
        Every stage downstream of the converter, in this pipeline and any other, inherits whatever
        fiction the samples tell.
      </p>
      <p className="aside">
        You have seen aliasing with your own eyes. A film camera is a sampler too, running at 24
        frames per second, and a wagon wheel or helicopter rotor spinning faster than 12 revolutions
        per second folds back exactly the same way, appearing to slow, stop, or turn lazily backward
        on screen. Same theorem, different converter.
      </p>
      <p>
        So real systems refuse to let the crime happen. In front of every analog-to-digital
        converter sits an <strong>anti-alias filter</strong>: an analog low-pass that removes
        everything above <em>fs</em>/2 <em>before</em> it is ever measured. It must live in the
        analog world: by the time software could act, the folding is already in the numbers. (Modern
        converters actually sample far above the target rate and do most of the filtering digitally
        where it’s cheap and precise, but the principle is untouched: filter first, then commit to
        samples.) The figure’s play button skips this filter deliberately; your audio hardware never
        does.
      </p>

      <h2>The margin this pipeline runs on</h2>
      <p>
        What does the ceiling mean for this codebase? At the pipeline’s default 48 kHz, everything
        below 24 kHz is safe, comfortably past the ~20 kHz edge of human hearing, with the
        anti-alias filtering handled by the audio interface before a single{' '}
        <code>Float32Array</code> reaches the engine. And the signals this project decodes sit
        nowhere near the edge. DTMF’s highest tone is 1,633 Hz, a fourteenth of the ceiling. That is
        not an accident of generosity; it is inherited history. DTMF was engineered for telephone
        lines, whose 8 kHz sampling and ~3.4 kHz voice band meant every signaling tone had to live
        below a 4 kHz ceiling — a story <a href="/learn/dtmf-history">chapter 08</a> tells properly.
        The figure’s converter runs at 8 kHz for exactly that reason: it is the rate at which this
        ceiling shaped real engineering for a century.
      </p>
      <p>
        The theorem also quietly labels an axis you are about to meet. When{' '}
        <a href="/learn/fft-and-windowing">chapter 03</a> turns a window of samples into a spectrum,
        the frequency axis will run from 0 up to <em>fs</em>/2 and stop — not because the math gets
        tired, but because you now know there is nothing past that line for the samples to say. The
        Nyquist frequency isn’t a limit on the FFT. It is a limit on what the numbers ever knew.
      </p>
    </>
  );
}
