import { ImageResponse } from 'next/og';
import fs from 'node:fs/promises';
import path from 'node:path';

export const alt = 'Sonoglyph — watch sound become symbols';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/* Hex equivalents of the site's oklch() tokens (globals.css) — satori's CSS
 * subset doesn't reliably parse oklch(), so these are pre-converted. */
const VOID = '#080e14';
const INK = '#d6dbe1';
const INK_DIM = '#98a3ae';
const PHOSPHOR = '#f2af48';
const LINE = '#2b343d';

const b64 = (s: string) => Buffer.from(s).toString('base64');
const svgUri = (svg: string) => `url(data:image/svg+xml;base64,${b64(svg)})`;

/* Graph-paper tile matching .graph-grid: 8px minor + 40px major rulings. */
const minor = 'rgba(43,52,61,0.35)';
const major = 'rgba(43,52,61,0.70)';
const gridTile = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" shape-rendering="crispEdges">
  ${[8, 16, 24, 32]
    .map(
      (p) =>
        `<line x1="${p}" y1="0" x2="${p}" y2="40" stroke="${minor}" stroke-width="1"/><line x1="0" y1="${p}" x2="40" y2="${p}" stroke="${minor}" stroke-width="1"/>`,
    )
    .join('')}
  <line x1="0" y1="0" x2="0" y2="40" stroke="${major}" stroke-width="1"/>
  <line x1="0" y1="0" x2="40" y2="0" stroke="${major}" stroke-width="1"/>
</svg>`;

/* The favicon mark (app/icon.svg), recreated with the same token colors. */
const MARK = 128;
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${MARK}" height="${MARK}">
  <rect width="32" height="32" rx="6" fill="${VOID}" stroke="${LINE}" stroke-width="1"/>
  <path d="M4 16 C 7 8, 10 8, 13 16 S 19 24, 22 16 S 26 10, 28 14" fill="none" stroke="${PHOSPHOR}" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

export default async function Image() {
  const [fragmentMono, barlowCondensed] = await Promise.all([
    fs.readFile(path.join(process.cwd(), 'assets/fonts/FragmentMono-Regular.ttf')),
    fs.readFile(path.join(process.cwd(), 'assets/fonts/BarlowCondensed-SemiBold.ttf')),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: VOID,
        backgroundImage: svgUri(gridTile),
        backgroundSize: '40px 40px',
      }}
    >
      {/* lockup row: [mark] SONOGLYPH — matches the homepage hero's font-display uppercase h1 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={`data:image/svg+xml;base64,${b64(markSvg)}`}
          width={MARK}
          height={MARK}
          style={{
            marginRight: '34px',
            transform: 'translateY(8px)',
            boxShadow: '0 0 44px 2px rgba(242,175,72,0.28)',
            borderRadius: '24px',
          }}
        />
        <div
          style={{
            fontFamily: 'Barlow Condensed',
            fontWeight: 600,
            fontSize: '156px',
            color: INK,
            letterSpacing: '6px',
            lineHeight: 1,
          }}
        >
          SONOGLYPH
        </div>
      </div>
      {/* tagline */}
      <div
        style={{
          marginTop: '44px',
          fontFamily: 'Fragment Mono',
          fontSize: '30px',
          color: INK_DIM,
          letterSpacing: '7px',
        }}
      >
        watch sound become symbols
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Fragment Mono', data: fragmentMono, style: 'normal', weight: 400 },
        { name: 'Barlow Condensed', data: barlowCondensed, style: 'normal', weight: 600 },
      ],
    },
  );
}
