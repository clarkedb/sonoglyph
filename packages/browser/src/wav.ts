/**
 * Minimal RIFF/WAVE codec: enough to load user-provided WAV files into the
 * pipeline and to round-trip synthetic signals in tests. Pure functions on
 * ArrayBuffers — no browser APIs, so it runs (and is tested) in Node.
 */

export interface WavData {
  sampleRate: number;
  /** Number of channels in the source file (samples are mixed to mono). */
  channels: number;
  /** Mono samples in [-1, 1]. */
  samples: Float32Array;
}

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;

/** Parse a WAV file. Supports PCM 8/16/24/32-bit and 32-bit float; multi-
 * channel audio is mixed down to mono by averaging. */
export function parseWav(buffer: ArrayBuffer): WavData {
  const view = new DataView(buffer);
  if (view.byteLength < 12 || readTag(view, 0) !== 'RIFF' || readTag(view, 8) !== 'WAVE') {
    throw new Error('Not a WAV file (missing RIFF/WAVE header)');
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;

  // Walk the chunk list; files often carry LIST/INFO/fact chunks we skip.
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const tag = readTag(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (tag === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (tag === 'data') {
      dataOffset = body;
      dataLength = Math.min(size, view.byteLength - body);
    }
    // Chunks are word-aligned: odd sizes are padded with one byte.
    offset = body + size + (size & 1);
  }

  if (dataOffset === -1) throw new Error('WAV file has no data chunk');
  if (channels < 1) throw new Error('WAV file has no channels');
  if (format !== FORMAT_PCM && format !== FORMAT_FLOAT) {
    throw new Error(`Unsupported WAV format code ${format} (only PCM and float)`);
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const at = dataOffset + (i * channels + ch) * bytesPerSample;
      sum += readSample(view, at, format, bitsPerSample);
    }
    samples[i] = sum / channels;
  }

  return { sampleRate, channels, samples };
}

function readSample(view: DataView, at: number, format: number, bits: number): number {
  if (format === FORMAT_FLOAT) {
    if (bits === 32) return view.getFloat32(at, true);
    if (bits === 64) return view.getFloat64(at, true);
    throw new Error(`Unsupported float WAV bit depth ${bits}`);
  }
  switch (bits) {
    case 8:
      // 8-bit WAV is unsigned, centered on 128.
      return (view.getUint8(at) - 128) / 128;
    case 16:
      return view.getInt16(at, true) / 32768;
    case 24: {
      const b0 = view.getUint8(at);
      const b1 = view.getUint8(at + 1);
      const b2 = view.getUint8(at + 2);
      let v = b0 | (b1 << 8) | (b2 << 16);
      if (v & 0x800000) v -= 0x1000000;
      return v / 8388608;
    }
    case 32:
      return view.getInt32(at, true) / 2147483648;
    default:
      throw new Error(`Unsupported PCM WAV bit depth ${bits}`);
  }
}

/** Encode mono samples as a 16-bit PCM WAV file. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeTag(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeTag(view, 8, 'WAVE');
  writeTag(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, FORMAT_PCM, true);
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeTag(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return buffer;
}

function readTag(view: DataView, at: number): string {
  return String.fromCharCode(
    view.getUint8(at),
    view.getUint8(at + 1),
    view.getUint8(at + 2),
    view.getUint8(at + 3),
  );
}

function writeTag(view: DataView, at: number, tag: string): void {
  for (let i = 0; i < 4; i++) view.setUint8(at + i, tag.charCodeAt(i));
}
