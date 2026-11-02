# River ducks — #1815

Base: `48cf6fddd8b29172ec79485393074d951417195a`; local browser, 2026-11-02.

- `node tools/ducktest.mjs`: four PASS groups (pure brain plus actual Items).
- `BROWSERTEST_LOCK=/tmp/lunden-intake-20261102/browser.lock PLAYWRIGHT_MODULE=/home/olof/.npm/_npx/e41f203b7505f1fb/node_modules/playwright CHROME_PATH=/home/olof/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome THREE_DIR=/tmp/lunden-roaddeps-1812/node_modules/three tools/browsertest.sh node tools/duckbrowser.cjs http://localhost:8938 docs/verification/1815`: ten PASS checks, 1526 MiB peak of 4 GiB, no page errors. Raw values in `result.json`.
- `node --check src/main.js`, `src/audio.js`, `src/duckbrain.js`, `src/ducks.js`; `git diff --check`.

The habitat test uses the actual current river and rendered terrain: swimming and walking both occur;
maximum sampled 3D step is 0.032501 m at 50 ms. The procedural model is 640 triangles, shared across
four ducks (2560 triangles / four mesh draws), no lights or shadow casters. Quacks use real running
Web Audio synthesis, ordinary attenuation/global mute and a shared three-second cooldown. No
loudspeaker listening, physical-phone performance or multiplayer test is claimed.

The real-app fixture puts an ordinary closed Life bread bag on the shore, opens it, and uses the
normal timed dispense action: bag 12→11, one held breadSlice. Native keyboard E feeds one quarter;
repeated E while chewing consumes nothing. Native touch feeds the other three quarters, removing
the slice at zero. No player eating event/health reward is generated for feeding a duck.

Images, inspected at 1280×800, November at 13:00, clear weather:

- `bread-feeding-shore.png`: actual E feeding, normal held bitten bread and native touch prompt.
- `ducks-swimming-river.png`: four ducks floating on the existing river, elevated representative view.
- `river-without-ducks-control.png`: identical final scene/camera with only the new flock hidden for
  comparison. This is a runtime feature-off control, **not** a historical source-build screenshot.

The feeding picture was refreshed alone after a Swedish prompt wording correction with
`--feeding-image-only`; this does not replace the full recorded ten-check pass.

Scope: original-only animals/gameplay; no applicable public transfer and no A/B/C/L building variants.
River geometry, water/shore grades, paddock fence, terrain and existing food quantities are unchanged.
