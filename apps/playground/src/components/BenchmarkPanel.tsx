import { useEffect, useState } from 'react';
import { goertzelPower as tsPower, tones } from '@sonoglyph/dsp';
import { goertzelPower as wasmPower, initDspWasm } from '@sonoglyph/dsp-wasm';
import { HIGH_GROUP, LOW_GROUP } from '@sonoglyph/plugin-dtmf';
import { Panel } from '@sonoglyph/react';

const EXPLAINER =
  'The same Goertzel algorithm, two implementations: the TypeScript reference (@sonoglyph/dsp) ' +
  'and the Rust core compiled to WebAssembly (@sonoglyph/dsp-wasm). Both decode the eight DTMF ' +
  'frequencies over one analysis block; the timings are for many repeats of that workload. They ' +
  'agree to the last decimal — that is what the shared golden vectors guarantee. The speed is ' +
  'the honest part: for a probe this small, crossing the JS↔WASM boundary copies the block into ' +
  "WASM memory on every call, and V8's JIT is excellent at tight numeric loops, so WASM's edge " +
  'is modest or even negative here. WASM pays off on the compute-bound, zero-copy hot loop of a ' +
  'streaming engine — not on a handful of small probes.';

const SAMPLE_RATE = 48_000;
const BLOCK_SIZE = 2048;
// The eight DTMF frequencies — exactly what a Goertzel DTMF decoder probes per block.
const FREQS = [...LOW_GROUP, ...HIGH_GROUP];
const ITER_CHOICES = [2_000, 10_000, 50_000];
const LABEL = 'flex items-center gap-1.5 text-xs text-muted';

interface Result {
  iterations: number;
  tsMs: number;
  wasmMs: number;
  /** tsMs / wasmMs — >1 means WASM is faster. */
  ratio: number;
  /** Largest |TS − WASM| across the eight probes; the correctness check. */
  maxDiff: number;
}

type State =
  | { kind: 'init' }
  | { kind: 'unavailable'; hint: string }
  | { kind: 'ready' }
  | { kind: 'running' }
  | { kind: 'done'; result: Result };

type PowerFn = (samples: Float32Array, frequencyHz: number, sampleRate: number) => number;

/** One DTMF-decode's worth of work: probe all eight frequencies. Returns a
 *  sum so the loop can't be optimized away. */
function workload(power: PowerFn, block: Float32Array): number {
  let sink = 0;
  for (const f of FREQS) sink += power(block, f, SAMPLE_RATE);
  return sink;
}

function measure(power: PowerFn, block: Float32Array, iterations: number): number {
  let sink = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) sink += workload(power, block);
  const elapsed = performance.now() - start;
  if (!Number.isFinite(sink)) throw new Error('unreachable'); // keep `sink` live
  return elapsed;
}

export function BenchmarkPanel() {
  const [state, setState] = useState<State>({ kind: 'init' });
  const [iterations, setIterations] = useState(10_000);

  useEffect(() => {
    let cancelled = false;
    initDspWasm().then(
      () => !cancelled && setState({ kind: 'ready' }),
      (err: unknown) =>
        !cancelled &&
        setState({ kind: 'unavailable', hint: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function run() {
    setState({ kind: 'running' });
    // Let the "running" state paint before the synchronous benchmark loop.
    setTimeout(() => {
      const block = tones(
        [
          { frequencyHz: 697, amplitude: 0.5 },
          { frequencyHz: 1209, amplitude: 0.5 },
        ],
        BLOCK_SIZE / SAMPLE_RATE,
        SAMPLE_RATE,
      );

      // Warm both JITs / instantiation caches before timing.
      for (let i = 0; i < 200; i++) {
        workload(tsPower, block);
        workload(wasmPower, block);
      }

      let maxDiff = 0;
      for (const f of FREQS) {
        maxDiff = Math.max(
          maxDiff,
          Math.abs(tsPower(block, f, SAMPLE_RATE) - wasmPower(block, f, SAMPLE_RATE)),
        );
      }

      const tsMs = measure(tsPower, block, iterations);
      const wasmMs = measure(wasmPower, block, iterations);
      setState({
        kind: 'done',
        result: { iterations, tsMs, wasmMs, ratio: tsMs / wasmMs, maxDiff },
      });
    }, 0);
  }

  return (
    <Panel
      title="Goertzel: TS vs WASM"
      explainer={EXPLAINER}
      className="col-span-full"
      controls={
        state.kind !== 'unavailable' && (
          <>
            <label className={LABEL}>
              Repeats
              <select
                value={iterations}
                disabled={state.kind === 'running'}
                onChange={(event) => setIterations(Number(event.target.value))}
              >
                {ITER_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}
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
            <code className="rounded-sm bg-canvas px-1 py-0.5 font-mono text-[12px]">
              pnpm --filter @sonoglyph/dsp-wasm build:wasm
            </code>
          </p>
          <p className="mt-1.5 text-faint">
            The rest of the playground runs without it — the Rust core is optional.
          </p>
        </div>
      ) : state.kind === 'done' ? (
        <BenchmarkResult result={state.result} />
      ) : (
        <p className="text-[13px] text-soft">
          {state.kind === 'init'
            ? 'Loading the WASM module…'
            : state.kind === 'running'
              ? 'Timing the two implementations…'
              : 'Run the benchmark to compare the TypeScript and WASM Goertzel over the eight DTMF frequencies.'}
        </p>
      )}
    </Panel>
  );
}

function BenchmarkResult({ result }: { result: Result }) {
  const { iterations, tsMs, wasmMs, ratio, maxDiff } = result;
  const max = Math.max(tsMs, wasmMs);
  const runs = iterations * FREQS.length;
  const verdict =
    ratio >= 1.05
      ? `WASM ${ratio.toFixed(2)}× faster`
      : ratio <= 0.95
        ? `WASM ${(1 / ratio).toFixed(2)}× slower`
        : 'about even';

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex flex-col gap-2">
        <Bar label="TypeScript" ms={tsMs} widthPct={(tsMs / max) * 100} color="bg-soft" />
        <Bar label="WASM (Rust)" ms={wasmMs} widthPct={(wasmMs / max) * 100} color="bg-accent" />
      </div>
      <p className="text-soft">
        <strong className="font-semibold text-heading">{verdict}</strong> over{' '}
        {iterations.toLocaleString()} blocks ({runs.toLocaleString()} Goertzel probes each).
      </p>
      <p className="text-faint">
        Results match to Δ&nbsp;{maxDiff === 0 ? '0' : maxDiff.toExponential(1)} — the golden-vector
        guarantee, live.
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
      <div className="h-5 flex-1 overflow-hidden rounded-sm bg-canvas">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(widthPct, 2)}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-[12px] text-soft">
        {ms.toFixed(1)} ms
      </span>
    </div>
  );
}
