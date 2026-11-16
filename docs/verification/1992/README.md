# Held chicken pieces (#1992)

The inventory reference is its existing 🍗 emoji, not a second 3D model. Held legs now
have tapered golden meat over an exposed pale bone with two knuckles, and the hand
grips below the meat. Bird-owned materials retain the actual golden/burnt colour.
Wings and breast portions keep their own source geometry; bird-local centring makes
them independent of the whole bird's world placement/yaw. Bites, shrinking, portions,
identity and saved format retain their existing behavior.

## Checks

- `node --test src/chickenpiece.test.mjs src/inventory.test.mjs`: 18/18 pass. Leg
  silhouette, exposed bone/knuckles, source materials, bird-pose invariance/source
  preservation, and existing inventory rules.
- `PLAYWRIGHT_MODULE=/path/to/playwright THREE_DIR=/path/to/three-0.170.0
  tools/browsertest.sh node tools/chickenpiecetest.cjs http://127.0.0.1:8792 docs/verification/1992`:
  all 13 checks pass; no browser page errors. See `result.json` for exact source hashes,
  each check and Chromium version. Controlled cooked-bird setup uses `loadState`;
  InventoryHUD, Hand, the native touch Ät action, eating, award, slot swapping and
  persisted-piece restoration are the actual production consumers. This is a scoped
  restoration check, not a separate full-page reload claim.
- `git diff --check`: clean. Diff/topic references reviewed.

Chromium 156.0.8078.4 / SwiftShader, 960×600, July/noon/clear. Screenshots switch the
actual app to full screenshot quality; logic uses its lazy test mode. This is not
physical-phone or performance evidence. No public transfer: this is original gameplay.

## Captures and capture corrections

- `golden-drumstick-inventory.png`: the new held leg beside its original inventory icon.
- `eating-drumstick.png`: the same model during the existing animation towards the mouth.
- `bitten-drumstick.png`: one bite leaves the smaller portion in hand.
- `wing-piece.png`, `body-piece.png`, `burnt-piece.png`: retained piece/cooking identities.

The initial fixture used `?shot`, which pre-hides the overlay and skips normal HUD
initialization. That fixture failed to click an invisible Ät button; it was corrected
to use the actual visible Start-touch control and the complete scoped run passed.
Visual review then found WSL had no emoji font. The existing local Segoe UI Emoji font
was made available to Chromium and **only the inventory capture** was retaken, with
unchanged application source and without repeating the green behavior suite.
`capture-retake.json` records this capture repair. Other screenshots retain the
original WSL font environment (their unrelated emoji controls can appear as boxes).
