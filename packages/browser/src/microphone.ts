import type { AudioSource } from '@sonoglyph/core';
import { CAPTURE_PROCESSOR_NAME, ensureCaptureWorklet } from './worklet.js';

/**
 * Live microphone input:
 *
 *   getUserMedia → AudioContext → capture worklet → onSamples(chunk)
 *
 * Browser voice processing (echo cancellation, noise suppression, auto
 * gain) is disabled — it is tuned for speech and actively distorts the
 * steady tones we analyze.
 */
export class MicrophoneSource implements AudioSource {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private _sampleRate = 0;

  get sampleRate(): number {
    return this._sampleRate;
  }

  async start(onSamples: (samples: Float32Array) => void): Promise<void> {
    if (this.context) throw new Error('MicrophoneSource is already started');

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.context = new AudioContext();
    this._sampleRate = this.context.sampleRate;
    await ensureCaptureWorklet(this.context);

    const mic = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, CAPTURE_PROCESSOR_NAME, {
      numberOfOutputs: 0,
    });
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      onSamples(event.data);
    };
    mic.connect(this.node);
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    await this.context?.close();
    this.context = null;
  }
}
