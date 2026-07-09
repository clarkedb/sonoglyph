import { describe, expect, it } from 'vitest';
import { encodeWavPcm16, parseWav } from './wav.ts';

function sine(freq: number, durationSec: number, sampleRate: number): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

describe('WAV codec', () => {
  it('round-trips 16-bit PCM within quantization error', () => {
    const original = sine(440, 0.05, 48_000);
    const parsed = parseWav(encodeWavPcm16(original, 48_000));

    expect(parsed.sampleRate).toBe(48_000);
    expect(parsed.channels).toBe(1);
    expect(parsed.samples.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      // Encode scales by 32767, decode by 32768 — allow both that skew and
      // half an LSB of rounding.
      expect(Math.abs(parsed.samples[i]! - original[i]!)).toBeLessThan(1.6 / 32768);
    }
  });

  it('parses 32-bit float WAV', () => {
    const samples = new Float32Array([0.5, -0.25, 1, -1]);
    const buffer = new ArrayBuffer(44 + samples.length * 4);
    const view = new DataView(buffer);
    // Build the header by editing a PCM16 template into float32.
    const template = new Uint8Array(encodeWavPcm16(new Float32Array(samples.length * 2), 8000));
    new Uint8Array(buffer).set(template.subarray(0, 44));
    view.setUint16(20, 3, true); // format: IEEE float
    view.setUint16(32, 4, true); // block align
    view.setUint16(34, 32, true); // bits per sample
    view.setUint32(40, samples.length * 4, true); // data size
    for (let i = 0; i < samples.length; i++) view.setFloat32(44 + i * 4, samples[i]!, true);

    const parsed = parseWav(buffer);
    expect(Array.from(parsed.samples)).toEqual([0.5, -0.25, 1, -1]);
  });

  it('mixes stereo down to mono', () => {
    // Hand-build a 2-channel PCM16 file with L=[1,0], R=[0,1].
    const frames = 2;
    const buffer = new ArrayBuffer(44 + frames * 2 * 2);
    new Uint8Array(buffer).set(new Uint8Array(encodeWavPcm16(new Float32Array(frames * 2), 8000)));
    const view = new DataView(buffer);
    view.setUint16(22, 2, true); // channels: 2
    view.setInt16(44, 32767, true); // L0
    view.setInt16(46, 0, true); // R0
    view.setInt16(48, 0, true); // L1
    view.setInt16(50, 32767, true); // R1

    const parsed = parseWav(buffer);
    expect(parsed.channels).toBe(2);
    expect(parsed.samples.length).toBe(2);
    expect(parsed.samples[0]).toBeCloseTo(0.5, 3);
    expect(parsed.samples[1]).toBeCloseTo(0.5, 3);
  });

  it('rejects hostile or nonsensical headers with clear errors', () => {
    const base = () => encodeWavPcm16(new Float32Array(4), 8000);

    const zeroRate = base();
    new DataView(zeroRate).setUint32(24, 0, true);
    expect(() => parseWav(zeroRate)).toThrow(/sample rate/);

    const hugeRate = base();
    new DataView(hugeRate).setUint32(24, 0xffffffff, true);
    expect(() => parseWav(hugeRate)).toThrow(/sample rate/);

    const zeroBits = base();
    new DataView(zeroBits).setUint16(34, 0, true);
    expect(() => parseWav(zeroBits)).toThrow(/bit depth/);

    const zeroChannels = base();
    new DataView(zeroChannels).setUint16(22, 0, true);
    expect(() => parseWav(zeroChannels)).toThrow(/channel count/);

    // fmt chunk that claims 16 bytes but is cut off by end of file.
    const truncated = base().slice(0, 24);
    new DataView(truncated).setUint32(4, 16, true);
    expect(() => parseWav(truncated)).toThrow(/truncated/);
  });

  it('rejects non-WAV data', () => {
    expect(() => parseWav(new ArrayBuffer(4))).toThrow(/Not a WAV/);
    expect(() => parseWav(new TextEncoder().encode('RIFFxxxxJUNK1234').buffer)).toThrow(
      /Not a WAV/,
    );
  });

  it('skips unknown chunks before data', () => {
    const pcm = encodeWavPcm16(new Float32Array([0.5, -0.5]), 8000);
    const pcmBytes = new Uint8Array(pcm);
    // Insert a LIST chunk between fmt and data.
    const listChunk = new Uint8Array(12);
    new TextEncoder().encodeInto('LIST', listChunk);
    new DataView(listChunk.buffer).setUint32(4, 4, true);
    const out = new Uint8Array(pcm.byteLength + listChunk.length);
    out.set(pcmBytes.subarray(0, 36)); // header + fmt
    out.set(listChunk, 36);
    out.set(pcmBytes.subarray(36), 36 + listChunk.length);
    new DataView(out.buffer).setUint32(4, out.length - 8, true);

    const parsed = parseWav(out.buffer);
    expect(parsed.samples.length).toBe(2);
    expect(parsed.samples[0]).toBeCloseTo(0.5, 3);
  });
});
