# #567 — viewport sizing during phone rotation

Reported device: **iPhone 14 Pro, launched from the home screen** (user confirmation on 2026-10-09). iOS version is not yet specified; other affected models are unconfirmed.

## Reproduced cause and change

Before this change, hold `data/plan.json` in flight, start at 390 × 844 and rotate to 844 × 390. The actual canvas remains **390 × 844** because the window resize handler has not been registered yet. This is reproduced using the previous `src/main.js` from commit `3ad81a6`, with the same local server/browser. It establishes a startup sizing bug; it does not establish that every physical-phone white-strip incident has this cause.

`src/viewport.js` attaches sizing before the first scene-loading await. CSS sizes the fixed game canvas; ResizeObserver measures that actual surface and synchronizes the drawing buffer and camera aspect. It catches late layout changes even without a second window resize. Orientation, window/visual-viewport resize, fullscreen, pageshow and visibility events also schedule synchronization. The renderer never writes fixed inline CSS dimensions; dynamic resolution retains its current pixel ratio. Zero-size layouts and unchanged dimensions do not allocate new buffers.

Dynamic viewport units have a percentage fallback. Other canvases and HUD safe-area rules keep their existing sizing. No per-frame layout polling or extra render pass is added.

## Automated verification

Chromium 145 / Linux headless with SwiftShader, 2× device pixel density, touch enabled. These are desktop emulation results, **not physical iPhone/Safari or Android/Chrome tests**.

- `tools/viewporttest.cjs`: **16 PASS**. Real plan-request delay; first startup rotation; delayed CSS resize without a second event; camera after loading; four portrait/landscape transitions; actual GL buffer size; adaptive pixel ratio; zero-size recovery; unchanged event deduplication; physical Playwright taps on console/help, pause and resume; control bounds; no page errors.
- `tools/touchtest.html`: **10 PASS**. Joystick motion, look, actual choices, item pickup and placement.
- Screenshot manually inspected after a real WebGL draw at 844 × 360: image covers both edges and bottom; no white strip or half-screen gap.
- The first viewport test attempt hit a 10-second wait during software-rendered startup; a 20-second wait passed with unchanged production code.

Run a local `python3 tools/devserve.py 8156`, then:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome \
  node tools/viewporttest.cjs http://localhost:8156
```

The runner writes `/tmp/lunden-viewport.log` and `/tmp/lunden-viewport.png` (override the prefix with `VIEWPORT_OUTPUT`). Screenshots are session artifacts, not committed generated assets. [Viewport result](viewport.log), [touch result](touch.log), [baseline dimensions](before.json).

## Physical verification still pending

Keep #567 open until the required device checks are recorded. Prioritize **iPhone 14 Pro from the home screen**, recording iOS version. Also check mobile Safari as a normal tab and Chrome on a physical Android phone, recording model/OS/browser and installed-vs-tab mode.

For each mode: rotate during loading, immediately after loading, then repeatedly portrait → landscape → portrait. Verify full image coverage, correct proportions, usable touch controls and menus. On browser tabs also expand/collapse browser bars; on the installed app background/resume it. No physical-device result is claimed here.

## Follow-up 2026-10-10 (stale window metrics)

Emulated in Chromium: `innerWidth/innerHeight` overridden with pre-rotation values during startup and after loading (`window.__stale` in `tools/viewporttest.cjs`). Canvas CSS size, buffer and camera were already unaffected (they follow the canvas box). Real defect found: the touch joystick zone (`clientX < innerWidth * 0.45`), speech bubbles and `measure.update` used the stale window size; they now read `gameView` from `src/viewport.js`. 18 checks PASS (2 new), touchtest PASS. Linux/Chromium only; no WebKit browser is installed in the sandbox, so the iPhone layout-viewport hypothesis (stale layout width, white WKWebView backdrop) is still unverified. One run series timed out at the first post-load rotation (main thread busy under concurrent load); a repeat run passed.
