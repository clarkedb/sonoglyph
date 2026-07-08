import type {
  FeatureFrame,
  Glyph,
  PluginMetadata,
  RecognizerPlugin,
  Unsubscribe,
} from '@sonoglyph/core';

/**
 * What one frame looks like when it contains the thing being recognized.
 * A classifier returns one of these per matching frame — "this frame sounds
 * like a 5, with this confidence" — and nothing else. Everything temporal
 * (how long must it persist, what ends it, what duration to report) is the
 * segmentation machine's job.
 */
export interface FrameMatch<P = unknown> {
  /** The symbol this frame matches: "5", "on", "Cmaj", … */
  symbol: string;
  /** Per-frame confidence, 0..1. */
  confidence: number;
  /** Classifier-defined detail, available to `finalize` for aggregation. */
  payload?: P;
}

export interface SegmentationOptions {
  /** A symbol must persist at least this long to emit a glyph. */
  minDurationMs: number;
  /** Silence (or a different symbol) this long ends the current press. */
  minGapMs: number;
}

/**
 * A finished press, handed to `finalize`. Aggregates everything the machine
 * accumulated while the symbol persisted.
 */
export interface Press<P = unknown> {
  /** The symbol that persisted. */
  symbol: string;
  /** Start of the press, in seconds of stream time. */
  start: number;
  /**
   * Span-corrected duration in seconds. A tone shows up in every frame
   * whose analysis window overlaps it, so the raw matched span overstates
   * the tone by roughly half a window; this is corrected for already.
   */
  duration: number;
  /** Frames covering the press, including absorbed dropouts and blips. */
  frameCount: number;
  /** The matches that actually hit — the basis for aggregated payloads. */
  matches: FrameMatch<P>[];
  /** Mean confidence across `matches`, clamped to 0..1. */
  confidence: number;
}

/** What `finalize` may override on the emitted glyph. */
export interface GlyphInit<G = unknown> {
  /** Defaults to the press's symbol. */
  symbol?: string;
  /** Defaults to the press's mean confidence. */
  confidence?: number;
  /** Defaults to no payload. */
  payload?: G;
}

/**
 * Everything a recognizer author supplies. `classify` is the only required
 * behavior: a pure per-frame judgment. The machine supplies the rest.
 */
export interface RecognizerSpec<P = unknown, G = unknown> {
  metadata: PluginMetadata;
  segmentation: SegmentationOptions;
  /**
   * Judge one frame. Return a match if the frame contains the signal,
   * null otherwise. Called only for frames of `stream`.
   */
  classify(frame: FeatureFrame): FrameMatch<P> | null;
  /**
   * Turn a finished press into the emitted glyph, or veto it by returning
   * null. Omit it to emit the press's symbol and mean confidence as-is.
   * This is where per-frame payloads get aggregated (e.g. averaging the
   * detected frequencies across the press) and where duration-dependent
   * symbols are decided (e.g. Morse dot vs. dash).
   */
  finalize?(press: Press<P>): GlyphInit<G> | null;
  /** Stream to classify. Defaults to `metadata.requiredStreams[0]`. */
  stream?: string;
}

/** An in-progress press being accumulated across frames. */
interface Tracking<P> {
  symbol: string;
  startTime: number;
  /** Analysis window length of the frames, in seconds. */
  span: number;
  /** Frames covering the press, including absorbed dropouts/blips — the
   * basis for duration. */
  frameCount: number;
  /** Frames since the symbol was last seen (silence or another symbol). */
  gapFrames: number;
  matches: FrameMatch<P>[];
}

/**
 * The debouncing state machine that turns per-frame classifications into
 * glyphs — extracted from the DTMF reference plugin, which remains its
 * canonical user.
 *
 * Per frame, `classify` makes an instantaneous judgment. Across frames,
 * the machine turns those judgments into presses: a symbol must persist
 * for `minDurationMs` to register, and a `minGapMs` gap — silence or a
 * different symbol — must elapse before the press ends. Treating symbol
 * changes like silence makes the machine robust to noise flipping a single
 * frame to a neighboring symbol, and it is how "55" becomes two glyphs
 * instead of one long one. The glyph is emitted when the press ends, so
 * its duration covers the whole press.
 */
export class SegmentingRecognizer<P = unknown, G = unknown> implements RecognizerPlugin {
  readonly metadata: PluginMetadata;

  private readonly spec: RecognizerSpec<P, G>;
  private readonly stream: string;
  private readonly listeners = new Set<(glyph: Glyph<G>) => void>();
  private tracking: Tracking<P> | null = null;

  constructor(spec: RecognizerSpec<P, G>) {
    const stream = spec.stream ?? spec.metadata.requiredStreams[0];
    if (!stream) {
      throw new Error(`plugin "${spec.metadata.id}" declares no stream to classify`);
    }
    this.spec = spec;
    this.stream = stream;
    this.metadata = spec.metadata;
  }

  process(frame: FeatureFrame): void {
    if (frame.stream !== this.stream) return;
    const match = this.spec.classify(frame);
    const hop = frame.hop;

    if (this.tracking && match && match.symbol === this.tracking.symbol) {
      // The press continues. Absorbed frames since the symbol was last
      // seen — dropouts or noise-flipped misclassifications — are credited
      // to the duration: the signal was evidently sounding right through
      // them.
      const t = this.tracking;
      t.frameCount += 1 + t.gapFrames;
      t.gapFrames = 0;
      t.matches.push(match);
      return;
    }

    if (this.tracking) {
      // Silence AND different-symbol frames both count toward the gap.
      // Noise can flip a single frame to a neighboring symbol, so a symbol
      // change only takes effect once it outlasts the gap threshold — same
      // debouncing that separates presses from dropouts.
      this.tracking.gapFrames++;
      const gapSec = this.tracking.gapFrames * hop;
      if (gapSec >= this.spec.segmentation.minGapMs / 1000) {
        this.finish(this.tracking, hop);
        this.tracking = null;
      }
    }

    if (!this.tracking && match) {
      this.tracking = {
        symbol: match.symbol,
        startTime: frame.time,
        span: frame.span,
        frameCount: 1,
        gapFrames: 0,
        matches: [match],
      };
    }
  }

  onGlyph(cb: (glyph: Glyph) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  reset(): void {
    this.tracking = null;
  }

  /** Emit a glyph for a finished press, if it lasted long enough. */
  private finish(t: Tracking<P>, hop: number): void {
    const duration = t.frameCount * hop - t.span / 2;
    if (duration < this.spec.segmentation.minDurationMs / 1000) return;

    let confidence = 0;
    for (const m of t.matches) confidence += m.confidence;
    confidence = Math.max(0, Math.min(1, confidence / t.matches.length));

    const press: Press<P> = {
      symbol: t.symbol,
      start: t.startTime,
      duration,
      frameCount: t.frameCount,
      matches: t.matches,
      confidence,
    };
    const init = this.spec.finalize ? this.spec.finalize(press) : {};
    if (init === null) return;

    const glyph: Glyph<G> = {
      symbol: init.symbol ?? press.symbol,
      pluginId: this.metadata.id,
      start: press.start,
      duration: press.duration,
      confidence: init.confidence ?? press.confidence,
      ...(init.payload !== undefined ? { payload: init.payload } : {}),
    };
    for (const cb of this.listeners) cb(glyph);
  }
}

/**
 * Define a recognizer plugin from a per-frame classifier — debouncing and
 * segmentation come for free. See `RecognizerSpec` for the pieces and
 * `SegmentingRecognizer` for the machine's exact behavior; plugins that
 * want a class of their own can extend `SegmentingRecognizer` instead
 * (the DTMF reference plugin does).
 */
export function defineRecognizer<P = unknown, G = unknown>(
  spec: RecognizerSpec<P, G>,
): RecognizerPlugin {
  return new SegmentingRecognizer(spec);
}
