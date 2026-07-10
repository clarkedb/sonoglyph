/**
 * The capture AudioWorklet is deliberately dumb: it ships each 128-sample
 * render quantum out of the audio thread and does nothing else. All DSP
 * happens outside the worklet — worklet scope makes debugging (and later,
 * WASM loading) painful, and nothing in scope is latency-sensitive enough
 * to need in-thread processing. This is also what keeps the whole DSP path
 * runnable outside a live AudioContext.
 *
 * The processor source is inlined as a string and loaded from a Blob URL so
 * the package works under any bundler without asset configuration.
 */
const PROCESSOR_SOURCE = `
class SonoglyphCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input) {
      // Prefer channel 0, but some devices (e.g. a right-only USB input)
      // leave it empty and carry the signal on another channel — fall back
      // to the first channel that actually has samples rather than dropping
      // the input silently.
      let channel = input[0];
      if (!channel || channel.length === 0) {
        for (let c = 1; c < input.length; c++) {
          if (input[c] && input[c].length > 0) {
            channel = input[c];
            break;
          }
        }
      }
      if (channel && channel.length > 0) {
        const copy = new Float32Array(channel.length);
        copy.set(channel);
        this.port.postMessage(copy, [copy.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('sonoglyph-capture', SonoglyphCapture);
`;

export const CAPTURE_PROCESSOR_NAME = 'sonoglyph-capture';

/** Register the capture processor on a context (idempotent per context). */
const registered = new WeakSet<BaseAudioContext>();
export async function ensureCaptureWorklet(context: BaseAudioContext): Promise<void> {
  if (registered.has(context)) return;
  const url = URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' }));
  try {
    await context.audioWorklet.addModule(url);
    registered.add(context);
  } finally {
    URL.revokeObjectURL(url);
  }
}
