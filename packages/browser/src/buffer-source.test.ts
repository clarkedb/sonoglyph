import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferSource } from './buffer-source.js';

describe('BufferSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('immediate mode delivers everything synchronously', async () => {
    const source = new BufferSource(new Float32Array(1000), 48_000, { realtime: false });
    const chunks: Float32Array[] = [];
    let ended = false;
    source.onEnded(() => (ended = true));
    await source.start((s) => chunks.push(s));
    expect(chunks.reduce((n, c) => n + c.length, 0)).toBe(1000);
    expect(ended).toBe(true);
  });

  it('realtime mode paces samples to the wall clock', async () => {
    // 480 samples at 48 kHz = 10 ms of audio.
    const source = new BufferSource(new Float32Array(480), 48_000, { chunkMs: 5 });
    let delivered = 0;
    let ended = false;
    source.onEnded(() => (ended = true));
    await source.start((s) => (delivered += s.length));

    await vi.advanceTimersByTimeAsync(5);
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThan(480);
    expect(ended).toBe(false);

    await vi.advanceTimersByTimeAsync(20);
    expect(delivered).toBe(480);
    expect(ended).toBe(true);
  });

  it('stop halts delivery', async () => {
    const source = new BufferSource(new Float32Array(48_000), 48_000, { chunkMs: 5 });
    let delivered = 0;
    await source.start((s) => (delivered += s.length));
    await vi.advanceTimersByTimeAsync(10);
    const atStop = delivered;
    expect(atStop).toBeGreaterThan(0);
    await source.stop();
    await vi.advanceTimersByTimeAsync(50);
    expect(delivered).toBe(atStop);
  });
});
