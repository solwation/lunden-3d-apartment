# DJ panel layout, gloss and active faces — #1667

Controls now sit on the actual black 1.7 × .53 m panel instead of floating 31 mm
above it. The front/rear rows, LCDs and crossfader label move inward. A flush mixer
inset keeps the channel labels visible. Active PLAY/SLUMP/DANSA faces and their label
quads depress 6 mm and have a green emissive finish without adding a light source. The vinyl has
fine grooves and a soft paired highlight, painted into a small shared texture with
Standard-material roughness .28. All appearance dimensions are visual guesses.

## Scoped evidence

- `node --test tools/playroommusictest.mjs cloudflare/roommusic.test.mjs cloudflare/deploypaths.test.mjs`:
  23 passing checks, including shared PLAY/shuffle state and the new room-dance
  activity getter. A peer dancing in the room lights the indicator without starting
  or stopping our personal dance. Outside peers and stale poses after STOP do not
  hold the indicator on.
- `tools/browsertest.sh node tools/playroomdjcontroltest.cjs http://localhost:8771 docs/verification/1667`:
  actual Playroom + production DJInput, native E/arrows and emulated touch. All 15
  target boxes and 23 text/LCD ink bounds have at least 15 mm panel clearance. Rays
  from above each ink region confirm the label atlas is not hidden by the panel,
  mixer or control. Measured PLAY face y 1.039000 → 1.033000 m; its label y 1.040500 →
  1.034500 m. One fixture ambient light before/after: the DJ adds none. Vinyl texture
  channel range 75/255. The observer uses the production snapshot/sync path and sees
  PLAY B + SLUMP + peer DANSA pressed/emissive (three faces, 72 vertices), while its
  own personal `dancing` remains false. No page errors; peak 647 MiB.
- Combined diff and images inspected against the user's reference. The first render
  exposed the old raised centre inset hiding the newly seated channel labels; the
  inset was made flush and the scoped label-visibility check/images refreshed. The
  green native input/room checks were not broadened into a full-world startup run.

## Images

- `before.png`: exact user/reference bytes from `docs/dj-bord-knappar-utanfor-kanten.png`.
- `dj-controls.png`: matched operator view, with A inactive and B/shuffle/dance active.
- `dj-top.png`: overhead view of the complete black surface and all edge clearances.
- `dj-buttons-close.png`: inactive PLAY beside the depressed luminous DANSA face,
  plus visible vinyl grooves/highlight.
- `dj-observer.png`: receiver's actual Playroom after production snapshot/sync and
  existing peer-dance pose; same active controls without changing that visitor's dance.
- `dj-stopped.png`: playback/dance faces released after STOP; shuffle intentionally
  remains enabled as a retained selection mode.

These are production room models with ambient fixture lighting, Chromium/SwiftShader
and emulated touch, not physical-phone/performance or a complete multi-browser world
sweep. Room transport delivery is separately covered by the existing real Worker/
Node WebSocket tests. Main only supplies its existing peer iterator; no messages or
shared dance toggles were added.

A/B/C/L: no equivalent house variants for this original-only clubhouse control.
Public AGENTS.md/docs/upstream.md were reviewed earlier in this session: personal
music/gameplay and Cloudflare are excluded, so no downstream port is applicable.
