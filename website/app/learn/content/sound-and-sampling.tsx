import { SamplingFigure } from '../figures/sampling-figure';

export default function SoundAndSampling() {
  return (
    <>
      <p>
        Every signal this project decodes — a telephone keypad, a Morse transmission, an alien chord
        — arrives the same way: as air, shoving. A loudspeaker cone pushes forward and the air in
        front of it compresses; it pulls back and the air rarefies. That ripple of pressure crosses
        the room at the speed of sound, and when it reaches a microphone it pushes on a diaphragm
        the way it would push on your eardrum. Up to this point, nothing is digital. The wave is{' '}
        <em>continuous</em>: between any two instants there are infinitely many more, each with its
        own pressure.
      </p>
      <p>
        A computer cannot hold infinitely many anything. So the very first stage of the pipeline
        performs the one great trick all of digital audio rests on: it <strong>measures</strong>.
        Thousands of times per second, at perfectly regular intervals, the converter reads the
        diaphragm’s position and writes it down as a number. Each number is a{' '}
        <strong>sample</strong> — the amplitude of the wave at one instant, on a scale from −1 (as
        far as the hardware swings one way) to +1 (as far as it swings the other). That is the
        entire secret. Sound, in this codebase and every other, is a list of floats.
      </p>
      <p>
        Two knobs completely describe the measurement. The <strong>sample rate</strong> is how often
        you look — this pipeline’s default is 48,000 samples per second, the same rate professional
        audio gear uses. The <strong>amplitude</strong> of each sample is what you saw when you
        looked. Loudness lives in the amplitudes; pitch, timbre, and everything else live in how the
        amplitudes <em>change</em> from sample to sample.
      </p>

      <SamplingFigure />

      <p>
        Drag the sample rate down and watch the measurement thin out. At 48 kHz the dots are so
        dense they redraw the wave; at 4 kHz you can count nine of them per cycle; at 1 kHz the dots
        barely sketch it. Press play at each setting — what you hear is reconstructed from exactly
        the dots you see, and a 440 Hz tone survives even the coarse settings surprisingly well.
        There is a hard limit on how coarse you can go, and it is sharper and stranger than “the
        sound gets worse” — that cliff edge is <a href="/learn/nyquist">chapter 02</a>.
      </p>

      <h2>The pipeline doesn’t care where samples come from</h2>
      <p>
        Everything downstream of the converter — the FFT, the feature streams, the recognizers, the
        glyphs — operates on that plain list of numbers. This is a load-bearing fact about the
        architecture. A live microphone, an uploaded WAV file, and a tone synthesized in code all
        produce the same thing: a <code>Float32Array</code> at a known sample rate. The pipeline
        processes all three through identical code, which is why every demo in this manual runs the{' '}
        <em>real</em> engine on synthesized signals, and why the test suite can feed the exact
        pipeline the microphone uses without ever opening one.
      </p>
      <p>
        The figure above is doing it right now: each buffer is built by <code>sine()</code> from{' '}
        <code>@sonoglyph/dsp</code> — the same generator the unit tests and the playground’s keypad
        use — and playback hands those numbers straight to your sound card, which performs the whole
        trick in reverse: numbers back to voltages, voltages back to a moving cone, cone back to
        shoved air.
      </p>
      <p className="aside">
        Why 48,000? Human hearing tops out near 20 kHz, and chapter 02 will show that capturing a
        frequency takes a hair more than two samples per cycle — so anything above ~40 kHz covers
        the whole audible band, with margin for the hardware’s filters. 44,100 (the CD rate) and
        48,000 (the film/video rate) are the two conventions that stuck; browsers and audio
        interfaces overwhelmingly run at 48 kHz today, so this pipeline does too.
      </p>
      <p>
        One second of one microphone is 48,000 numbers; a minute is nearly three million. Nothing
        about a raw sample says “this is a 7” or “this is the letter S.” The rest of the manual is
        the story of earning that meaning back, one stage at a time: samples to a{' '}
        <a href="/learn/fft-and-windowing">spectrum</a>, a spectrum to{' '}
        <a href="/learn/peak-detection">peaks</a>, peaks to{' '}
        <a href="/learn/feature-extraction">features</a>, features to{' '}
        <a href="/learn/building-a-recognizer">glyphs</a>. Watch sound become symbols.
      </p>
    </>
  );
}
