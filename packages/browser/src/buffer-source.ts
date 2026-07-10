import type { AudioSource } from '@sonoglyph/core';

/**
 * Ceiling on how many chunks' worth of samples a single tick may hand off.
 * A backgrounded tab throttles the timer, then delivers one huge catch-up
 * chunk on refocus — stuttering the main thread and distorting glyph
 * timing. Capping per tick and letting later ticks drain the backlog keeps
 * delivery smooth (the pipeline feed only trails wall-clock briefly; the
 * audible playback runs off the AudioContext independently).
 */
const MAX_CATCHUP_CHUNKS = 4;

export interface BufferSourceOptions {
  /** Deliver samples paced to real time (default) or all at once. */
  realtime?: boolean;
  /** Delivery interval when pacing, in ms. */
  chunkMs?: number;
}

/**
 * Streams an in-memory buffer (a decoded WAV, a generated tone sequence)
 * through the same AudioSource interface the microphone uses. In realtime
 * mode chunks are paced by a timer with drift correction, so live
 * visualizations scroll the way they would for a mic; in immediate mode
 * the whole buffer is delivered synchronously — which is what deterministic
 * tests want.
 */
export class BufferSource implements AudioSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private position = 0;
  private startedAt = 0;
  private readonly realtime: boolean;
  private readonly chunkMs: number;
  private onEndedCb: (() => void) | null = null;

  constructor(
    private readonly samples: Float32Array,
    readonly sampleRate: number,
    options: BufferSourceOptions = {},
  ) {
    this.realtime = options.realtime ?? true;
    this.chunkMs = options.chunkMs ?? 30;
  }

  /** Called once when the whole buffer has been delivered. */
  onEnded(cb: () => void): void {
    this.onEndedCb = cb;
  }

  async start(onSamples: (samples: Float32Array) => void): Promise<void> {
    if (this.timer) throw new Error('BufferSource is already started');
    this.position = 0;

    if (!this.realtime) {
      onSamples(this.samples);
      this.position = this.samples.length;
      this.onEndedCb?.();
      return;
    }

    this.startedAt = Date.now();
    const maxPerTick = Math.ceil((this.chunkMs / 1000) * this.sampleRate) * MAX_CATCHUP_CHUNKS;
    this.timer = setInterval(() => {
      // Deliver everything the elapsed wall clock says should have played;
      // pacing off elapsed time (not tick count) absorbs timer jitter. Cap
      // the amount per tick so a throttled background tab drains its backlog
      // over several ticks instead of one main-thread-blocking burst.
      const elapsedSec = (Date.now() - this.startedAt) / 1000;
      const due = Math.min(this.samples.length, Math.floor(elapsedSec * this.sampleRate));
      const end = Math.min(due, this.position + maxPerTick);
      if (end > this.position) {
        onSamples(this.samples.subarray(this.position, end));
        this.position = end;
      }
      if (this.position >= this.samples.length) {
        void this.stop();
        this.onEndedCb?.();
      }
    }, this.chunkMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
