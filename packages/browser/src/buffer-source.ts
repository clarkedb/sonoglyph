import type { AudioSource } from '@sonoglyph/core';

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
    this.timer = setInterval(() => {
      // Deliver everything the elapsed wall clock says should have played;
      // pacing off elapsed time (not tick count) absorbs timer jitter.
      const elapsedSec = (Date.now() - this.startedAt) / 1000;
      const due = Math.min(this.samples.length, Math.floor(elapsedSec * this.sampleRate));
      if (due > this.position) {
        onSamples(this.samples.subarray(this.position, due));
        this.position = due;
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
