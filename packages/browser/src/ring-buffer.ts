/**
 * A fixed-capacity Float32 ring buffer. When full, the oldest samples are
 * dropped — for live audio, keeping the freshest data is always the right
 * failure mode.
 */
export class RingBuffer {
  private readonly buffer: Float32Array;
  private readPos = 0;
  private writePos = 0;
  private size = 0;

  constructor(readonly capacity: number) {
    if (capacity < 1) throw new Error(`capacity must be >= 1, got ${capacity}`);
    this.buffer = new Float32Array(capacity);
  }

  /** Samples currently readable. */
  get available(): number {
    return this.size;
  }

  /** Append samples, dropping the oldest if capacity is exceeded. */
  write(samples: Float32Array): void {
    const n = samples.length;
    if (n >= this.capacity) {
      // The chunk alone fills the buffer; keep its tail.
      this.buffer.set(samples.subarray(n - this.capacity));
      this.readPos = 0;
      this.writePos = 0;
      this.size = this.capacity;
      return;
    }

    const firstPart = Math.min(n, this.capacity - this.writePos);
    this.buffer.set(samples.subarray(0, firstPart), this.writePos);
    if (firstPart < n) this.buffer.set(samples.subarray(firstPart));
    this.writePos = (this.writePos + n) % this.capacity;

    const overflow = this.size + n - this.capacity;
    if (overflow > 0) {
      this.readPos = (this.readPos + overflow) % this.capacity;
      this.size = this.capacity;
    } else {
      this.size += n;
    }
  }

  /** Read up to `out.length` samples into `out`; returns the count read. */
  read(out: Float32Array): number {
    const n = Math.min(out.length, this.size);
    const firstPart = Math.min(n, this.capacity - this.readPos);
    out.set(this.buffer.subarray(this.readPos, this.readPos + firstPart));
    if (firstPart < n) out.set(this.buffer.subarray(0, n - firstPart), firstPart);
    this.readPos = (this.readPos + n) % this.capacity;
    this.size -= n;
    return n;
  }

  /** Copy the newest `count` samples without consuming them (for display). */
  peekLatest(count: number): Float32Array {
    const n = Math.min(count, this.size);
    const out = new Float32Array(n);
    let start = (this.readPos + this.size - n) % this.capacity;
    for (let i = 0; i < n; i++) {
      out[i] = this.buffer[start]!;
      start = (start + 1) % this.capacity;
    }
    return out;
  }

  clear(): void {
    this.readPos = 0;
    this.writePos = 0;
    this.size = 0;
  }
}
