# Physical DJ controls — #1664

Two labelled turntables now have their own playback and track selection, with a
channel fader each, equal-power crossfader, master knob, shuffle, stop and dance.
The displays show the selected track and artist. No DJ choice menu is attached.
Static buttons/rails join the furniture batch; one 1024×384 atlas and one merged
moving-handle mesh add two draws and no lights. Layout dimensions are design guesses.

## Evidence

- `node --test tools/playroommusictest.mjs cloudflare/roommusic.test.mjs cloudflare/deploypaths.test.mjs`:
  22 passing checks. Covers independent pause/track/gains, equal-power mixing,
  validation, room observers, late join/hibernation, media cleanup/failure and the
  new Worker source dependency.
- `tools/browsertest.sh node tools/playroomdjcontroltest.cjs http://localhost:8771 docs/verification/1664`:
  actual Playroom + production DJInput, native E/arrows and native emulated touch
  taps. Per-side selection/play, cross/channel/master controls, shuffle/dance/stop,
  readiness and wall guards. Chromium 1248 / SwiftShader, 1100×700, desktop pointer
  events and emulated touch. Details in result.json; no page errors.
- Main binding review: ordinary locked/stats/reading gate precedes DJ keys;
  overlay/reading/measurement suppress the shared input handler; pointer actions use
  the normal reach/wall checks and `use` path. No existing menu or movement handler
  was moved. Changes are limited to the new DJ boundary.

`dj-controls.png` shows the production room/mixer after input checks (right deck
playing, crossfader near B, channel A lowered, shuffle enabled). `dj-stopped.png`
shows the same board after STOP. These are scoped room renders with ambient fixture
lighting, not whole-world performance or physical-device evidence.

Full-world startup was slow in this shared headless environment. A recovered actual
app context did pass E, side-specific arrows, two deck plays, cross/channel adjustments
and the first touch play; its next touch assertion used an unstable camera arrangement.
The final scoped fixture tests the exact extracted production input module with a
stable real room camera instead. No complete full-world sweep or physical phone test
is claimed. Physical device testing is not a closure gate under the project policy.

Public downstream: AGENTS.md and docs/upstream.md reviewed. Clubhouse music/gameplay
and its Cloudflare transport are explicitly excluded; no port applies. A/B/C/L house
variants are not applicable to this original-only clubhouse interaction.

## Publication

Implementation and result images: `0b9c2f7d8c181dcc25e102a807238c311fc85883`.
Images were embedded in the [issue comment](https://github.com/solwation/lunden-3d-apartment/issues/1664#issuecomment-6469230820)
and both pinned raw URLs returned HTTP 200 before closure.

- [Pages deployment passed](https://github.com/solwation/lunden-3d-apartment/actions/runs/40689681531), including the actual deploy-pages step.
- [Worker deployment passed](https://github.com/solwation/lunden-3d-apartment/actions/runs/40689681597), including the actual wrangler-action step.

One implementation worker plus conductor review. Approximate phase costs: setup and
implementation 10 minutes, verification/fixture correction/review 30 minutes, release
3 minutes. Repeated browser work was driven by the fade/matrix fixture race, slow
headless full-world construction, a stopped local server and the fixture's relative
media path. The final test renders only its two result frames; native input assertions
use the unchanged production target matrices and handlers. No performance improvement
is claimed from these emulated timings.
