/**
 * A deterministic picture of the pipeline decoding a DTMF "5" — the same
 * dual-tone the playground's keypad synthesizes (row 770 Hz + column 1336 Hz).
 * Rendered as static SVG at build time; no client JS.
 */

const LOW_HZ = 770;
const HIGH_HZ = 1336;
const F_MAX = 1700;
const VIEW_W = 200;
const VIEW_H = 72;

function wavePath(): string {
  const n = 420;
  const durationS = 0.0062; // a few cycles of each tone
  const mid = VIEW_H / 2;
  const amp = VIEW_H * 0.4;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * durationS;
    const y = (Math.sin(2 * Math.PI * LOW_HZ * t) + Math.sin(2 * Math.PI * HIGH_HZ * t)) / 2;
    pts.push(
      `${i === 0 ? 'M' : 'L'}${((i / n) * VIEW_W).toFixed(1)} ${(mid - y * amp).toFixed(1)}`,
    );
  }
  return pts.join(' ');
}

function spectrumBars() {
  const count = 48;
  const bw = VIEW_W / count;
  return Array.from({ length: count }, (_, i) => {
    const f = ((i + 0.5) / count) * F_MAX;
    const mag = Math.exp(-(((f - LOW_HZ) / 46) ** 2)) + Math.exp(-(((f - HIGH_HZ) / 46) ** 2));
    const h = Math.max(2, mag * (VIEW_H - 18));
    return { x: i * bw + bw * 0.2, w: bw * 0.6, y: VIEW_H - 2 - h, h, peak: mag > 0.45 };
  });
}

export function PipelineFigure() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-2">
      <Stage n="01" name="samples" caption="time domain · 48 kHz">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden
        >
          <line x1="0" y1={VIEW_H / 2} x2={VIEW_W} y2={VIEW_H / 2} stroke="var(--line)" />
          <path
            d={wavePath()}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </Stage>
      <Arrow />
      <Stage n="02" name="features" caption="spectrum · two peaks">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden
        >
          <line x1="0" y1={VIEW_H - 2} x2={VIEW_W} y2={VIEW_H - 2} stroke="var(--line)" />
          {spectrumBars().map((b) => (
            <rect
              key={b.x}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill={b.peak ? 'var(--accent)' : 'var(--ink-dim)'}
              opacity={b.peak ? 1 : 0.45}
            />
          ))}
          <text
            x={(LOW_HZ / F_MAX) * VIEW_W}
            y="10"
            textAnchor="middle"
            fontSize="8.5"
            fontFamily="var(--font-mono)"
            fill="var(--ink-dim)"
          >
            770
          </text>
          <text
            x={(HIGH_HZ / F_MAX) * VIEW_W}
            y="10"
            textAnchor="middle"
            fontSize="8.5"
            fontFamily="var(--font-mono)"
            fill="var(--ink-dim)"
          >
            1336
          </text>
        </svg>
      </Stage>
      <Arrow />
      <Stage n="03" name="glyphs" caption="dtmf:5 · 0.98 conf">
        <span className="flex size-11 items-center justify-center rounded-md border border-accent/50 bg-accent/10 font-display text-2xl text-accent">
          5
        </span>
      </Stage>
      <Arrow />
      <Stage n="04" name="meaning" caption="defined by plugins">
        <span className="px-2 text-center font-display text-base italic text-ink-dim">
          yours to define
        </span>
      </Stage>
    </div>
  );
}

function Stage({
  n,
  name,
  caption,
  children,
}: {
  n: string;
  name: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="min-w-0 flex-1">
      <figcaption className="font-mono text-[11px] tracking-[0.15em] text-ink-dim uppercase">
        <span className="text-accent">{n}</span> {name}
      </figcaption>
      <div className="mt-2 flex h-24 items-center justify-center overflow-hidden rounded-md border border-line bg-panel px-3 py-2">
        {children}
      </div>
      <p className="mt-2 font-mono text-[11px] text-ink-dim">{caption}</p>
    </figure>
  );
}

function Arrow() {
  return (
    <div
      aria-hidden
      className="hidden items-center self-center pt-1 font-mono text-ink-dim sm:flex"
    >
      →
    </div>
  );
}
