# Design brief — Sonoglyph website (landing page + chrome)

Confirmed by Clark, 2026-07-09. Governs the rebuild of `website/app`. Strategic
context lives in `website/PRODUCT.md`; this brief is task-scoped.

## Feature summary

Replace the warm-paper editorial landing page with the true brand surface: a
dark instrument-manual-×-space page where a visitor presses a key and watches
sound become symbols. The page doubles as the design-system foundation for the
coming playground and Learn pages.

## Primary user action

Press a keypad key in the hero → hear the dual-tone → watch the real pipeline
decode it into a glyph. Until the hosted playground lands (web-03), the hero is
the playground's trailer; GitHub is the outbound CTA.

## Design direction

- **Color: drenched void + one trace.** Near-black space (~oklch(0.16 0.015 250)
  family) carries 100% of the surface, textured with a subtle graph grid.
  Everything alive — waveform, spectrum, glyphs, focus rings, links — glows in a
  single warm amber phosphor. Annotations/labels in dim blue-gray ink. Nothing
  else gets color: everything that glows is signal.
- **Scene**: a tinkerer at their desk at 2am, room dark, one monitor glowing —
  powering on a beautiful instrument.
- **Light mode = the printed manual.** Same line-work, grid, and grammar on
  drafting-paper white. Dark is default; OS preference honored; toggle stays.
- **Anchors**: Tektronix/HP scope-manual line diagrams (numbered figure
  callouts), Apollo-era flight documentation, the graph-paper spec sheet.
- **Typography**: no serif (that was the editorial lane). Voice = mid-century
  technical documentation: workhorse grotesque body/headings + drafting mono
  annotations. Candidates: Barlow / Archivo Narrow (labels), Fragment Mono /
  Spline Sans Mono (annotations). Final picks via the font-selection procedure
  against the reflex-reject list — not by reflex.

## Scope

High-fi exploration: real, working, responsive, accessible — a strong draft;
one directional iteration expected before the PR. Breadth: landing page +
header/footer chrome + tokens.

## Layout strategy

Single-column manual grammar with full-bleed instrument moments. Hero: title +
tagline ("watch sound become symbols") + the interactive decode instrument — a
compact 4×4 DTMF keypad beside a live oscilloscope/spectrum trace and a glyph
timeline slot, drawn as Fig. 1 with manual-style callout numbers (the one
place numbers belong — a genuine sequence). Below: "the idea" prose; the
workspace as a specifications table (in-world replacement for a card grid);
footer keeps the Samples → Features → Glyphs → Meaning chain. No section
eyebrows — section breaks use figure-rule + manual heading grammar.

## Key states

- Idle: trace breathing faintly, keypad inviting ("press a key");
  reduced-motion → static trace.
- Pressed/decoding: tone plays (user gesture, ~350 ms), waveform draws,
  spectrum peaks rise with Hz callouts, glyph materializes with confidence.
- Repeat presses: glyphs append to a mini timeline (dialing spells it out).
- No-JS / pre-hydration: static Fig. 1 with real build-time waveform SVG.
- Reduced motion: instant state swaps, no sweeps; fully functional.
- Light mode: everything above, printed.

## Interaction model

Pointer or keyboard (real buttons, visible focus). Press → WebAudio dual-tone
through the actual @sonoglyph/dsp + plugin-dtmf pipeline — the website becomes
the framework's second consumer now, not at web-03. Decode result renders
glyph + frequency pair. Silent environments still get the full visual.

## Content requirements

Copy largely survives: positioning line, "the idea" prose, package blurbs
(reformatted as spec rows). New: keypad microcopy, Fig. captions, decode
readouts (dtmf:5 · 0.98), tagline placement. "beep boop beep = hello, world?"
stays as the kicker easter egg.

## Implementation references

impeccable: animate.md (hero choreography + reduced-motion), typeset.md (font
procedure), delight.md (the decode moment).

## Asserted defaults (not open questions)

Full 16-key keypad · OS-honoring dark default · theme toggle retained ·
WCAG AA + prefers-reduced-motion everywhere (per PRODUCT.md).
