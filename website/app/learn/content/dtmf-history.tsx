import { DtmfMatrixFigure } from '../figures/dtmf-history-figure';

export default function DtmfHistory() {
  return (
    <>
      <p>
        Before every telephone had a keypad, it had a wheel. To dial a 7 you put a finger in the
        seventh hole, wound the dial around to the finger stop, and let go. A spring spun it home
        against a governor, and on the way back a switch broke the line’s direct current seven
        times, about ten clicks a second. This is <strong>pulse dialing</strong>, and it is worth
        pausing on how wonderfully mechanical it is: your finger wound a spring, the spring timed a
        switch, and the switch <em>was</em> the message. At the exchange, electromechanical steppers
        counted the clicks and physically ratcheted your call one stage closer to its destination.
      </p>
      <p>
        It had two problems. The first was speed: zero cost ten pulses, so a long number meant
        ten-plus seconds of winding and whirring. The second was fatal. The clicks are not sound;
        they are the line itself switching off and on, and that only means anything across one
        continuous loop of copper between your dial and the switch. By the late 1950s the network
        was outgrowing exactly that. Calls rode amplifiers, frequency-multiplexed carriers,
        microwave hops, and — soon — computer-controlled exchanges, and the interrupted-current
        trick dies at the first amplifier it meets. Across all of it, only one thing is guaranteed
        to survive end to end, because carrying it is the network’s entire job: audio in the voice
        band, roughly 300–3,400 Hz.
      </p>
      <p>
        Bell Labs’ answer was to move dialing <em>into the voice band itself</em>. If the network
        can carry your voice, it can carry your dialing as sound. They demonstrated it at the 1962
        World’s Fair in Seattle, and in November 1963 it went on sale in two Pennsylvania towns
        under the trade name <strong>Touch-Tone</strong>. The scheme underneath is{' '}
        <strong>DTMF</strong> — dual-tone multi-frequency — and the hard part was never making the
        sounds. It was choosing them: sounds a machine can detect reliably through noise, hum, and
        distortion, and that a human voice or a burst of hold music will almost never counterfeit.
        Detector engineers had a word for that failure: <strong>talk-off</strong>, a decoder tripped
        by speech. The design that emerged is a fortress against it, three decisions deep.
      </p>
      <p>
        The first decision: no key is one tone. Every key is <em>two simultaneous tones</em>, one
        from a low group (697, 770, 852, 941 Hz) and one from a high group (1209, 1336, 1477, 1633
        Hz). The groups form a grid — the low tone names the row, the high tone names the column,
        and row + column is the key. Sixteen symbols from eight oscillators, and a receiver that
        demands exactly one tone from each group at the same instant, which no single whistle, hum,
        or note can satisfy. The fourth column, A–D, never reached home telephones, but it is in the
        spec, and on this manual’s keypads.
      </p>

      <DtmfMatrixFigure />

      <p className="aside">
        The fourth column’s day job was military. On AUTOVON, the U.S. armed forces’ telephone
        network, A through D marked a call’s precedence — up to Flash Override, which could seize
        trunks from any call beneath it. AUTOVON was retired decades ago; the four tones outlived
        the network they were built for, and every full DTMF decoder still recognizes them.
      </p>

      <h2>The arithmetic that rejects voices</h2>
      <p>
        The second decision is the quiet masterpiece, and the figure above lets you check it.
        <a href="/learn/harmonics"> Chapter 04</a> showed that nearly everything with a pitch (a
        voice, a plucked string, hold music) is a harmonic stack: energy at a fundamental and at its{' '}
        <em>integer multiples</em>. The eight DTMF frequencies were chosen to be{' '}
        <strong>inharmonic</strong>: none is an integer multiple of another, and for any valid pair,
        the byproducts a real-world source or an overdriven line would add — the doubled and tripled
        tones, and their sum — fall between the nominals instead of on them, never closer than about
        58 Hz. Press keys in FIG. 1 and watch the markers thread the gaps.
      </p>
      <p>
        Turn that around and it becomes a filter. A hummed note puts its energy exactly on integer
        multiples of one fundamental, and there is no plausible fundamental whose harmonics land on,
        say, 770 and 1336 Hz at once; their ratio is 1.735, stubbornly non-integer, like every other
        ratio in the plan. So requiring a non-integer-related pair is voice rejection built out of
        arithmetic: no extra circuitry, just number theory hiding in the choice of eight numbers.
      </p>
      <p>
        The third decision covers everything arithmetic can’t. A valid digit must <em>persist</em>:
        the standards require a tone to hold for roughly 40 ms before it counts. The two tones must
        also arrive within a few dB of each other, a quantity with the delightful name{' '}
        <strong>twist</strong>, needed because the network attenuates high and low frequencies
        unequally. This project’s recognizer implements the same rulebook:{' '}
        <code>DEFAULT_DTMF_OPTIONS</code> in <code>@sonoglyph/plugin-dtmf</code> accepts tones
        within ±2% of nominal (ITU-T Q.24 requires accepting ≤1.5% and rejecting ≥3.5%, so 2% sits
        between), demands 40 ms of persistence, and rejects pairs whose twist exceeds 12 dB. A vowel
        might light up a plausible pair for a single frame; it almost never holds one steady, level,
        and alone for 40 ms. Turning those per-frame matches into one clean key press, through
        debouncing and gap handling, is the segmentation machinery from{' '}
        <a href="/learn/building-a-recognizer">chapter 07</a>.
      </p>

      <h2>Sixty years in the band</h2>
      <p>
        Here is the payoff for living in the voice band: DTMF traverses{' '}
        <em>anything that carries audio at all</em>. Copper pairs, digital trunks, a cell call, a
        VoIP codec, a cassette recording, a phone held up to a laptop’s microphone — the tones
        neither know nor care. The playground’s input panel exploits this directly: start the
        microphone, open your phone’s keypad (no call needed), hold it near your computer, and tap.
        Each tap plays the same two-tone pair this recognizer decodes, exactly as phones have sent
        it since 1963. Every “press 1 for…” menu you have ever navigated is this same 1963
        signaling, still on duty because in-band signals are immune to what the network becomes.
      </p>
      <p>
        DTMF is also this project’s reference plugin, and its fingerprints are on the whole
        pipeline. The low group’s closest neighbors sit only 73 Hz apart (697 → 770), so telling
        them apart takes real frequency resolution: at 48 kHz, that forces an analysis window of at
        least 2048 samples — about 23 Hz per bin — <a href="/learn/fft-and-windowing">chapter 03</a>
        ’s tradeoff, settled by a 1963 frequency plan. And once you notice that the only frequencies
        you will ever care about are these eight, a question forms: why compute the whole spectrum
        at all, when you could just <em>ask about eight frequencies</em>? That shortcut has a name,
        Goertzel, and it is <a href="/learn/fft-vs-goertzel">chapter 09</a>.
      </p>
    </>
  );
}
