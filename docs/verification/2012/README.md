# Finer hair and beards — #2012

Baseline `1c348ad4` (published #2002 head + #2011 gaze). Scope: hair and beard
builders in `src/avatar.js` (`hairParts`, `longHair`, `beardShell`, new `beardGrid`/
`moustacheShell`), the head-hair strand term in the shared fragment shader, and
`AVATAR_HAIR`/`AVATAR_BEARD`/`AVATAR_SURFACE.hair` guesses in `src/config.js`.
Body/torso/arm skinning, appearance codes and the network format are untouched.

## Images (production rig, runtime geometry, `tools/verify-avatar-head.html`)

`tools/avatarhair2012browser.cjs` serves the baseline `src/avatar.js` + `src/config.js`
for `before/` and the checkout for the result, same looks, camera, light and DPR 1.

| Pair | Shows |
| --- | --- |
| `before/hair-close.png` → `hair-close.png` | five styles (short, long, bun, beanie, curly), quarter close view: strands, tufted soft hairline |
| `before/hair-profile.png` → `hair-profile.png` | the same in profile |
| `before/hair-back.png` → `hair-back.png` | back view: the long-hair join is gone |
| `before/beard-close.png` → `beard-close.png` | facial 0–3: tufted beard edge, strand shade, moustache band instead of blocks |
| `before/beard-profile.png` → `beard-profile.png` | facial 0–3 in profile |
| `before/headwear.png` → `headwear.png`, `before/headwear-back.png` → `headwear-back.png` | long+beanie, curly+cap, bun+hat, short+beanie, curly+beanie |
| `before/phones.png` → `phones.png` | headphones on long, beanie style, short, curly |

## Triangles (drawn, per variant; `browser-both.json` and `tools/avatarheadtest.mjs`)

| Variant | Before | After | Change |
| --- | ---: | ---: | ---: |
| short | 11,700 | 11,892 | +1.6% |
| short + beard | 12,056 | 12,568 | +4.2% |
| short + moustache | 11,724 | 11,988 | +2.3% |
| short + beard + moustache | 12,052 | 12,560 | +4.2% |
| long | 12,428 | 12,588 | +1.3% |
| bun | 12,060 | 12,252 | +1.6% |
| beanie | 13,096 | 13,144 | +0.4% |
| curly | 17,012 | 17,372 | +2.1% |

Budget: +10% per variant over this baseline, and the existing #2002 guard
(+10% over a05683d) still passes (curly 17,372 ≤ 17,701). Attribute bytes grow
in the same proportion; the attribute layout (17 attributes) is unchanged. One
body draw, 15 bones, no texture, light or pass, no per-frame geometry.

## Checks

1. Node: `tools/avatarheadtest.mjs` 6/6 (two new #2012 tests: per-variant budget
   and shared scalp/curtain normals; the join test fails on the baseline,
   dot 0.84), `riggedavatartest.mjs` 11/11, `avatarbodytest.mjs` 12/12,
   `avatarcustomizertest.mjs` 24/24.
2. Triangle counts per variant as above.
3. One owned before/after browser capture (Chromium/SwiftShader), no page errors.
   During tuning, short zoomed captures found two new hat-cuff pokes (long-hair
   curtain ridges sampled by finer columns; a new curly lock tip): long hair keeps
   its curtain columns and curly lock ends lie flat at the nape; the zooms then
   matched the baseline.

## Limits

Still stylized opaque geometry, no hair cards. The beard+moustache opening still
shows its older lip patch below the moustache (unchanged). Pre-existing: a hair
block above the curly+beanie cuff in a side view and the bun under the brimmed hat
are unchanged. No phone, hardware GPU or World test.
