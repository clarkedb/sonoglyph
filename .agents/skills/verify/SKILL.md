---
name: verify
description: Build, launch, and drive the Sonoglyph playground to verify changes end-to-end in a real browser.
---

# Verifying Sonoglyph changes

## Launch

```bash
pnpm install
pnpm --filter @sonoglyph/playground dev --port 5199 --strictPort   # run in background
curl -s http://localhost:5199/ | head -3                            # confirm up
```

## Drive (headless Chrome via playwright-core)

No Playwright browsers are installed; use the system Chrome:

```js
import { chromium } from 'playwright-core'; // npm i playwright-core in a scratch dir
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
```

Useful selectors:

- Panels: `.panel h2` (Input, Waveform, Spectrum & peaks, Feature frames, Glyph timeline)
- Keypad keys: `.key` filtered by text; physical keys also work (`page.keyboard.press('7')`)
- Recognized glyphs: `.dialed-symbol` (symbols), `.glyph-table tbody tr` (detail rows)
- Live features text: `.features`
- Engine controls: first `select` = window size, second = window function

A key press plays a ~120 ms tone padded with trailing silence; the glyph
appears when the press _ends_, so wait ~600 ms after clicking before
asserting. Capture `console` events — the page should log no errors.

## Gotchas

- AudioContext works in headless Chrome with the flags above; audio is
  inaudible but the pipeline runs for keypad/tone/WAV inputs.
- The microphone path cannot be meaningfully verified headless (the fake
  capture device does not produce DTMF); verify it manually.
- Tests/lint/typecheck/build are CI's job: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
