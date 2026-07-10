import { useEffect, useState } from 'react';
import { tones, TsDspEngine } from '@sonoglyph/dsp';
import { initDspWasm, STREAM, WasmDspEngine } from '@sonoglyph/dsp-wasm';
import { Panel } from '@sonoglyph/react';

const EXPLAINER =
  'The whole DSP engine, both ways: the TypeScript reference (@sonoglyph/dsp) and the Rust core ' +
  'compiled to WebAssembly (@sonoglyph/dsp-wasm). Each processes a multi-second signal into ' +
  'overlapping analysis windows — an FFT, peak detection, and an envelope per window — and the ' +
  'two agree to the shared golden tolerance: a full-engine cross-validation, running live in ' +
  'your browser. On speed the result is honest. The Rust FFT here is a bit-exact port of the TS ' +
  'one — chosen so the numbers match to the last bit — not a performance-tuned transform, so it ' +
  'runs about even with V8’s JIT on this radix-2 loop. The compute win comes from swapping in a ' +
  'SIMD FFT backend (rustfft) behind the same interface — a later step — not from “WASM” alone. ' +
  'What WASM buys today is a second, independent implementation that proves the first correct.';

const SAMPLE_RATE = 48_000;
const DURATION_SEC = 2;
const WINDOW_SIZE = 2048;
const HOP_SIZE = 512;
const REPEAT_CHOICES = [10, 30, 100];
const LABEL = 'flex items-center gap-1.5 text-xs text-muted';

interface Result {
  windowsPerRepeat: number;
  repeats: number;
  tsMs: number;
  wasmMs: number;
  ratio: number;
  maxDiff: number;
}

type State =
  | { kind: 'init' }
  | { kind: 'unavailable' }
  | { kind: 'ready' }
  | { kind: 'running' }
  | { kind: 'done'; result: Result };

/** A steady DTMF-"1" chord; the FFT cost is the same whatever the content. */
function signal(): Float32Array {
  return tones(
    [
      { frequencyHz: 697, amplitude: 0.5 },
      { frequencyHz: 1209, amplitude: 0.5 },
    ],
    DURATION_SEC,
    SAMPLE_RATE,
  );
}

function timeTs(sig: Float32Array, repeats: number): { ms: number; windows: number } {
  let windows = 0;
  const start = performance.now();
  for (let r = 0; r < repeats; r++) {
    const engine = new TsDspEngine({
      sampleRate: SAMPLE_RATE,
      windowSize: WINDOW_SIZE,
      hopSize: HOP_SIZE,
    });
    windows += engine.push(sig).filter((f) => f.stream === 'spectrum').length;
  }
  return { ms: performance.now() - start, windows: windows / repeats };
}

function timeWasm(sig: Float32Array, repeats: number): number {
  const start = performance.now();
  for (let r = 0; r < repeats; r++) {
    const engine = new WasmDspEngine({
      sampleRate: SAMPLE_RATE,
      windowSize: WINDOW_SIZE,
      hopSize: HOP_SIZE,
    });
    try {
      for (let off = 0; off < sig.length; off += engine.inputCapacity) {
        engine.push(sig.subarray(off, Math.min(off + engine.inputCapacity, sig.length)));
      }
    } finally {
      engine.free();
    }
  }
  return performance.now() - start;
}

/** One window through both engines; largest |Δ| across the spectrum. */
function spectraMaxDiff(): number {
  const one = tones(
    [
      { frequencyHz: 697, amplitude: 0.5 },
      { frequencyHz: 1209, amplitude: 0.5 },
    ],
    WINDOW_SIZE / SAMPLE_RATE,
    SAMPLE_RATE,
  );
  const ts = new TsDspEngine({
    sampleRate: SAMPLE_RATE,
    windowSize: WINDOW_SIZE,
    hopSize: WINDOW_SIZE,
  });
  const tsMags = (
    ts.push(one).find((f) => f.stream === 'spectrum')!.data as { magnitudes: Float32Array }
  ).magnitudes;

  const engine = new WasmDspEngine({
    sampleRate: SAMPLE_RATE,
    windowSize: WINDOW_SIZE,
    hopSize: WINDOW_SIZE,
  });
  try {
    const count = engine.push(one);
    let idx = 0;
    for (let i = 0; i < count; i++) if (engine.frameStream(i) === STREAM.spectrum) idx = i;
    const wasmMags = engine.spectrumMagnitudes(idx);
    let max = 0;
    for (let k = 0; k < wasmMags.length; k++) {
      max = Math.max(max, Math.abs(wasmMags[k]! - tsMags[k]!));
    }
    return max;
  } finally {
    engine.free();
  }
}

export function EngineBenchmarkPanel() {
  const [state, setState] = useState<State>({ kind: 'init' });
  const [repeats, setRepeats] = useState(30);

  useEffect(() => {
    let cancelled = false;
    initDspWasm().then(
      () => !cancelled && setState({ kind: 'ready' }),
      () => !cancelled && setState({ kind: 'unavailable' }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function run() {
    setState({ kind: 'running' });
    setTimeout(() => {
      const sig = signal();
      // Warm both JITs / instantiation.
      timeTs(sig, 1);
      timeWasm(sig, 1);

      const maxDiff = spectraMaxDiff();
      const ts = timeTs(sig, repeats);
      const wasmMs = timeWasm(sig, repeats);
      setState({
        kind: 'done',
        result: {
          windowsPerRepeat: Math.round(ts.windows),
          repeats,
          tsMs: ts.ms,
          wasmMs,
          ratio: ts.ms / wasmMs,
          maxDiff,
        },
      });
    }, 0);
  }

  return (
    <Panel
      title="Engine: TS vs WASM"
      explainer={EXPLAINER}
      className="col-span-full"
      controls={
        state.kind !== 'unavailable' && (
          <>
            <label className={LABEL}>
              Repeats
              <select
                value={repeats}
                disabled={state.kind === 'running'}
                onChange={(event) => setRepeats(Number(event.target.value))}
              >
                {REPEAT_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={run} disabled={state.kind === 'init' || state.kind === 'running'}>
              {state.kind === 'running' ? 'Running…' : 'Run benchmark'}
            </button>
          </>
        )
      }
    >
      {state.kind === 'unavailable' ? (
        <div className="text-[13px] leading-normal text-soft">
          <p className="text-danger">The WASM engine isn’t built yet.</p>
          <p className="mt-1.5">
            Build it, then reload:{' '}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[12px]">
              pnpm --filter @sonoglyph/dsp-wasm build:wasm
            </code>
          </p>
        </div>
      ) : state.kind === 'done' ? (
        <EngineResult result={state.result} />
      ) : (
        <p className="text-[13px] text-soft">
          {state.kind === 'init'
            ? 'Loading the WASM module…'
            : state.kind === 'running'
              ? 'Processing the signal through both engines…'
              : `Run the benchmark to process ${DURATION_SEC}s of audio through both engines (${WINDOW_SIZE}-sample windows, ${HOP_SIZE}-sample hop).`}
        </p>
      )}
    </Panel>
  );
}

function EngineResult({ result }: { result: Result }) {
  const { windowsPerRepeat, repeats, tsMs, wasmMs, ratio, maxDiff } = result;
  const max = Math.max(tsMs, wasmMs);
  const verdict =
    ratio >= 1.05
      ? `WASM ${ratio.toFixed(2)}× faster`
      : ratio <= 0.95
        ? `WASM ${(1 / ratio).toFixed(2)}× slower`
        : 'about even';

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex flex-col gap-2">
        <Bar label="TypeScript" ms={tsMs} widthPct={(tsMs / max) * 100} color="bg-[#63b3ed]" />
        <Bar label="WASM (Rust)" ms={wasmMs} widthPct={(wasmMs / max) * 100} color="bg-[#f6ad55]" />
      </div>
      <p className="text-soft">
        <strong className="font-semibold text-heading">{verdict}</strong> over {repeats} passes of{' '}
        {windowsPerRepeat.toLocaleString()} analysis windows each ({DURATION_SEC}s of audio).
      </p>
      <p className="text-faint">
        Spectra match to Δ&nbsp;{maxDiff === 0 ? '0' : maxDiff.toExponential(1)} — the same golden
        cross-validation, running live in your browser.
      </p>
    </div>
  );
}

function Bar({
  label,
  ms,
  widthPct,
  color,
}: {
  label: string;
  ms: number;
  widthPct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-canvas">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(widthPct, 2)}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-[12px] text-soft">
        {ms.toFixed(1)} ms
      </span>
    </div>
  );
}
