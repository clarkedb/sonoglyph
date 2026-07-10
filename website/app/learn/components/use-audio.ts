'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Play raw sample buffers through a lazily-created AudioContext (the
 * landing page instrument's wiring, shared). The context is created on
 * first play — inside a user gesture, so autoplay policy is satisfied —
 * and closed on unmount.
 */
export function useAudioPlayback(): (samples: Float32Array, sampleRate: number) => void {
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      const ctx = audioRef.current;
      audioRef.current = null;
      if (ctx && ctx.state !== 'closed') void ctx.close();
    };
  }, []);

  return useCallback((samples: Float32Array, sampleRate: number) => {
    const ctx = (audioRef.current ??= new AudioContext());
    void ctx.resume();
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    node.start();
  }, []);
}

/** Raised-cosine fade at both ends (default 2 ms) to avoid audible clicks.
 * Mutates and returns `samples`. */
export function fadeInPlace(samples: Float32Array, sampleRate: number, ms = 2): Float32Array {
  const fade = Math.min(Math.floor((sampleRate * ms) / 1000), Math.floor(samples.length / 2));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    samples[i]! *= g;
    samples[samples.length - 1 - i]! *= g;
  }
  return samples;
}
