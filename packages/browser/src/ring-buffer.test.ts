import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ring-buffer.ts';

const f32 = (...values: number[]) => new Float32Array(values);

describe('RingBuffer', () => {
  it('round-trips a simple write/read', () => {
    const rb = new RingBuffer(8);
    rb.write(f32(1, 2, 3));
    const out = new Float32Array(3);
    expect(rb.read(out)).toBe(3);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(rb.available).toBe(0);
  });

  it('wraps around the end of the buffer', () => {
    const rb = new RingBuffer(4);
    rb.write(f32(1, 2, 3));
    const out = new Float32Array(2);
    rb.read(out); // consume 1, 2 → read/write positions are mid-buffer
    rb.write(f32(4, 5, 6)); // crosses the wrap point
    const rest = new Float32Array(4);
    expect(rb.read(rest)).toBe(4);
    expect(Array.from(rest)).toEqual([3, 4, 5, 6]);
  });

  it('drops the oldest samples on overflow', () => {
    const rb = new RingBuffer(4);
    rb.write(f32(1, 2, 3, 4));
    rb.write(f32(5, 6));
    const out = new Float32Array(4);
    expect(rb.read(out)).toBe(4);
    expect(Array.from(out)).toEqual([3, 4, 5, 6]);
  });

  it('keeps the tail of a chunk larger than the whole buffer', () => {
    const rb = new RingBuffer(3);
    rb.write(f32(1, 2, 3, 4, 5));
    const out = new Float32Array(3);
    expect(rb.read(out)).toBe(3);
    expect(Array.from(out)).toEqual([3, 4, 5]);
  });

  it('reads only what is available', () => {
    const rb = new RingBuffer(8);
    rb.write(f32(1, 2));
    const out = new Float32Array(5);
    expect(rb.read(out)).toBe(2);
  });

  it('peekLatest returns the newest samples without consuming', () => {
    const rb = new RingBuffer(4);
    rb.write(f32(1, 2, 3, 4, 5));
    expect(Array.from(rb.peekLatest(2))).toEqual([4, 5]);
    expect(rb.available).toBe(4);
    expect(Array.from(rb.peekLatest(10))).toEqual([2, 3, 4, 5]);
  });

  it('clear empties the buffer', () => {
    const rb = new RingBuffer(4);
    rb.write(f32(1, 2, 3));
    rb.clear();
    expect(rb.available).toBe(0);
    expect(rb.read(new Float32Array(4))).toBe(0);
  });
});
