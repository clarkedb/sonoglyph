import { HarmonicsFigure } from '../figures/harmonics-figure';

export default function Harmonics() {
  return (
    <>
      <p>
        Physics classrooms love the tuning fork because it is the one sound-maker that behaves:
        strike it and it rings at almost exactly one frequency, a single clean spike on the
        spectrum. Almost nothing else in the world is that polite. Pluck a guitar string and it does
        not pick one motion — it vibrates along its whole length, <em>and</em> in two halves,{' '}
        <em>and</em> in three thirds, and in ever-smaller subdivisions, all at the same time. Each
        of those shapes rings at its own rate: the whole string at some frequency f₀, the halves at
        exactly 2·f₀, the thirds at 3·f₀, and so on up. One plucked note is not one frequency. It is
        a <em>stack</em>.
      </p>
      <p>
        The members of the stack are called <strong>harmonics</strong>: whole-number multiples of
        the <strong>fundamental</strong>, f₀. (Everything above the fundamental also goes by{' '}
        <strong>overtones</strong> — same idea, counted from one rung up.) Point the FFT from{' '}
        <a href="/learn/fft-and-windowing">chapter 03</a> at any real instrument and this is what
        you get: not a lone spike but a picket fence, spikes marching up the spectrum at f₀, 2·f₀,
        3·f₀, each one shorter or taller than its neighbors depending on what made the sound.
      </p>
      <p>
        And that dependence is the whole story of why things sound like themselves. Your ear assigns
        the <em>note</em> from the fundamental — a stack built on 220 Hz is heard as the A below
        middle C no matter what rides above it. Everything else about the sound’s character lives in
        the <em>recipe</em>: the relative heights of the harmonics. That recipe is{' '}
        <strong>timbre</strong>. A violin and a flute playing the same A have the same fundamental,
        yet you will never confuse them, because the violin pours energy high into the stack and the
        flute keeps its tone nearly pure. Your friend’s voice is your friend’s voice for the same
        reason: their vocal folds buzz out a harmonic stack, and the particular shape of their
        throat and mouth boosts some harmonics and swallows others. The pitch is the message; the
        recipe is the signature.
      </p>
      <p>
        A few recipes are famous enough to have names, and the math is simple enough to hear. Take
        only the odd harmonics at heights 1/n and the sum squares off into a — well, a{' '}
        <strong>square wave</strong>, the buzzy tone of early video games. Take <em>every</em>{' '}
        harmonic at 1/n and you get the brassy rip of a <strong>sawtooth</strong>. Odd harmonics
        again but falling off as 1/n² — much less energy up high — and you get the soft, hollow{' '}
        <strong>triangle</strong>. The figure below builds each recipe the honest way: eight{' '}
        <code>ToneSpec</code>s summed by <code>tones()</code> from <code>@sonoglyph/dsp</code>, then
        handed to the same FFT the pipeline runs.
      </p>

      <HarmonicsFigure />

      <p>
        Switch between recipes and watch both views. The waveform reshapes completely — smooth
        curve, squared shoulders, ramps, ripples — while the spectrum tells you exactly why, one
        spike per harmonic, heights tracking the recipe. Now press play after each switch. The pitch{' '}
        <em>never moves</em>. Every one of these waveforms repeats 220 times per second, so every
        one is the same A; only the voice saying it changes. The brightness slider is a tone knob:
        it scales harmonic k by brightness^(k−1), dimming the top of the stack first, and at zero
        every recipe collapses back into the tuning fork’s pure sine.
      </p>
      <p className="aside">
        One ingredient is conspicuously missing from the recipe: phase. <code>tones()</code> starts
        every harmonic at zero, but you could slide each one’s starting angle anywhere — the
        waveform would contort into something unrecognizable, and it would sound almost exactly the
        same. To a good first approximation the ear reads the magnitudes of the stack and shrugs at
        their alignment, which is why spectrum displays, and most recognizers, throw phase away
        without regret.
      </p>

      <h2>Why a recognizer must expect the stack</h2>
      <p>
        This matters to Sonoglyph because real signals arrive wearing their overtones. The
        playground’s keypad synthesizes mathematically pure sine pairs, but a human whistling or
        humming a tone near 697 Hz — the top row of a telephone keypad — delivers a stack: real
        energy at 1,394 Hz, some at 2,091 Hz, trailing on up. A naive recognizer that treats{' '}
        <em>any</em> strong spike as an independent tone would read that 1,394 Hz harmonic as a
        second signal, sitting squarely inside DTMF’s high-frequency band. It lands on none of the
        four high-group frequencies, though — and that is no accident. The engineers who chose
        DTMF’s eight frequencies in the 1950s picked them so that no tone’s harmonic falls on any
        other tone, a piece of numerical craftsmanship <a href="/learn/dtmf-history">chapter 08</a>{' '}
        unpacks in full.
      </p>
      <p>
        So a recognizer worthy of the name holds two ideas at once: a spike at 2·f₀ is{' '}
        <em>evidence about</em> the tone at f₀, not a second tone; and the frequencies worth
        trusting are the ones that survive scrutiny — persistent, well-placed, sensibly proportioned
        against their neighbors. The DTMF recognizer in this codebase checks that the two
        frequencies it accepts come one from each designated group, and even compares their heights
        (the “twist”), because a legitimate keypress has a predictable balance and a stray harmonic
        does not.
      </p>
      <p>
        Every claim in this chapter is one glance away in the spectrum view — it is the instrument
        that makes the invisible stack visible. Open the playground, hum at the microphone, and your
        own overtone stack marches across the display in real time. The next question is how a{' '}
        <em>machine</em> reads that picture: turning a forest of spikes into a short, honest list of
        frequencies is <a href="/learn/peak-detection">chapter 05</a>, and it is harder than it
        looks — partly because, as you now know, the tallest spikes are not all independent tones.
      </p>
    </>
  );
}
