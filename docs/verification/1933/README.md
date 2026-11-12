# Ring fixture visibility and failure contract — #1933

Baseline `c6ee8b692a048699ed5e45383360ffb7595055df`. This changes the component
fixture and its CLI only. Product Hand, its geometry, grips, ring/wrist surfaces,
one-handed right-hand priority and two-handed hug controller remain byte-identical.
No player-facing change/changelog or public downstream transfer applies.

## Reproduced false green

The unchanged legacy CLI really returned `PASS`, exit0, for all36 cases. Its
`palm` item was an empty Object3D with `grip:null`. Hand.gripOf therefore computed
an empty bounding box; Infinity propagated into NaN hand transforms. Both ring
palm cases and the wrist-palm case produced zero non-background pixels while their
mesh-selection/count checks still passed. Several left rings also had local
visible=true beneath the hidden left hand. The hug camera's cleared offset/FOV
was not reset for subsequent cases.

`before-exit.json` / `before-cli.txt` record the actual old CLI result.
`before.json` records all36 original return values plus read-only diagnostics.
The baseline wrapper added only a read-only exposure of fixture state to its HTML
module, and routed the pinned CDN imports to identical installed Three0.170 bytes;
the CLI/Hand/geometry logic was unchanged. The baseline wrapper and full original
image set were kept in the session's private scratch area. Three representative
before images are committed under `before/`, including the truly blank palm.

## Fixture correction and explicit diagnostic scope

- Palm has an explicit finite grip `[0,0,0]` on its grip frame, rather than pretending
  an empty object has physical bounds. This accessory fixture intentionally has no
  visible held prop: its intended models are Hand and the selected ring/wrist items.
- Every case resets the camera, model grip frame and mirror visibility. An off-axis
  view fits the complete posed hand/accessory vertices; camera movement cannot frame
  its own children. Full hand silhouettes remain inside the finite projection.
- Hug uses the actual production two-hand controller. Non-hug left accessory cases
  use an explicitly mirrored **diagnostic** copy of the production right-hand pose
  and its existing morphs. This exhibits the selected left accessory without changing
  production's legitimate right-hand priority for one-handed actions. Only required
  hands are shown; mixed-side selections and hug show both.
- Every original ring/metal/wrist/palm/grip/hug case and original ring-code/wrist-count
  assertion is retained. All36 must execute. Guards add effective ancestor visibility,
  correct ring parent/side, full local/world model/hand/accessory/mirror/scene matrices,
  full camera/inverse/projection matrices, finite native/morph attributes, complete
  hand vertex projection and actual intended pixels from paired hidden-target renders.
  The final shown scene is rendered again before its screenshot.
- Browser context and temporary profile cleanup are recorded on both success/failure.
  A local Three cache is preferred (`THREE_DIR` or installed Three), retaining the
  original pinned CDN fallback if no local cache is configured.

## Two scoped risk groups and actual exits

1. **Correct fixture and negative failure contract:** the real updated CLI returns
   exit1 for each deliberately invalid fixture: `empty-palm` restores the original
   empty-box/NaN error; `hidden-ancestor` hides the left mirror parent; `nan-camera`
   invalidates projection. Failures report the specific nonfinite matrices, hidden
   ancestor, zero intended target pixels or invalid projection. The contract runner
   records actual subprocess return codes in `cli-contract.json`, not an in-page
   assertion count. Negative JSON/logs remain alongside the result; their diagnostic
   screenshots are before/bug evidence under `before/`.
2. **Complete focused positive CLI:** all36 cases pass with actual exit0, no page/
   console errors, full valid projection and cleanup. Minimum observed intended hand
   pixels10,043; ring8; wrist176. Required lower bounds are200/2/2 respectively.
   These are visibility checks, not performance or product realism measurements.
   No World, network, geometry-edit, headshot or broad regression suite ran.

`result.json` contains all36 source-bound cases, matrices, projections, visibility
and pixel results. `cli-exit.json` / `cli.txt` contain the actual successful CLI exit.
The three `negative-*.json` / `.txt` files retain the expected failing checks and
successful cleanup. `manifest.json` binds final sources and PNG bytes and confirms
unchanged production Hand/config against the frozen baseline.

The saved full images opened for visual review include:

- `fp-ring3-m0-palm.png`: visible complete palm and left ring; compare the blank before.
- `fp-ring8-m1-reach.png`: right reach and its silver ring.
- `fp-ring4-m2-grip.png`: closed grip with ring, mirrored diagnostic left pose.
- `fp-ring2-m0-hug.png`: actual two-hand hug and ring.
- `fp-wrist-b1-w0-m0-reach.png`: left bracelet diagnostic reach.
- `fp-wrist-b2-w6-m1-hug.png`: actual two-hand hug with left bracelet/right watch.

All36 original result PNGs are retained for focused case review. No new product
form is proposed. Rendering used headless Chromium/ANGLE SwiftShader,900×600 DPR1,
fixed component lights and pinned local Three0.170, under the shared browser lock.
No physical-device, hardware-FPS, full-world performance or cgroup-memory claim applies.

## Reproduce

Serve this checkout and use the documented installed Playwright/Chromium environment:

```sh
tools/browsertest.sh node tools/handringtest.cjs http://localhost:8203 docs/verification/1933
tools/browsertest.sh node tools/handringtest.cjs http://localhost:8203 /tmp/ring-negative-empty --negative=empty-palm
tools/browsertest.sh node tools/handringtest.cjs http://localhost:8203 /tmp/ring-negative-hidden --negative=hidden-ancestor
tools/browsertest.sh node tools/handringtest.cjs http://localhost:8203 /tmp/ring-negative-camera --negative=nan-camera
```

The first command must return0, the next three must each return1. Use separate
negative output directories to preserve the successful palm image. The test records
its own source hashes and cleanup status. An initial local-module resolver setup
error was corrected before the successful final runs; no product workaround was used.
After the focused guards passed, only documentation/source review continued.

Root owns integration/publication, any actually triggered workflow result and pinned
HTTP200 issue images before closure. Before/negative PNGs are removed only in the
resolving commit after that comment; result PNGs follow the ordinary30-day policy.
This worker supplies a local Refs handoff and stops its own server/browser processes.

Root read the complete fixture/CLI and documentary delta and opened the blank baseline palm plus all six listed complete representative result images. [Integration identity](integration.json) proves all four executed sources and56evidence files exact after rebase; product Hand/config remain exact. The two green focused groups, including true subprocess exits0/1/1/1, are reused without a broad rerun. Current model/cache/history-link integrations are retained.
