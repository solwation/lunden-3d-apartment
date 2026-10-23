# Rendering performance

Raw callback interval diagnostics (#1507): [capture protocol, state classification, statistics and measurement limits](frame-intervals.md).

## Startup resource profile: light wall pictures (#1511, part of #1506)

`src/resourceprofile.js` chooses `light` or `full` once in `main.js`, right after the renderer's texture cap is set
and before `buildWorldSliced`, so nothing is fetched before the decision; it never changes live and is independent of
the running Quality level. Auto rule: light when the renderer's real upload cap is ≤ `RESOURCE_PROFILE.light.max`
(512, today the `LOW_MEMORY` cap, so the full file could not be shown larger anyway) or `navigator.deviceMemory` ≤ 2
(*guess*, Chromium only). Device type is not read directly, but today the 512 cap itself still comes from the
`lowMemory` UA rule; no RAM/VRAM detection is assumed. `&res=light|full` overrides and is remembered in
`lunden.resProfile`; `&res=auto` forgets it. The decision and swapped files appear in the diag snapshot (`resources`).

First family: the eight photographed wall pictures loaded by `furniture.js` `painting`/`pictures`. `profilePath` maps
them to `textures/light/` copies made by `tools/lighttextures.cjs` at exactly the size three's upload resize produced
from the full file under the 512 cap. Same meshes, materials, bounds, raycast targets and collision; only the fetched
file differs. miele.jpg (600×440, also drawn by the Nest hub) and the drawing for the poster wall are left as they are.

Inventory before the choice (phone profile, d1cf66e0): only ten fetched image files exist (1.2 MB); everything else is
procedural. Existing pre-build variants: `CAMPUS_LOD` facades, car LOD, bird count, phone shadow tiles. Existing
"build full, shrink afterwards" paths: the 512 upload cap on every texture, `freeCanvasAfterUpload` canvases (still
painted at desktop size first) and freed geometry copies. `phonememtest` start route: 268 CPU canvases ~93 MiB after
warm-up (largest makers ao, computer hub, frozen meals, cups, painted picture, bottle labels), textures ~92 MiB GPU,
geometry CPU copies ~115 MiB. Those makers are the natural next families; each needs its own size parameter.

Measured with `tools/resourceprofiletest.cjs` (headless Chromium 1248/SwiftShader, phone = iPhone UA + `&lowmem`
844×390 touch, no physical phone; desktop 1280×800), against a baseline export of d1cf66e0:

| | phone before | phone light | phone `&res=full` | desktop before/after |
|---|---:|---:|---:|---:|
| family bytes fetched | 1 084 604 | 344 546 | 1 084 604 | 1 084 604 |
| all `textures/` bytes | 1 295 962 | 555 904 | 1 295 962 | 1 295 962 |
| decoded family sources (w×h×4) | 31.9 MiB | 6.0 MiB | 31.9 MiB | 31.9 MiB |
| family GPU allocations | 8, ≤ 512 px | identical sizes | identical | full sizes, unchanged |

The full picture files are neither requested nor assigned to an `<img>` on the light profile. Light vs `&res=full`
on the phone and the baseline give identical mesh bounds, vertex counts and raycast results; component pixels differ
by 0.35–1.95/255 on average (JPEG/resampling). Time to `__app` (35–70 s) and JS heap (464–599 MiB) varied more between
single runs than any effect, so no startup-time or heap gain is claimed. Decoded image memory is an estimate:
browsers may discard or keep decoded bitmaps; the GPU texture memory is unchanged by design. Public downstream:
the pictures are personal photos and are not in kvarteret-lunden, so no transfer applies.

## Paint procedural sources at startup profile size (#1549)

`profileCanvasSize` in `src/resourceprofile.js` applies the existing `RESOURCE_PROFILE.light.max`
(now tied to `LOW_MEMORY.maxTextureSize`) before allocating a backing bitmap; `profileCanvas` scales the
2D context so painters keep their authored coordinates. The kitchen's painted picture and its temporary
foil mask, and frozen-meal packaging, use it. Full keeps the original dimensions and pixels.
AO retains its original distance/blocker/hole grid, but on light samples the original byte values directly
into the capped canvas with bilinear interpolation. When dimensions already fit, including desktop/full,
the original pixel loop remains. The static post-upload release policy is unchanged.

The current computer posters are already 512 px wide, cups 512×192 and bottle labels 256×320;
they remain unchanged. Their family totals in the earlier inventory count many individually small canvases.
This is a bounded first procedural slice, not a cap on every canvas in the app. No material, geometry,
UV, physical ray target, quality level or gameplay callback changes.

`tools/canvasprofiletest.cjs BASE OUT BASELINE_DIR` compares actual AO, kitchen-print and Billys painters
with saved pre-change module sources (see [verification](verification.md#procedural-startup-canvases-1549)).
Full is pixel-exact; light average per-channel errors are 0.000013, 0.1824 and 0.6738/255 respectively.
The actual Billys/Gorbys open/closed model fingerprints and AO geometry/rays are checked separately.
Same actual World phone start route: 270/95.184475 MiB CPU canvases → 267/92.122463 MiB;
1.125 MiB is unrelated variation in three random cup patterns, leaving 1.937012 MiB attributable to
retained picture/packaging sources. AO saves construction canvas memory, not steady storage (already freed).
Texture allocations remain 97,427,515 bytes/207, draws 346/730,811 triangles. No timing/heap gain is claimed.
See [source-bound results and image](../verification/1549/README.md).

## Merged furnishings seen from outside (#1540, partial #1537)

Phones only (`DetailCuller.buildProxies`, `src/detail.js`). Once at start, right after `freeSceneGeometryCopies` has packed
the normals and before the first upload, every furniture root (`'phoneDetailUnit' in userData`) gets a proxy group: each
material (with the same shadow flags, depth materials and attribute layout) used by at least two of its static, opaque,
native parts becomes one merged mesh in the piece's own frame. Things to take, picture frames and wall mirrors, transparent,
instanced, skinned, morphed, custom-render, mirrored or dynamic parts and parts over `PERF.detail.proxyMaxVertices`
(10000, *guess*: a heavy part is worth its own call) stay as they are. The proxy meshes never raycast and sit on the hidden
layer until used; their CPU copies leave once uploaded (the warm-up draws them).

`updateProxies` runs after the culler's own judgement each frame (~0.04 ms at the patio view). A proxy replaces its parts
(they go to layer 7, still physical) only from outside the flat, beyond `minDist` + its radius (so reach, E and focus use
the real parts), while every merged part is still attached, shown, unchanged in geometry/version/material and at its
built relative matrix. A whole phone model swaps as judged (#1383/#1456: all its layers still change together); another
furnishing swaps while any part is drawn and the culled parts it would add stay under `PERF.detail.proxyExtraTris` (2000,
*guess*), so the proxy may show a few small parts the distance had culled, never fewer. An opened door, a taken or hidden
part or a new material shows the real parts until it is back as built; moving the whole piece keeps the proxy. Nothing is
rebuilt while playing.

Measured on 1152c9c2 (real World, 844×390 lowmem/touch, quality 3/3, July 12:00, clear), main-pass calls/triangles:

| view | before | after |
|---|---|---|
| patio toward house (2.9,16, 0°, −5°) | 456 / 919258 | 414 / 932070 |
| patio corner | 366 / 854910 | 348 / 861486 |
| patio far (2.9,22, 0°, −3°) | 440 / 854162 | 409 / 860052 |
| near door (2.0,13.5, 20°, −5°), patio, start | 305 / 133 / 360 | unchanged |

22 proxies, 50 meshes from 380 parts: 10.5 MB geometry on the GPU, no textures. Without the vertex cap 17.3 MB saved
4–6 more calls. Pixel diffs: 48 / 20 px at toward-house / far (small parts now kept), 0 elsewhere. The toward-house view
still needed more: the bottles and glasses to take (two calls each, a material of their own per bottle) and the curtains
followed in #1545 (below); furniture within reach of the patio keeps its real parts. Hus A/B/C and L1004 have no
furniture roots in the culler: not applicable. Check: `node --test tools/phoneproxytest.mjs`.

## Bottles, glasses and curtains seen from outside (#1545, part of #1537)

Phones only, built in the same `buildProxies` call (`main.js` passes `things` and `blinds.curtains`), in the world frame:

- **Bottles and glasses at home** (`buildThingProxies`; things of kind whisky/wine/champagne/glass, not held or placed):
  static native parts without texture maps merge across materials that differ only in colour, roughness and metalness
  (`lookKey`); the proxy material (`lookMaterial`) carries those three per vertex (`color`, `proxyRM` via a fragment-only
  `onBeforeCompile`; the lamp wash patches it like any other). Identical physical materials (the BESTÅ crystal) merge as
  they are. A part the distance alone always culls beyond reach (`baseCut × outsideScale ≤ minDist`: caps, corks) and the
  textured labels stay their own items.
- **Curtains** (`buildCurtainProxies`): a curtain's cloth panels share one material and become one mesh whose positions
  and normals `refreshLive` rewrites from outside when the panels were rebuilt (drawn/opened); a material-library choice
  for the whole curtain is adopted. The proxy keeps its CPU copy (a few KB per curtain).

Unlike the furniture proxies these draw exactly the parts the culler would draw: `updateProxies` judges each part on its
own (drawn by the culler, its box beyond `minDist`, `memberValid`: attached, shown, same geometry/version/material/look and
relative matrix), `fillProxy` writes only those parts into the index (draw range), see-through ones far to near from the
eye as three sorts separate see-through meshes, rewritten only when that list or order changes. A taken, moved, recoloured
or near part is drawn itself while the rest stay merged; with fewer than two parts left the parts draw as before. Nothing
moves for interaction: the parts stay physical on layer 7, proxies never raycast. The warm-up compiles the two new
programs (vertex-coloured opaque and see-through); `?shot` skips the warm-up, so headless runs compile them on first view.

Measured on 3c204143 (real World, 844×390 lowmem/touch, quality 3/3, July 12:00, clear), main-pass calls/triangles:

| view | before | after |
|---|---|---|
| patio toward house (2.9,16, 0°, −5°) | 412 / 945886 | 368 / 945886 |
| patio corner | 347 / 874539 | 340 / 874539 |
| patio far (2.9,22, 0°, −3°) | 407 / 875086 | 402 / 875086 |
| near door (2.0,13.5, 20°, −5°) | 304 / 719038 | 278 / 719038 |
| start, patio | 364 / 135 | 361 / 135 |

Triangles are unchanged and every pixel diff is 0 (also January 22:00 with the lamps: toward house 406 → 362, and all
curtains drawn: 420 → 376). 8 proxies from 53 parts, +0.66 MB geometry, no textures; `updateProxies` ~0.13 ms instead of
~0.06 ms per frame headless. *Patio far* still exceeded 370: its interior bottles and glasses are already culled there; the rest
was mostly our car under the patio (#1541, below). Houses A/B/C and L1004 have no bottles, glasses or curtains in these proxies: not applicable.
Check: `node --test tools/phoneproxytest.mjs`.

## Our car in its stall while the garage is not drawn (#1541)

`garage.update` draws nothing of the garage (`garage.object` hidden, the door's blackout shown) unless the camera is down
there, at the stairwell's foot, by a park entrance or outside its door. Our car in its stall under the patio stayed drawn
regardless: ~36 phone draw calls under the ground at *patio far*. `main.js` gives the car root
`userData.drawnHidden = () => car.state === 'garage' && !garage.object.visible`; `DetailCuller.gated` (phone and desktop)
then moves all its unit meshes to the hidden layer (still physical) and, once the gate no longer holds, judges every part
afresh in the same update (`garage.update` runs before `detail.update`). Driving, parked outside or with the garage drawn,
nothing changes.

Measured on 5ba0493e (real World, 844×390 lowmem/touch, quality 3/3, July 12:00, clear), main-pass calls/triangles:

| view | before | after |
|---|---|---|
| patio far (2.9,22, 0°, −3°) | 402 / 875358 | 364 / 852232 |
| patio corner | 343 / 875087 | 325 / 860227 |
| park | 355 / 765642 | 330 / 745554 |
| bike yard | 241 / 737182 | 223 / 718442 |
| living | 333 / 818812 | 329 / 811976 |
| other phone profile views, patio toward house, near door | unchanged | unchanged |

Pixel diffs before/after are within the base-vs-base noise in every view (0 px at patio far and patio corner). Down by
the car its 38 draws are back. The phone perfcount profile now also counts *patio far*: ALL PASS, most calls 364 there.
Houses A/B/C and L1004 have no car of ours: not applicable. Check: `node --test tools/phonedetailunittest.mjs`.

## Patio screen walls and the phone corner (#1498)

The exact phone repro (844×390 touch + lowmem, initial quality3/max3, July 12:00 clear,
`spawn(6.5,19,0)`, step, `lookAt(3,.7,17.2)`, step, one render) drew 493calls/961330tri
against 370/950000. An ID-render diagnosis showed ~290 of them were the flat and patio
seen past the 1.8m patio screen walls (`site.fences`), which were not opaque
rectangles. `world.js` now adds our two screen walls and `exterior.js`
(`userData.opaqueRects`) the Hus L neighbours' identical ground-floor screen walls to
`openings.opaque`; they are the exact rendered boxes (0–`FENCE_HEIGHT`). The
DetailCuller (phone and desktop) and the desktop color hooks use them.

Phones now pass the same Detail occluders to `tightfrustum.js` as desktop; it first keeps
only rectangles that meet the view frustum (a sight line to a drawn point can only be
blocked inside the view: fewer proofs, never a wrong one). The site-instance packing
stays desktop-only: in the phone profile it cost ~8–21ms pure hook CPU per render
(SwiftShader host) to save ~15calls. Measured hook CPU: frustum without occluders
~3.5ms, with filtered occluders ~4–7ms.

Result: phone corner 366/854832 (ALL PASS, now part of the phone perfcount profile);
desktop corner 514/967709 → 380/810149; every phone view is equal or lower (start
368→359, kitchen 357→343, garage 299→267). The reverse patio view (`patio toward house`,
2.9,16 yaw0 pitch−5) is still over the phone budget (514→456 calls), tracked in #1537.
Hus A/B/C have no patio screen walls; Hus L's upper roof-terrace screens are not added.

## Patio corner within the desktop budget (#1459)

The exact normal1280×800 quality3/max3 repro is `spawn(6.5,19,0)`, one production
step, `camera.lookAt(3,.7,17.2)`, then one production step and one render. Matched
same-World source/current:556calls/1076659tri →514/967709. The unchanged full profile
now appends this corner after its previous20 desktop views: ALL PASS,514calls/
967709tri/~311MiB against520/1M/320. No quality/budget, camera or car-hysteresis
rules changed. These are submission costs, not device frame-time measurements.

`siteinstancebatch.js` collects only existing environment tree, street-lamp and
parked-car batches on desktop. Shared geometry/material color proxies pack complete
current instances whose full boxes meet the native camera frustum and are not wholly
covered by an existing active opaque rectangle. Original objects/instance buffers,
physical rays and fresh shadow submissions stay authoritative. The hook installs
outside `tightfrustum`; reflection/target/all-layer renders use original populations,
and all masks restore in `finally`. Renderer-time LOD children, unknown vertex shaders,
wind/deformation and nonuniform/sheared/reflected source frames stay native.
Changed matrices/counts/colors and position versions are read before each draw.

The existing exact-box frustum hook also runs on desktop, with optional current
Detail occluders and the existing near guard; noDetail and LOD-owned masks retain
their policies. Phone frustum behavior is unchanged. Adjacent book-board groups with
the same material coalesce12→4calls while preserving every vertex/index/material face;
taking the same book and restoring its home still work. This private book change is
excluded from public transfer.

Fresh-shadow corner/entrance/garage image pairs have0changed pixels and equal per-source
caster triangles/masks. Four positive actual physical rays retain their hits; native
checks cover current transforms, buffers, count/color changes, openings, near objects,
unsupported programs and nested/failed renders. A/B/C/L architectural geometry, glass,
doors, ground/query contracts and their distinct builders are not remodeled. See
[verification](verification.md#patio-corner-1459) and the [delivery record](../validation/issue-1459/README.md).
The neutral public tree/lamp transfer is tracked in `solwation/kvarteret-lunden#139`.

## Highest phone quality within budget (#1453)

Final published acceptance is separate from the local369-call result below:
43f6701's live startup includes two extra two-triangle surfaces and measured371
calls (FAIL). A lone planar CoreHouse pane now uses one double-sided transparent
pass (`forceSinglePass` only when `geo.glass.length === 1`). A/B/C each have one
flat pane; Hus L's noncoplanar multi-pane batch remains unchanged. No geometry,
alpha, depth, side, collision or query policy changes. The fresh local full19-view
quality3 profile is368calls/814170triangles/~97MiB, ALL PASS. Final published
results and the exact source revision are recorded in #1453 after deployment.

`src/tightfrustum.js` refines Three's existing sphere-frustum test with a private
full-position box on low-memory color renders. It preserves the actual current
world/instance transforms and adds a 1cm numerical guard (`PERF.frustumPad`),
without changing quality, distance, occlusion or authored geometry bounds.
Position and instance boxes cache by attribute/array/version/count. Dynamic,
custom/interleaved position access, skins/morphs, displacement, custom render
callbacks and unknown vertex programs veto the additional proof. Ordinary mesh
and line-segment positions qualify; `vertexcompile.js` recognizes only exact
registered fragment-only callbacks (lamp wash and foliage normal shading).
Wind and other deformation remain excluded. The shader bodies/cache keys are unchanged.

The wrapper installs after entrance batching and shadow tiles. Original masks
are restored before shadow tiles copy their sources, for nested render cameras/
render targets, and in `finally`, including exceptions. Mixed/all-layer warm-up
keeps its old policy. Physical source objects, rays and persistent Detail masks
are unchanged outside rendering; existing entrance originals/proxies are excluded.

The two rigid shade parts in the Hue Go bowl and Dani fabric cylinder/cap share
one material/anchor and now merge at construction. Their vertices, normals, UVs
and Dani UV1 match the original builders exactly;48 positive rays and lamp targets
are retained. Transparent rims, glow planes, pick meshes and material selection
stay separate. This does not change geometry detail or texture quality.

The fresh full19-view highest-quality landscape profile improves399calls at
kitchen (FAIL) to369 at start (PASS); max814172tri/~97MiB, unchanged limits
370/950000/225. Initial level3/max3/testMode-null are recorded before any quality
checks. Fresh portrait passes298calls/683734tri/~101MiB; desktop (no phone
frustum hook) passes504/986353/~309MiB against520/1M/320. Both production lamp
targets toggle through trusted touch; Hue Go color action and actual movable
root/refresh retain their sources. Normal startup completes the existing warm-up.
The published revision is recorded with final issue verification. Six frozen frustum image pairs have identical
fresh shadow submissions; eight measured image pairs have0changed pixels.
The initial post-upload attribute comparison had freed CPU normal/UV arrays and
is not accepted as attribute evidence; separate pre-upload actual builders give
finite exact position/normal/UV/UV1 matches and24 positive rays per lamp.
Raw scripts, all rejected probes, full profiles and images are retained in
`/tmp/orkester-katt-20261020/phonepeak1453/`.

Entrance wind bounds (#1460): source spheres are repaired after compression;
the color adapter and its own envelopes remain unchanged. Native10 cases include
all four actual compressed geometries, every vertex at the full local XZ clamp,
unchanged attributes and repeated shadow setup. In the actual quality3/lowmem
World, uploaded-source data reconstructs vertex835 at time10.016667/power.0249941
outside the old sphere by.0263409m. A real diagnostic orthographic frustum includes
that point and submits its original mesh0→1 times (+408tri). Both diagnostic
images are gray: this proves draw eligibility, not an observed visible leaf return
or GPU transform feedback. Normal front/loft pairs match; fresh shadow submissions
increase258→259 and281→282. The production clones retain all26 wind-depth callbacks.
The matched full19-view phone quality3 profiles both remain SOMEFAILED:
399calls/841837tri/~95MiB against370/950000/225. The matched standard20-view desktop
profiles both pass513/989457/~311MiB with the front door open and wind frozen;
this fixture is separate from the older closed-door profile and #1459's corner.
The targeted quality0 zero-wind pair retains294/740506 main submissions with
192→193 shadow draws and0 changed pixels; no new full quality0 profile is claimed.
Runtime arrays/materials/matrices/raycast/shadow callbacks remain identical after
one setup draw. The combined zero/identity driver exits1 later on a hidden phone-menu
mouse button; its completed phases are saved separately, with no completed E/touch
suite claim. An earlier identity fixture failure is also retained. Public6c69323a has no entranceplants,
plantwind or windShadow target, so no port applies. Raw drivers, images, profiles
and rejected fixtures remain in `/tmp/orkester-katt-20261020/windbounds1460/`.

## Distant street-lamp pools (#1466)

The merged path/road lamp-pool mesh keeps its positions, batches, color and day/night
opacity. Its additive opacity now follows the scene's existing linear/exponential fog
factor, so distant pools disappear into fog instead of adding bright fog-colored patches;
near pools remain visible. This is a fragment-alpha change. The controlled actual-World
comparison retains 616 calls/1,120,820 triangles in the far view and 27/242,562 in the
near view. No light objects or draw submissions were added.

## Complete terrain source cells (#1462, partial #1459)

Desktop separates complete original grid cells whose centers are east of x0 and south
of z60 from the remainder, including the unchanged park fill. `TERRAIN_FAR.renderSplit`
records these measured render boundaries; no height/grid/LOD/quality rule changes.
The two meshes share the original position/normal/UV attributes and seasonal material,
partition its ordered indices exactly, and bound only their referenced vertices.
Native main/shadow-camera frusta determine submission. The invisible `site-terrain`
query master retains its original object, geometry, default layers and physical rays;
render siblings have no raycast. Phones keep the original visible single master.

Actual same-World standard quality3 pairs on35a75c93: corner558/1110428 →
558/1074784 calls/triangles; exposed hedge520/976845 →520/941201;
river46/342434 →47/342434. All three pictures and fresh shadow caster identities,
counts and triangles are exact. The corner remains over520/1M; #1459 is unresolved.
The earlier557/1110020 baseline belongs to its separately recorded fixture, with no
historical cause inferred. Complete fresh production20-view/quality profile passes
506calls/977835triangles/~311MiB. Other views can add one call; no global call saving
is claimed. No new full phone profile is claimed for its unchanged master branch.


## Complete east-campus material contributions (#1461, partial #1459)

Desktop `sitebackdrop.js` merges the existing `east-modern` contributions into three
fixed complete-source geographic groups: northern campus, eastern campus and western/
street campus. These are ten complete building contributions to one material, not ten
standalone complete building meshes. Every other brick/roof/glass/access batch, source
record and original one-pass generation remains unchanged. Phones retain the original
single modern master batch. Native main/shadow-camera frusta decide submission; there
is no added camera gate, distance rule, LOD or quality change.

On2199c273, the normal standard-quality3 corner (6.5,19), lookAt(3,.7,17.2), final
production step gives557calls/1137384tri→557/1110020:27364saved with unchanged calls.
This remains over520/1M and #1459 remains unresolved. The normal exposed hedge view
increases518→520calls with unchanged976845triangles: exactly the cap, no draw headroom.
Both fresh-shadow pairs have0changed pixels. Full20-view desktop/quality checks pass
506calls/997953tri/~311MiB against unchanged520/1M/320limits. These are actual production-
builder meshes installed in the retained real World. After rebase onto1fac368a, a CPU-only
census of all26 entrance wind meshes at those20 cameras plus corner/exposed hedge
finds no eligible main-camera membership changes; exact repaired spheres are applied.
The first census mutated its logged old spheres during final application; corrected
static-versus-padded sphere records retain the same zero membership delta.

Ordered position/normal/color attributes, all seven other material batches and complete
source query records compare exactly. Thirty positive modern-surface rays retain their
hit counts/distances. Three modern meshes share the original surface material and shadow
flags. The existing source/window/pediment/tower/open-courtyard checks pass, including
1013outward windows. Its old78000 asset cap fails81997 in this full-World fixture,
exactly the unchanged original81997; hidden diagnostic meshes caused the earlier
131035fixture count and were removed. Actual native touch opens/closes the focused
glazed door0→1→0 with positive wind and0page errors. The original phone generation/
batch selection is unchanged; phone results are
inherited from #1457's explicitquality0 profiles (landscape367/840699/~98MiB,
portrait279/705447/~102MiB), not fresh #1461 runs or defaultquality3 acceptance.

The public app has the same neutral campus builder; a separate LOW transfer is required
after source publication. A/B/C/L shells use separate builders and are not changed;
west/north use this shared function's original unsplit branch. Raw proofs/pairs/profile:
`~/.local/state/lunden-orkester/codex-surface-20261020/east1461/`.


## Complete phone models behind separate actual opaque patches (#1456, partial #1453)

Only existing complete `phoneDetailUnit` models with an actual Garage can use the
additional proof. Every current mesh/line part must have its entire conservative box
covered by one existing actual opaque rectangle. Different parts may use different
rectangles; any exposed, near, exterior-door or unsupported part vetoes this new proof.
All model layers change together. The old padded union box,0.2m visual LOD guess,
near/distance/quality policy and actual-visible-garage/no-Garage rules remain unchanged.
This independent exact-point coverage proof does not duplicate a visual LOD pad onto
each part. Private full native static Float32-position bounds ignore authored geometry
boxes and refresh on attribute/array/version/count changes without modifying shared bounds.
All current instance matrices participate; full wind attributes expand locally before
transforms. Actual wind shader callbacks remain unsupported in this added path.

`lampwash.js` records exact fragment-only callback wrappers and their captured predecessors.
Only chains ending at the native callback qualify; unknown vertex/shadow callbacks,
skin/morph/custom shaders/displacement and dynamic/custom position attributes veto.
The shader body, uniforms, keys and lighting are unchanged. This is a rigid-model
improvement, not an optimization of actual wind plants or new geometry/culling distances.

On80c78366 the actual844×390 lowmem/shot quality3/max3 preflight gives411/769982→
404/767734→411/769982 in one World. Exactly seven submissions/2248triangles disappear:
the complete tube floor lamp and lower-bunk wall lamp in Hus L. A later primed World's
matched full19-view/quality profiles give412→405peak calls, unchanged841837peak triangles
and~98MiB. Both remain **SOME FAILED** against370; #1453 stays open. The separate
quality0 point probe is371→364→371, not a new complete quality0 acceptance run.
Desktop has no added decision path and fragment-only shader output is unchanged.
After integration, #1454's20-view desktop profile is inherited as **SOME FAILED**:
504calls/1000585tri/~311MiB; the old19views pass, and #1458 tracks the remaining overrun.
No new full desktop profile is run here. #1455 separately measured full quality3 phone
FAIL399calls/841837tri/~98MiB, full quality0 landscape PASS367/840699/~98MiB and
portrait PASS289/705267/~102MiB. Those are inherited results, not new #1456 full runs.
The fresh integrated quality3 start on e4914dcb measures398/769982→391/767734→
398/769982. None of the40 rigid entrance source meshes belongs to any phoneUnit,
and their exact layer masks match before/current; the new proof cannot change their
adapter eligibility. This is a targeted integration check, not a post-rebase full profile.

Native30/30 passes. Six normal phone image pairs with fresh shadow updates have0changed
pixels; all12 pictures were inspected. Three real lamp records (including the already
hidden upper-bunk sibling control) restore on `furniture-moved`, retain positive identical
physical layer7 rays and exact geometry/material/position-array/authored-box/transform/
shadow identities. The first combined driver retains CLI1 because keyboard E was attempted
after touch without mouse lock; its complete image/lifecycle/profile phases are saved.
Separate actual pointer-locked E and native touch-tap controls both open the focused
garage with one press, CLI0 and no page errors, at explicit quality0/testmode-off.
The duplicated-LOD-pad hypothesis saved0 and remains recorded separately.
The six image pairs/lifecycle/full19 profiles above precede the independent1454/1455
rebase; the targeted point/membership check is the new final integration evidence.
Raw drivers/results/failures live in `/tmp/orkester-katt-20261020/wholemodels1456/`.

The private furniture policy has no current public runtime target: public `origin/main`
has no `detail.js` or `lampwash.js`. No unused culling system or private furniture is ported.

## Southern crossroad (#1433)

Two exact-terrain service strips add1822asphalt triangles. The existing lamp generator
adds seven guessed fittings while preserving all117old roadside records:1400post/head
plus420night-pool triangles. Static daytime growth is3222triangles; total resource/night
growth3642triangles. Batches, materials, textures, terrain and existing access/path arrays
stay unchanged. A full standard19-view desktop/quality run on9eb4ccfa plus these roads
passes478calls/985707triangles/~309MiB, with unchanged520/1M/320limits. The full explicit
quality0 landscape844×390 phone/quality profile also passes370calls/837612triangles/~97MiB
against unchanged370/950000/225limits. Ordinary running
before/after camera captures differ by3278triangles; their extra56frame submissions are
not attributed to the verified static buffer delta, and no pixel-parity claim uses them.
After final rebase onto e6b74287 (#1448), a new full standard desktop19-view/quality
profile passes478calls/985707triangles/~309MiB with every quality check. Phone coverage is explicitly
composed from the earlier full PASS and source branch parity: the original master-array
generation is byte-equal after removing new slice bookkeeping, lowMemory still selects
exactly the same three combined arrays, and the lifecycle suffix is byte-identical.
No fresh post-rebase full phone run is claimed.
Raw profiles, rejected width candidates and the original Float32-cap ray failure remain
in `/tmp/orkester-katt-20261020/crossroad1433/`; see [verification](verification.md).

## Northern southern-site service roads (#1432)

Four new source strips use exact emitted-terrain clipping only through their explicit
`terrain: 'triangles'` opt-in:2273asphalt triangles, zero additional batches/materials/
textures. The existing road-light generator adds four guessed fittings and removes
one newly obstructing fitting, preserving the other113roadside records. Net lighting
is600post/head plus180night-pool triangles:3053resource triangles total,2873submitted
daytime triangles in the matched ordinary desktop entrance/overview captures, unchanged25/31calls.
Full844×390lowmem quality0perfcount passes all19poses and quality checks at370calls,
834390triangles/~97MiB; limits370/950000/225 are unchanged. On pre-rebase dae61d45, standard desktop was
SOME FAILED/CLI1 at hall1003285/basement1004393, exactly the previous1000412/1001520
plus2873daytime triangles;478calls/~309MiB remain within limits. This historical failure remains recorded separately from final integration after#1439;
do not infer desktop acceptance from the phone result.
After final integration onto de1bc21b (#1439), a fresh full standard19-view desktop/quality
profile passes478calls/982485triangles/~309MiB (hall958665/basement982485). The reviewed
service runtime files are byte-identical across that rebase. The fresh final explicit
quality0 phone844×390 profile also passes all19views/quality checks at370calls/834390tri/~97MiB.
Both historical failures and final integration results are retained separately.
Actual geometry/identity/ray evidence and failed server attempts are retained in
`/tmp/orkester-katt-20261020/service1432/`. See [environment](environment.md) and
[verification](verification.md) for the source/guess and reachable-walk boundaries.

## Contents behind currently drawn garage ceilings (#1439)

`DetailCuller` optionally receives the actual `Garage` and reuses the exact
`garageCeilings()` filter: no core, outside recess or new slab becomes opaque.
A rectangle counts only while its actual area shell/material/ancestors are visible
on the camera layers. Parent-layer checks are conservative additional exclusions,
not Three traversal semantics. A visibility signature refreshes stationary eyes;
tools without Garage retain their old policy. Complete current AABBs, full wind
bounds, near/exterior-door guards, distances, physical layer7 and geometry stay intact.
Rearrangement uses the existing `furniture-moved` hook; no movable gets a static gate.

Native22cases pass, including A/B/C/L ceiling/hole mappings. Paired standardquality3
hall345/1000412 becomes282/955792; basement334/1001520 becomes314/979612 on426f9922.
Six matched hall/basement/core/edge/patio/ramp pairs have0changed pixels. The underground
edge is diagnostic, not a normal walking route. A real registered Verona root follows
128→1below→128restored→1exposed using the production refresh; actual triangle192 gives
one identical physical hit at~2m, with geometry/material/raycast/root-matrix identities.
Full standard19-view desktop/quality checks pass480calls/979614triangles/~311MiB against
520/1M/320. Extra arbitrary patio poses exceeding1M in both policies are separate#1448.

The first unpinned phone profile fails410calls against370; its initial level was not
logged. A separate shot start records actualinitial3 before quality callbacks,410new/
411old calls and0active ceilings. Warmed post-quality-test level3 old/new/new is exactly
412calls/763874triangles. Highest-shot phone failure#1453 is independent; the configured
non-shot phone start is2. Explicit quality0 profiles pass: landscape370calls/831517tri/~97MiB,
portrait289/699155/~101MiB, all19views/quality checks. Landscape's later harness tap failed
for missing hasTouch; its budget phase passed. Portrait hasTouch tap opens the actual
garage door once(t=1,presses1), CLI0; its post-profile fullscreen picture is1400×950,
not a phone-size/FPS or physical-device claim.

An unconditional-ceiling prototype was rejected for2186changed pixels where the
actual shell was culled; corrected active-shell pairs are exact. Failed ray/relocation
fixture attempts remain private. Initial93c7d220 metrics and old quality0 passes do
not establish a historical regression cause. Final rebased source includesdae61d45's
independent hidden-room DJ change; no outdoor cost is attributed to that feature.
Public6c69323a has no corresponding private `DetailCuller` or furniture, so this
connection has no applicable target; no private contents/new culling system is ported.
Raw logs, images and honest failed-fixture history are outside the repo at
`~/.local/state/lunden-orkester/codex-surface-20261020/budget1439/`.

## Complete pergola lamp groups (#1438, partial #1431)

The courtyard's existing272 sphere instances now form two complete pergola batches
(152/120), sharing the same geometry and material. Flattened instance order, all matrix
elements, geometry attributes/index, night/power colours and physical rays are exact.
Each full pergola retains `CeilingBatchGate`; its bound equals every transformed sphere
vertex. The existing gate and frustum can judge the two pergolas separately. No actual
ceiling, opening, distance/quality policy, light or budget changes.

Matched ordinary19-view standard-quality profiles on14530bfe reduce basement triangles
1011120→1001520 (9600, the second pergola's120 unchanged spheres). Hall stays1000412.
The result is still **SOME FAILED/CLI1** against1M; #1439 owns the remaining standard
profile, and historical quality0 passes do not establish a standard-quality regression.
Peak calls478/520 and textures~309/320MiB remain within their limits.
Both complete phone quality0 profiles are **ALL PASS/CLI0** with unchanged370/950000/225
limits:844×390 peaks370calls/831517tri/~97MiB;390×844 peaks289/701183/~101MiB.
The rejected per-string experiment's380calls and all failed logs remain private.
The final rebase includes93c7d220's independent speakers in the hidden remote playroom;
a fresh integrated844×39019-view/quality run still passes370/831517/~97MiB, CLI0.

Native ceiling/occlusion tests pass13/13. An ordinary quality3 World additionally passes
18 original-builder identity/lifecycle checks, all272 physical layer0/7 sphere rays and
real garage-button focus/Använd (one press, fully open after normal simulation).
Six actual/forced-on image pairs have0changed pixels, including both visible pergolas,
garage roof edge, basement and hall. The extra upward ceiling framing is not visual
evidence of a core opening. All12 pictures were opened; existing native rectangle/hole
tests cover the unchanged shared A/B/C/L ceiling filter, not four new house renderings.
Raw scripts, images, profiles and failed fixture attempts remain outside the repo in
`/tmp/orkester-katt-20261020/budget1431/` (`takeover1438/` for final identity/images).
The first native attempt lacked the pinned Three package; the first browser fixture
incorrectly omitted the source cross-string's+0.12m z offset. Corrected fixtures pass
without changing production geometry or relaxing the exact vertex-bound comparison.

Neutral public applicability is tracked separately as kvarteret-lunden#115, after its
existing gate transfer#108. No private courtyard contents or services are transferred.

## Desktop exterior detail behind actual walls and floors (#1421)

The upward patio view submits557calls/1096203triangles on the measured pre-fix
source. Most extra calls belong to apartment contents beyond its windows. The exact
opaque-rectangle proof in `DetailCuller.wallHidden` previously ran only on phones.
Desktop now also uses it from outside, with the existing3.2m near exemption and
exterior-door, whole-unit, distance and quality policies retained. One real wall/floor
rectangle must cover every corner of one complete existing render item's world AABB.
This removes no visible model fragment and introduces no new wall, model clipping,
frustum rule or distance cutoff. Desktop wind meshes expand their local bounds by
the shader's existing maximum sway before rotation/scaling. Phone policy is unchanged.

The rejected logical furniture-model strategy saved only31calls/45724triangles.
The complete-render-item proof saves134calls/110782triangles with0changed pixels. Geometry,
buffers, matrices, visibility flags, shadows, targets and physical layer7 rays stay intact.
The same existing A/B/C/L opaque-data builders retain their original openings;
no house geometry or opening is added or changed.

`node --test tools/desktopocclusiontest.mjs tools/phonedetailunittest.mjs tools/occlusiontest.mjs`
passes18cases: opaque floor, separate patches/opening, overlap, exposure restoration,
inside/near/exterior-door exemptions, rotated/scaled wind bounds and physical identity.
Actual production verification after e1a61da7 uses960×600 touch, quality0, clear July
noon at(2.9,1.62,16), yaw0°, pitch25°:558/1098694→424/987912,0changed pixels.
Inside counts remain409/961868 under both policies; real near-button focus/Använd
opens the garage with1press and0page errors. Native final runners exit0.
Full19-view/quality profiles allPASS: desktop437calls/996190tri/~309MiB;
landscape phone369/833288/~97MiB; portrait290/718564/~101MiB. Limits unchanged.

The earlier running-loop image pair is excluded from pixel-parity evidence.
Raw profiles, exact-rectangle proofs, matched images and final logs are outside the
repo in `~/.local/state/lunden-orkester/codex-surface-20261020/upward1421/`.
Downstream assessment: the public app has no `DetailCuller`/`src/detail.js` and excludes
the private furniture causing this case. This branch change has no applicable current
downstream target; no new public culling system or transfer issue is introduced.

## Complete static batches behind actual garage ceilings (#1387)

Only two opted-in static roots are affected: the three merged roof-terrace decoration
meshes and the courtyard pergolas’ complete272-bulb instance batch. `CeilingBatchGate`
uses the existing `wholeBoxOccluded` proof: one actual opaque ceiling rectangle must
cover every corner of the complete world AABB. Rectangles use exactly Garage’s
ceiling filter (`id !== core`, no `core`, no `outside`); stair cores and exterior
recesses remain open. No union of disconnected slabs, fake blocker, distance change
or partial-model clipping. The plant AABB includes the shader’s existing±0.06m
maximum horizontal sway. The old terrace behind/far gate remains an explicit input.

The render pass moves only these complete meshes between layers0/7. Their original
visible flags, geometry, instance buffers, matrices, castShadow and raycast references
remain untouched; physical traces already include layer7. Per-camera LOD updates
restore exposed batches; all-layer/sliced warm-up retains its own masks. No new
meshes/materials/textures/lights or budget changes.

The saved pre-crash desktop62a75c17 baseline at1280×800 quality0 (no lowmem/test)
reported344calls/1042197triangles at the hall, exceeding the triangle limit.
The opted-in batches contain31204terrace-decor and21760pergola-bulb triangles;
fresh same-World submission comparisons below independently recover their exact savings.

Shared structure mapping, not four independently rendered house inspections: L’s
`bikeNW`/basement bands have ceilings while `core` remains open; A’s passages/
`coreAWest`/`coreAEast` retain ceilings while `coreA` and `parkARecess` are excluded;
B’s passages/`coreBPark`/side door strips retain ceilings while `coreB` and
`parkBRecess` are excluded; C’s utility cells/passages retain ceilings while `coreC`
is excluded. All other actual ceiling rectangles use the identical builder filter.
No house shell, entrance geometry, ramp, bridge, navigation or collision is changed.

`node --test tools/ceilingbatchtest.mjs` covers5cases: actual included/excluded roof
rectangles, complete-box edges/straddling/hole cases, exact render-only identities
and physical rays, original terrace policy, per-camera restoration, wind bounds and
warm-up masks. Its orthographic shadow-like camera is a direct mathematical gate
probe, not evidence that Three’s shadow traversal calls LOD.update. Pinned Three0.170
WebGLRenderer projects the main-camera scene/LODs before WebGLShadowMap.render;
the shadow traversal tests the main camera’s layer mask and has no independent LOD
update. Thus outside/portal main-camera restoration also restores the caster layers
before the real shadow pass. Existing shadow flags/materials stay unchanged.

Fresh recovery on579336bd: desktop all19views/quality checks PASS with
489calls/991365triangles/~309MiB (hall340/989409); landscape phone ALLPASS,
369/827712/~98MiB (native exit0); portrait phone ALLPASS,290/716060/~101MiB.
A fresh same-World actual/forced probe confirms exactly4draws/52964triangles saved
in the hall;5matched hall/ramp/courtyard/terrace/core-hole image pairs have0changed
pixels. Exposed ramp/courtyard/terrace batches restore, and the core opening restores
the bulbs while retaining the older terrace policy. The actual focused garage button
opens the door after its normal9seconds (t differs from1 only by floating-point rounding).
The corrected targeted door runner passes with native exit0 and no page errors; its
actual/forced fully open garage-ramp images also have0changed pixels.
The extra upward terrace view remains over budget in both states; independent#1421
tracks it. Independent read-only paddock surface finding#1420 is outside this change.

Historical raw artifacts in `/tmp/desktop1387-codex20/` were lost in the restart;
the earlier baseline summary is from the saved handoff. Fresh recovery logs/images
are retained outside the repo at
`~/.local/state/lunden-orkester/codex-surface-20261020/perf1387/`. The first recovery
launch had an exited devserver. Desktop and portrait complete passing budget results
were saved before browser-teardown failures (portrait CLI1); the first door fixture
also used strict floating-point equality. These harness failures remain separate from
actual application assertions and are not described as green CLI runs.

Only the neutral courtyard lamp gate is applicable downstream: public issue
solwation/kvarteret-lunden#108 tracks the selective transfer. Private roof-terrace
decoration is excluded. Original #1387 stays open until that transfer is verified.


Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [graphics](graphics.md), [verification](verification.md).

## Bare seasonal foliage batches (#1404)

`seasons.applySeason` omits registered tree-crown/vine batches only when the existing
`SEASON.trees[month].leaves` is zero (December, January, February). Their exact historical
nonzero epsilon matrices, colour buffers, geometry, materials, cached bounds, layers and raycast
remain unchanged; positive cover restores the same objects in March/summer. Trunks, evergreen
boxwood and its intentional winter snow cap are not registered leaf crowns and remain drawn.
No distance/occlusion threshold, model dimension, quality control or global budget changes.
`Detail` skips these instanced outdoor batches; their other culling parents retain authority.

The actual full-world844×390quality0January10start submitted371calls/735194triangles.
A source-level submission profile found ten named tree-crown cells, `south-crowns` and
courtyard.js's193-instance seasonal vine still submitted at epsilon scale with zero leaf cover.
The eleven named crown draws cost63028triangles, the vine another7720. The intentional
front-boxwood snow surface is a genuine seasonal addition and is preserved. A warm seasonal
switch to July gave370calls in the same process; the separate cold July baseline369 is not
an identical initialization and must not be conflated with that comparison.

`node --test tools/seasoncrowntest.mjs` executes the actual frozen pre-fix seasonal module
from4a96a152 with its own registry and compares every matrix/colour element over all months,
checks buffer/material/layer/raycast identity, first positive month/summer restoration,
parent visibility and actual sibling-trunk ray intersections. Relevant real-world checks are
winter/summer/March submissions, matched start images and real nearby entrance focus/use,
then complete winter phone budgets in both formats. Desktop#1387 remains separate.
Targeted before/after start measurement:371→359screen draws and735194→664446triangles
(the twelve already-bare batches total70748triangles). March and summer restore all eleven
named crown batches plus the vine; the warm summer measurement remains370/732662.
Matched winter118404-pixel captures differ at111pixels by at most2/255 per channel; summer
at257pixels, max2/255. All pictures are opened for visual review. The actual trunk ray returns
identical2.9328345123m distances with the same buffer/raycast; real nearby touch-focus/use opens
the entrance and all its near meshes retain their layers. This is a rendering change, not a
physical tree, complete-model or architecture change.
Complete winter phone budgets pass in both formats with unchanged370/950000/225limits:
844×390peaks361calls at kitchen,764469triangles at living/~95MiB;390×844peaks284calls
at start,703101triangles at big hall/~98MiB. Every view and adaptive-quality assertion passes;
no JavaScript exceptions. These are Chromium phone profiles, not physical iPhone stability/FPS.
The generic helper is relevant to public scenery and needs a separately tracked reviewed transfer.

## Empty mess batches (#1392)

`Mess` keeps each decal batch invisible while its instance count is zero. Its existing
`redraw()` restores visibility when spots are added or loaded, and removes the draw when
the last spot is cleaned or cleared. Geometry, materials, instance buffers, the nonblocking
raycast and the life group's parent visibility retain their existing behaviour.

The proposed shared distant-car batch was rejected after profiling the actual full-world
start view: only one `car-far` submission was present, so merging car groups could save
no calls there. Three empty crumb/dust/smear batches were submitted instead. No car LOD,
furnishing cutoff, physical trace, architectural opening or global budget changes.
`tools/messvisibilitytest.html` verifies actual WebGL draws through the complete empty,
populated, partially cleaned, cleared, saved/loaded and hidden-parent lifecycle.
Native WebGL10/10 and existing dust-placement16/16 pass. A real-app touch profile
also passes8/8: running vacuum and cloth remove the final spots, focus/use opens the
near entrance and all its meshes remain drawn, without JavaScript exceptions.

Full phone quality0 `perfcount` now passes every view and quality check in both formats:
844×390 peak372→369calls, unchanged827536triangles/~97MiB;390×844 peak293→290calls,
unchanged747434triangles/~99MiB. The370/950000/225limits are unchanged. This fixes the
remaining #1383/#1361 budget failure; physical iPhone stability is still a separate #1359 question.
After rebasing the independent clubhouse screens (#1365), the final landscape confirmation
still passes369calls/827536triangles; its two new screen textures make the global estimate~98MiB.
Desktop quality0 remains over its existing triangle limit (#1387):489calls,
1042197triangles/~308MiB, with the other quality checks passing. No desktop budget is raised.
The public main tree has no Mess/life simulator, so this household-only change has no
applicable neutral downstream transfer.

## Static phone canvas sources and disabled mirror target (#1359)

Follow-up 2026-10-20: `buildCheatNote` opts its immutable wall-text canvas into the same
existing policy. It is painted once after its bundled font loads, is never cloned or
redrawn, and keeps the same geometry, normalized UVs, material and ordinary read target.
The hidden source is 512×341 instead of 1536×1024 (6→0.666 MiB); first upload releases
it to 1×1. Desktop keeps the original source. This is a small retained-memory reduction,
not an established explanation or resolution of the reported physical iPhone crash.
There is no applicable public transfer: the source is gameplay text, excluded downstream.
See the dated follow-up in the [validation record](../validation/issue-1359/README.md).

`freeCanvasAfterUpload` now reduces opted-in immutable canvas sources to the existing
`LOW_MEMORY.maxTextureSize` before first upload, retaining the original canvas identity and
normalized UVs. The first-upload callback still frees them to 1×1. The static door atlas in
`buildFlatDoors` follows this policy for A/B/C/L; dynamic lift labels remain redrawable.
Never use this helper for editable or repeatedly uploaded textures. Context restoration
still requires the existing guarded reload. A phone mirror disabled by adaptive quality
keeps a 1×1 warm-up target rather than its unused 512² multisampled half-float allocation;
enabled levels still resize to their configured dimensions. Desktop behaviour is unchanged.

Matched Chromium phone-profile runs measured GPU peak220.4→205.4MiB, initial CPU canvas
198.5→105.2MiB, and post-warm-up canvas118.9→87.8MiB. This is a bounded memory reduction,
not proof of an iPhone crash fix: the aggregate estimate remains above the guessed budget,
and landscape draw calls independently exceed the existing budget (#1361).
See [commands, results and limits](../validation/issue-1359/README.md).

## Conservative phone occlusion (#1361, partial delivery)

`detail.js` calls the pure `occlusion.js` helper for boxes beyond the existing 3.2 m near distance on
low-memory devices. One actual convex opaque rectangle must block all eight world AABB corners;
combining corner hits on different walls would incorrectly erase objects through a doorway.
Overlapping objects, exposed corners and exterior door hardware remain visible under this new rule.
`buildLevel.opaqueRects` includes its existing walls, window sill/head infill and real door lintels;
glass and moving leaves never become occluders. Slab strips use `OURS.opening`, the same expanded
opening passed to the structural geometry, rather than the smaller stair layout rectangle.
No geometry, light, texture, distance cutoff or physical trace layer is added or changed.

Matched real `tools/perfcount.html?lowmem&w=844&h=390&quality=0` at frozen `ed781d21`
versus this partial change: start422→415, kitchen414→372, living458→394, upstairs434→368,
garage401→400, park485→445 screen draws. Maximum triangles917135→910699; textures~97MiB.
The existing370/950000/225MiB budget is unchanged: landscape still reports **SOME FAILED/CLI1**.
Portrait390×844 remains green: maximum328→321draws; the final maximum is785887triangles/~99MiB.
The settled six-view phone comparison has0changed visible near-item decisions and no browser exceptions;
actual touch-focus selects the nearby entrance leaf and E opens it, with all its near meshes still drawn.
The remaining budget reduction is #1383; this delivery does not close #1361 or establish physical iPhone stability.

A private per-mesh distance LOD experiment reached368 calls but was rejected after inspecting images:
plant pots vanished before their foliage. That distance policy and its furnishing tags are absent from the
published implementation. Preserve complete objects when developing the next reduction.

`node --test tools/occlusiontest.mjs` checks coverage, silhouettes, doorway gaps, self-overlap,
intersection ordering, floor strips, stair aperture and window infill. Existing `tools/detailtest.html`
checks the entrance/open/closed doors and remains green. Full-world phone before/after captures also
compare settled visible near-object decisions to frozen old `judge`; the matrices and parent visibility
must be current before making that comparison. Private artifacts are under
`~/.local/state/lunden-orkester/codex-single-20261019/phone1361-*`.

Public applicability: the reviewed public `src/main.js` has no DetailCuller and the personal furnishings
are excluded. Its architectural `world.js` does not consume these new visibility metadata. No public
runtime change or transfer is applicable to this partial implementation.

## Whole furnishing visibility and real solid support (#1383)

On phones viewed from outside the flat, explicitly opted-in furniture is judged as a whole model.
The builder excludes detachable contents and independently movable frames. Bounds and mesh membership
refresh before judgement, preserving replaced geometry, moved parts and physical layer7 traces.
Lamp-bearing models keep an infinite distance cutoff; only real opaque geometry can hide them.
Inside the flat the previous per-part policy remains. `phoneUnitK`0.07 and envelope padding0.2m
are visual LOD assumptions; minimum distance includes the complete model radius.
Other architectural outlines use the existing6m distance plus their radius, preserving nearby edges.

Actual ground-floor and patio plates now join the occlusion metadata. The two visitable plans
export their own fixed opaque rectangles and actual stair-hole slab strips, translated by their real model offsets; their glass
and moving leaves stay excluded. Retaining-wall rectangles
are inscribed directly in emitted wall faces, then joined only where coplanar strips with identical
vertical spans touch. Doorway lintels retain their real lower bounds; gaps are never filled.
A real World probe checked120points against the actual wall mesh, maximum deviation2.44µm.
No wall, window, door, floor, collision or light geometry changes. The idle Combat streak pool no
longer draws degenerate lines; its actual idle/active/expired lifecycle is checked in Chromium.
Basketball's fully transparent free-throw target has a non-rendered material and remains raycastable.

Native whole-model/occlusion tests14/14, existing door checks and actual patio action checks pass.
Matched original and candidate living/kitchen/upstairs/park images were opened. The private candidate
near diagnostics include inactive unit records (`far:null`), so their raw record differences are not
newly hidden near-mesh counts. Real entrance use opens the door and keeps every near leaf drawn.
The first frozen baseline image command ended143 after writing complete images/JSON; it is not a
passing CLI. Raw early budget failures and all final profile results are retained under the session's
private `phone1383-*` artifacts. Physical iPhone stability remains a separate unanswered#1359 question.

Public applicability: public main has no DetailCuller, the furnishing flags are personal, and the
Combat/basketball changes are gameplay. Added architectural metadata has no public consumer; no
runtime transfer applies. Public terrain tasks#98/#99 remain separate.

## Performance (#48)

- `&perf` shows fps, pixel ratio, draw calls, triangles, geometries, textures; `tools/perfcount.html`
  prints draw calls per spot (since #695 the draws to the screen, counted per draw: see the #695 section — older numbers in
  this file, the start view's above all, came from `renderer.info` and can be too low). Baseline → after the first pass: start view 793 → 362 calls, kitchen
  162 → 109, living room 184 → 87, upstairs 148 → 88 (screenshots pixel-identical).
- Bicycles (#683): the shared frame/tyre/metal batches add two instanced calls at the bike yard; one
  merged alpha-spoke batch serves the courtyard rack and one serves all basement bikes. `perfcount`
  now includes the bike yard, courtyard rack and west CYKEL room: desktop 333 / 316 / 142 calls;
  phone (`?lowmem&w=390&h=844`) 322 / 220 / 119. Both profiles pass the overall budgets (desktop
  peak 471 calls / 994,961 triangles; phone peak 322 calls / 903,094 triangles).
- `src/merge.js` `mergeStatic`: world.js bakes every static, opaque, single-material mesh into one
  per material and cell (Entréplan / Övre plan / outside); doors (leaf + handles merged per door,
  `tagged`), lids, appliances, the key cabinet, furniture, exterior and surroundings are kept out.
  furniture.js merges each piece on its own (not the parasol; `userData.keep` for the beers). Anything
  new that moves, toggles visibility or is a pick target must be in a kept object or have
  `userData.door` — otherwise it gets baked in.
- Detail culling (#189, `src/detail.js`, `PERF.detail`): the exterior and new furniture had grown the start view to ~1200
  calls (the whole flat is in the frustum from the street). Small meshes that would look tinier than `k` are moved to a
  layer the camera does not draw (never nearer than `minDist`, so never within reach), and from outside the flat a mesh
  inside it is only drawn when the line to it passes a façade opening (the front door's leaf is solid while it is shut; open,
  the whole doorway counts, #210 — `tools/detailtest.html`). Start view
  1210 → ~410 calls, the other spots a little lower; screenshots differ by a few dozen pixels. Anything new that
  raycasts at small things far away must allow for layer 7. Marks physical traces include the shared
  `DETAIL_HIDDEN_LAYER` (#805), preserving hits on culled details; rendering and nearby focus-ray layers remain unchanged. Anything new that moves by itself (while the visitor may
  stand still) and exists when the culler is built needs `userData.moving` on its root (#267). A root whose `userData.detailUnit` is true is judged
  as one thing by its whole bounding sphere (#598, the car: its wheels went at ~40 m while the body drove on floating; out of
  its garage stall the whole car now stays drawn, up to ~20 more calls while it is in view far off). While the flag is false
  (the car in its stall) its meshes are judged one by one as before.
- Warm-up (#432, now `src/warmup.js`, extended by #592 — see below): the first time the flat's inside was drawn (the front door opened
  after a fresh start) three compiled the shadow-depth programs and uploaded the geometry / textures in one frame — a
  freeze of seconds. Three frames in (after lampwash's patch) `renderer.compileAsync` compiles every material's program,
  then one frame is drawn with every layer and no frustum culling (shadows too), behind the start screen. SwiftShader
  320 × 200: the door's first frame 5680 → 28 ms. Skipped in headless Chrome (`HeadlessChrome` UA) unless `&warm`;
  `&perf` logs its times. Materials made later (cups, cat coats) still compile when first drawn.
  Hidden objects the warm-up should still draw once (the gulls, #1265) carry `userData.warmDraw`: `WarmUp.withWarmVisible` shows them for the draw-everything renders only (their size is 0 while faded out), so the first-use link check and geometry upload are not left for the first visible frame.
- Shadows: `shadowMap.autoUpdate = false`; redrawn when the sun moved > 0.2°, for 1.5 s after any E
  action (doors swing), and at least every `QUALITY.shadowInterval` s of the quality level (`updateShadows` in main.js).
- Mirror images (#50): one Reflector per mirror, at most ONE active per frame (nearest in view
  within 4 m, visitor's level), all drawing into one shared target (#592) whose size is the quality level's (512² / 256² / off). The Badrum mirror's
  LED strip is its own lamp (`mirrorLamps` in interior.js → `world.lamps`, switched like the floor lamp).
- Dynamic resolution: replaced by the adaptive quality level (#592, below); off with `&shot`.


## Hus A entrance outside the detail gate (#887)

The courtyard façade cuts a permanent entrance opening. Hiding all of CoreHouse A beyond its original 14 m front rectangle left
that opening empty from L1007's patio. Only the actual ground-floor lobby/entrance geometry now remains beside the culled detail group:
one merged opaque batch, fixed glass, the same animated leaf, and their outlines. No extra triangles, invented blocking plane or wider
lift/stair detail radius. Static batches keep native frustum culling and their existing shadow flags; no extra reflection pass.
Native source geometry at x1.8/z14 retains 8 meshes/572 triangles, versus the complete near core's 10,946 triangles. Near splitting
adds one opaque mesh (80 versus 79 total meshes), preserving the same summed triangles. These are mesh/triangle counts, not measured FPS.
The bounded actual World comparison at 900×560 DPR1 (quality0/3, no test mode) adds 10 completed-view draw calls at the patio
(118→128) and 562 rendered triangles; near adds two calls (174→176 /176→178) with unchanged rendered triangles.
These frozen-camera counts do not establish live FPS or phone performance.

## Local shot cold collision preparation (#715, 2026-10-13)

Local Nerf darts call `Marks.hit` while flying. Previously `Marks.segment` created a `TriGrid` synchronously for every
static surface with at least 200 triangles before asking whether its bounds intersected the short dart segment.
That transformed every triangle and populated world-cell Maps even for scenery far outside the shot. The remote
combat spatial fixes did not cover this local path. It is a concrete source of first-shot CPU work, including during PvP.

`src/marks.js` now checks a private conservative position-derived world box before creating that grid. It ignores
and preserves authored `geometry.boundingBox`, includes float32 rounding used by TriGrid's world vertices, and is
invalidated alongside the grid when furniture moves. Moving/instanced/skinned surfaces retain the existing path;
render-detail layers and physical hit decisions retain their existing policies. Overlapping cold grids still build
synchronously; this change removes distant preparation, not every possible shot hitch.

`tools/marksbroadphasetest.cjs` supplies unmodified `524ebc9:src/marks.js` to the companion module-only browser fixture.
Two actual local Darts/Marks shots, 60 identical steps and eight distant 16,128-triangle spheres: cold first update
**47.3 → 1.7 ms**, total update work **48.6 → 2.9 ms** in Chromium. Every active-dart count and final position, velocity,
travelled distance, visibility/flight/spent flag and splash count match. Separate instrumented proof: 2,145 position
reads versus 11,904 for a distant indexed sphere. All ten checks passed; actual physical-marks regression also passed.
This controlled CPU result is not apartment FPS or a physical-phone measurement. It supports publishing a candidate
against the user's recurring shooting lag without treating another user test as a prerequisite for implementation.


Focus regression (#558): #531 created then disposed a temporary brightness material on every target exit, releasing its last GPU program. A real WebGL createProgram counter reproduced 30 new programs for 30 target/clear switches (and 30 for greeted figures). InteractionOutline now caches variants in a WeakMap by source material/instance index, restoring originals on clear and releasing cached GPU resources on source disposal. Different figure indices use an integer uniform in one shared shader. focusperftest checks zero new programs after warm-up, shared-source reuse, first visits to other figure indices and disposal. interactionoutlinetest checks actual pixel restoration, current lamp hooks, geometry animation and index changes. This removes measured shader churn; desktop SwiftShader is not a claim of measured phone FPS.

Southern backdrop (#536): `SITE.south`/`southbackdrop.js` add 54 existing mapped footprints, a real courtyard hole, simple landmark windows and hip/gable roof silhouettes, sourced roads/open fields and 70 low-detail seasonal woodland trees. Four merged surfaces plus two instanced meshes, no new textures/lights/interiors or OUTDOOR expansion. Clear-weather fog ends at 650 m; camera far 1000 m, outer ground edges hidden. Rain retains its 80 m fog target. Untagged dimensions/height/roof details remain assumptions; proposed Hunnerup 30 buildings excluded. `southbackdroptest` checks sources, real courtyard aperture and seasonal buffers. [Sources, budgets and before/after](../validation/issue-536/README.md).

Phone memory (#585): iOS Safari killed the tab after a few steps ("Ett problem inträffade flera gånger"; the first kill
reloads silently via the resume record). Each Reflector's render target is 512² 4× multisampled half-float (~15 MB on the
GPU) and was allocated the first time that mirror reflected and never freed, so memory grew with every mirror walked
past; `updateReflections` now disposes the previous mirror's target when another (or none) becomes active, so at most
one exists. On phones/tablets (`lowMemory` in `src/lowmemory.js`: mobile UA, iPadOS's touch "Macintosh", or `&lowmem`)
`LOW_MEMORY` in config caps `renderer.capabilities.maxTextureSize` to 1024 (three resizes on upload; the source
canvases are untouched, so redraws still work), the shadow map to 1024² and the pixel ratio to 1.0 (dynamic resolution
used to step up to 1.5× there). Measured with an iPhone UA and a WebGL allocation counter in headless Chromium:
textures 245 → 170 MB, shadow renderbuffers 16.8 → 4.2 MB, mirrors bounded at one target instead of +~15 MB each. Still
large and not reduced: ~105 MB of vertex buffers (plus their CPU copies) and ~200 MB of canvas sources on the CPU.

Campus facades on phones (#589): #576–#581 took the east backdrop (`east-backdrop`, eight merged batches) from ~21 k to
75 351 triangles, all drawn (and shadow-cast) wherever the campus is in the frustum. On `lowMemory` devices
`buildCampusFacade` / `buildSchoolFacade` take `lite` (`CAMPUS_LOD` in config): no dentils, quoin joints or fine
glazing bars (the centre post and one rail stay), each stepped cornice merged into one profile (`oneProfile`), sills
and window crowns as flat planes, arches with 3 segments and roofs on a 2× coarser grid. Bodies, eaves, ridges, colours,
brick/render, every window and the clock tower are the same; same batches, same draw calls. Phone (`?lowmem&w=390&h=844`):
east backdrop 75 351 → 33 676 triangles (budget `maxTris` 36 000, *guess*), perfcount −41.7 k triangles at every spot,
calls unchanged; desktop unchanged. `eastbackdroptest.html?lowmem` runs the phone build. Distance-based LOD on desktop was
not done (it would need a second geometry per batch). [Numbers and screenshots](../validation/issue-589/README.md).

Campus triangle budgets re-measured (#1468): the east campus had outgrown its ceilings (desktop 78 000, phone 36 000 `maxTris`) through the ground/terrain and building work since #589. Measured in headless Chromium 1208 (swiftshader) with `tools/eastbackdroptest.html` at c6a1653b: desktop 83 026, phone (`?lowmem`) 41 367 triangles. The ceilings are now the measured count plus ~2 % (rounded up): `CAMPUS_TRIS` 84 700 (in the test) and `CAMPUS_LOD.maxTris` 42 200. Only the test ceilings moved: no geometry, ground precision, facade detail or draw call changed, so perfcount and the phone profiles are unaffected. A further campus growth must raise the numbers deliberately here, not silently.

Southern backdrop detail ceiling re-measured (#1474): `tools/southbackdroptest.html` "bounded far detail" counts the `south-backdrop` group's land, facades, glass and vegetation (instances included). Its old coverage formula (23 000 + a field/paving layer per added 4 m x `southRow` cell, 40 252 since #1381) had been outgrown by later terrain, gable and landmark work; measured in headless Chromium 1208 (swiftshader) at bf8b197f the count is 49 910 triangles, identical on two runs (the 41 474 / ~46 231 quoted in earlier reports were taken on older revisions). The test ceiling is now the measured count plus ~2 %, rounded up: 51 000 (a plain constant in the test). The test is desktop-only (no `?lowmem` branch), so there is no phone figure. No geometry, ground precision, facade detail, draw call or global PERF budget changed; a further growth must raise the number deliberately here.

Christmas tree (#571): in season +8 draw calls and ~20 k triangles where it is in view (desktop and phone frame), no extra light (one pool anchor in the shared pool / wash), a 0.016 ms CPU shimmer per frame (instance + point colours) and a ~27 ms one-off overlap re-judgement on load / moves; out of season nothing is drawn and perfcount is unchanged. `tools/perfcount.html` now takes `?month=…&day=…` (game URL overrides) and `?w=…&h=…` (frame size). [Numbers](../validation/issue-571/README.md).

Roof terraces (#605): `src/terracedecor.js` adds 3 draw calls (one merged solid, soft and bulb mesh for all eight furnished terraces) and ~31 k triangles where Hus L's courtyard side is in view, nothing from the street side (the gate puts them on layer 7 north of the set-back wall below the roof, and beyond `TERRACE_DECOR.far`). perfcount: park 433 → 436 calls, big hall 836 725 → ~868 k triangles, still within PERF.budget; no lights, no textures, materials exist for the warm-up. `tools/terracedecortest.html` keeps a 50 k triangle budget.

Visitable flats' lamps (#620): one more lamp wash (`uLampDataV`, up to 24 lamps) in the lit materials' shaders, left at once outside the two flats' boxes (a box test first), no pool light or shadow light; +1 merged fitting mesh per flat and two small meshes per switch, ~+9 draw calls of ~300 in L1004's kitchen view (measured with the lamps hidden / shown), nothing from the street side beyond the flats' windows. interactionoutlinetest allows one set of each (`uLampData` + `uLampDataV`).

## Turn-around hitches (#592)

The visitor reported freezes when turning around, indoors and out, on a phone and a work PC.

**Measuring (step A).** `src/hitchlog.js` (`HitchLog`, `__app.hitch`) counts the WebGL context's calls
(`createProgram` = a shader compile, `createTexture` = a texture's first GPU upload, `tex(Sub)Image*` uploads and their
pixels, `bufferData`, `createFramebuffer`, `renderbufferStorage*`) and times every frame by phase (`adapt`, `step`,
`update`, `render`, and inside `render` the shadow-map pass `shadowMap` and the mirror pass `mirror`). With `&perf` a
frame of at least `PERF.hitch.ms` (50 ms, *guess*) is logged to the console (`hitch {…}`) with those deltas, whether
and why the shadow map was redrawn (`shadowWhy`: `hold` after an action, `age` = the twice-a-second refresh, `sun`),
which mirror reflected, the camera's yaw and position. The game loop's body is `frame(raw)` (`__app.frame`).
`tools/turntest.html` waits for the warm-up (`&warm`, `__app.warm.state`), stops the loop, runs 60 settling frames, then
at nine spots (living room, kitchen, hall, upstairs, patio, the street in front, courtyard, Karpvägen, the roof) turns
360° in 15° steps twice, one `__app.frame(1/60)` per step, and fails on any new program or new texture while turning.
Lap 1 minus lap 2 = what was drawn for the first time.

SwiftShader caveat: WebGL runs in the GPU process, so a frame's GPU work is paid by whichever later frame first waits
on the GPU (three does when it first uses a program). The warm-up's draw-everything frame shows up 15–27 s later in a
settling frame with no counts at all; `?sync` (one `readPixels` per frame) attributes work correctly but costs seconds
per frame. Frame times below are therefore relative; the counts are what the gate trusts. Not GPU timings.

**Before (headless Chromium, SwiftShader, 640×400 desktop and `?lowmem&w=390&h=844`, noon in July; night `&time=22&lights`
and winter `&month=12&day=20&weather=snow` showed the same):**

| spot | lap 1 | lap 2 |
|---|---|---|
| living room (SKOGSGRÄNSEN / LINDBYN) | 57 new programs (48 phone), 2 new textures, 4 framebuffers, 6 renderbuffers; one frame 12–51 s, then 150–1600 ms frames | 0 programs, still 2 textures / 4 framebuffers |
| upstairs (four mirrors in reach) | 0 programs (4 on the phone), 3 new textures, 6 framebuffers, 9 renderbuffers | the same textures again |
| kitchen, hall, patio, street, courtyard, Karpvägen, roof | 0 programs, 0 new textures | 0 |

Causes, in order of size:
1. **The mirror pass compiles a second set of programs.** A Reflector draws the room into a half-float render target,
   where three uses no tone mapping and linear output: a different program for every material it sees. The warm-up
   compiled and drew only the screen's variants, so the first mirror in view compiled 43–46 programs in one frame
   (12–51 s under SwiftShader; on a GPU the synchronous compile + link of ~50 programs is a freeze of a second or
   more) and a few more each time new things turned into its view.
2. **Every change of active mirror allocates a new render target.** Since #585 the previous mirror's 512² 4×
   multisampled target is disposed when another becomes active, so turning between two mirrors creates a texture,
   two framebuffers and three renderbuffers (~15 MB) every time, on every lap.
3. Not seen while turning: new programs from lamps or pool lights (the light count is constant, night = day),
   textures of things coming into view (the warm-up's draw-everything frame had uploaded them), garbage collection.
   Still to watch: the shadow map is redrawn twice a second (`age`, 5–95 ms of the frame under SwiftShader, the
   largest regular spike at the indoor spots); the warm-up drew the shadow pass with the shadow camera's own layers,
   so what the DetailCuller had on layer 7 was first drawn into the shadow map later; and the dynamic resolution's
   pixel-ratio steps reallocate the canvas.

**Fixes (step B).** `src/warmup.js` (`WarmUp`, `__app.warm`, `WARM` in config) replaces main.js's warm-up and runs in
stages from the game loop: compile every material → draw everything once (every layer, now also the sun's shadow
camera's, no frustum culling) → compile every material again with the mirror target bound → draw everything once into
the mirror target → in idle slots (`requestIdleCallback`, ≤ `WARM.sliceMs` each, 500 ms timeout) `renderer.initTexture`
every texture of every material, hidden objects included (`__app.warm.state` ends at `done`). `src/reflections.js`: all
mirrors draw into ONE shared render target (`mirrorTarget()`, `SharedReflector` = three's Reflector with its target
swapped), allocated once by the warm-up and never disposed — at most one existed since #585 anyway, so the GPU memory
bound is the same. Programs after the warm-up 107 → 196 (the mirror variants); the mirror warm-up draw costs as much as
the first one (5.8 / 6.3 s under SwiftShader, behind the start screen). Pool lights were already a constant set (#234),
so no light work was needed.

After (same runs as above): **0 new programs and 0 new textures while turning at all nine spots, desktop and phone**;
no render targets or renderbuffers allocated while turning (living room lap 1 still makes 8 `bufferData` calls the first
time the mirror draws, then none). Longest turning frame (SwiftShader, loaded machine, unsynced) 12 204 → 662 ms on
the desktop frame and 9 886 → 484 ms on the phone frame; median frame at the mirrors 204 → 101 ms.
Not covered: materials made after the start (cups, cat coats, new life items) still compile when first drawn.

**Lamp-wash patch after the warm-up (#668).** `turntest ?lowmem&spots=living,kitchen` failed with 10–20 new programs in the
first kitchen lap (and `living` now and then). Not SwiftShader timing: listing `renderer.info.programs` that appeared per frame
(turntest now prints each new program's cacheKey tail and the objects using it) showed the same materials under a new key,
`…|lampwash` → `…|lampwash|lampwashV`. `LampWashes.patch()` runs every 120 frames for both washes (ours, `Lights`; the visitable
flats', `VisitLights`) and gives materials made since the last patch the lamp shader, which sets `needsUpdate` and so recompiles
them. The first periodic patch fell ~120 frames after the start, i.e. in the first frames after the warm-up (3 frames in), and
hit whatever was drawn then (mess meshes, drop-off, instanced things); in turntest that is the kitchen's first lap. Fix:
`WarmUp` takes `prepare()` and calls it right before the first compile; main.js passes both washes' `patch(scene)`. After it:
0 new programs at living and kitchen in 3 of 3 runs (2 `?lowmem` + 1 desktop; the other spots pass too, before: kitchen 20 / 20 / 10 new in three runs, living 11 in one).
Materials created later (cups, cat coats) are still patched by the 120-frame loop and compile when first drawn.

**Adaptive quality level (step C).** `src/quality.js` (`Quality`, `__app.quality`, `QUALITY` in config) replaces #460's
three pixel-ratio tiers (`dynRes`). One level 0 (lowest) … 3 (highest), steered by the real frame time (the original
#592 thresholds — 3 hitches in 0.5 s, 1.5 s under 30 fps, 5 s over 52 fps — are replaced by the #1510 regulator below). It only adapts
while playing (not on the start screen or paused), after the warm-up, and not with `&shot` (highest) or `&quality=n`
(pinned; both not remembered). The level reached is remembered per device (`localStorage` `lunden.quality`); phones
(`lowMemory`) start at 2, everything else at 3. perfcount checks the drop on a low frame rate, the drop within 3.5 s on
repeated hitches, no step up right after a step down, the recovery, and that the knobs are registered.

**Graphics choice (#1509).** The settings dialog (`#settings-dialog`, `src/qualitysetting.js`) offers Auto or a named manual
level (Lägsta / Låg / Medel / Hög = levels 0–3, `QUALITY.names`) and a 30 / 60 FPS target. Saved separately in `localStorage`:
`lunden.quality` stays the LAST AUTO level (an old install therefore migrates as Auto at its old level, no reset),
`lunden.quality.mode` (`auto`/`manual`), `lunden.quality.manual`, `lunden.quality.fps`. Auto never writes the manual keys and a manual
level never moves (`Quality.update` returns at once). The target only sets Auto's frame budget (1000 / target ms, #1510 below);
it is a load budget, not a promise and no render cap exists. `&quality=n`, `&test` and `&shot` lock the level (`remember: false`): they read and write no saved choice and
the dialog disables its buttons with a note. Checks: `node tools/qualitychoicetest.mjs` (state), `tools/qualitysettingtest.cjs` (browser).

**Regulator (#1510).** `Quality.update(dt, cpuMs)` judges 1 s windows against the target's budget (`QUALITY.auto`, all
*guess*): a window is over when its MEDIAN interval exceeds 1.3 × budget or ≥ 20 % of its frames are hitches (≥ 3 × budget);
two over windows in a row step down. A single frame ≥ 6 × budget, or one past `ignoreOver`, is a stall: counted in
`quality.stalls`/`diagnostics()` (also in the `&perf` interval export's metadata `auto`), never a level change by itself.
Up only after 5 headroom windows (median ≤ 1.1 × budget, no hitches) and 20 s after a step down; because 60 FPS at a vsync cap
proves no GPU headroom, every step up is a trial judged over the next 3 windows and reverted when it loses the budget,
then that step is backed off 60 s, doubling to 600 s. The 0.6 s after any step (pixel-ratio / shadow-map reallocation) or
pause are discarded, so the reallocation frame never feeds back into a decision. `quality.pause(why)` holds it explicitly
(main.js: hidden, menu, pinned, warmup, covered). Classification uses the previous frame's main-thread work and is always
uncertain (no GPU timer is read, `diagnostics().gpuTime` is false; on the UHD 630 route GL calls block on GPU back-pressure,
so lowering the resolution also lowered main-thread time): median CPU ≥ 0.8 × median interval = `cpu?` → first a step of
`level` alone with the `kind: 'gpu'` resolution knob held at `pixelLevel`; otherwise `gpu?` → a held resolution steps first,
else both. Response measurement decides: a down step whose next 2 windows improve the median by < 8 % (and stay over
budget) is reverted as `ineffective`, that kind is backed off (60 s, doubling per ineffective step in a row) and the next
overload tries the other kind. A median ≥ 8 % WORSE after a cheaper step means the scene changed under the measurement
(moving route, loading): `step-unclear`, the cheaper step is kept, no backoff. No gameplay, physics, save or simulation rate is touched. Checks: `node
tools/qualityautotest.mjs` (decision logic only), perfcount's adaptive lines; the matched UHD 630 route is in
[the #1510 validation record](../validation/issue-1510/README.md).

The registry: a feature that costs frame time calls `quality.register(name, { apply(level, quality), state(level), cost })`
(main.js, after the thing exists). `apply` runs at once and on every change and sets the feature's cost for that level,
reading its per-level value from a `QUALITY` table; `state` is the line in the `&perf` overlay (`quality.describe()`),
`cost` a note of what it saves. Current knobs (level 0 → 3):

| knob | 0 | 1 | 2 | 3 | notes |
|---|---|---|---|---|---|
| `resolution` | 0.6× | 0.75× | 0.9× | 1× | of the capped device ratio (1.5, phones 1.0), never below 0.5; a step reallocates the drawing buffer once |
| `shadows` | 1024², every 1 s | 1024², 0.75 s | 2048², 0.5 s | 2048², 0.4 s | phones capped at 1024² (#585); a size change reallocates the map once |
| `mirrors` | off | 256², every 3rd frame (#1207) | 256², every 2nd frame | 512², every frame | the shared target is resized once on a change; never drawn in a frame that redraws the shadow map |
| `detail` | ×0.6 | ×0.75 | ×0.9 | ×1 | DetailCuller's cut distances (#460's `setQuality`) |
| `weather` | ×0.35 | ×0.6 | ×0.85 | ×1 | share of rain streaks / snowflakes / hail drawn |

Real weather (#674) costs nothing per frame beyond a few typed-array reads (`RealWeather.at`) and a 4×/s simulated temperature; one month (24 × days hours × 4 arrays, ~15 KB) is held, at most three months in memory, the fetch happens once after the first frames.

Not knobs (yet): the campus facades' LOD (#589) is chosen once at build time (a runtime switch needs a second geometry
per batch), and the Christmas tree's shimmer costs 0.016 ms (#571) — not worth one.

**Keeping future graphics safe (step D).**
- *Budgets:* `PERF.budget` in config — per view at the highest level: ≤ 520 draw calls and ≤ 1 000 000 triangles at
  every perfcount spot, ≤ 320 MB estimated texture memory (every material's textures, w × h × 4 + mips, capped at the
  device's texture size); phones (`?lowmem`): ≤ 370 calls, ≤ 950 000 triangles, ≤ 225 MB. Set ~20 % above the scene on
  2026-10-09 (desktop: 433 calls at park, 836 725 triangles in the big hall, ~266 MB in 240 textures; phone 390×844:
  305 calls / 784 426 triangles in the basement, ~188 MB) — *guess*. (The start view was under-counted then: it drew ~770
  calls on the phone, not ~190 — #695; every other spot was counted right and fits.) `tools/perfcount.html` (and `?lowmem&w=390&h=844`)
  fails past them; raise one only on purpose, with the reason in the commit.
- *A new heavy feature* (a new pass, a particle system, a big animated canvas, many lights or casters): add its per-level
  values to `QUALITY` and `quality.register(...)` it in main.js (see the table above); make sure its materials exist when
  the warm-up runs (or call `renderer.compileAsync(object, camera, scene)` when it is created) and that it does not
  allocate render targets or textures on first view (share / allocate up front, like `mirrorTarget()`); run turntest
  (0 new programs / textures) and perfcount (budgets).
- *Spreading heavy work:* the mirror keeps last frame's image (`hold`) in any frame that redraws the shadow map, and at
  level 2 draws every other frame (`QUALITY.mirrorEvery`); the warm-up's texture uploads run in idle slots of at most
  `WARM.sliceMs`. The DetailCuller's re-judging was measured at < 1 ms median (2682 items, 2–3.5 ms worst) and the
  whole `step` at ~1.4 ms, so the CPU side needed no spreading.


Visited flat L1004 (#574): its own group, merged per material and level like ours (`buildVisitFlat`, ~83 top-level children,
~156 draw items with door/window/lid anchors and their architecture edges). `VisitUnit.cull` (STANDARD.detail 12 m): from
inside our flat or down in the garage nothing of it is drawn; farther than 12 m from its footprint only its shell (walls,
floors, ceilings, window frames: 8 calls); near it everything. perfcount (desktop) before → after: start 198 → 198, garage
drive 340 → 348, park 433 → 441, every other spot unchanged; budget PASS. Measured at L1004 itself: street in front 216 →
391 calls, its hall 185 → 333, its living room 138 → 284, its upstairs hall 154 → 209 (within the 520 budget). The build
adds ~45 geometries and ~8 textures (3-stav parquet, tiles) and one extra architecture-edges pass at start. No lights: it has
no lamps (daylight only); the sun's one shadow map moves onto it when the visitor is within STANDARD.near m.

L1201 (#573) and the far shell: from afar a visited flat now also shows a stand-in for its windows (glass and shut sashes
merged into one mesh per material, `VisitUnit.standIn`) and its exterior doors, so its openings are not open holes. Measured
with both flats (desktop, calls with → without the visited flats): garage drive 363 → 343, park 455 → 435, L1004's street
387 → 202; at L1201: the loftgång in front of it 263 → 117, its hall 249 → 116, its living room 248 → 109, its Allrum 136 →
107. perfcount (desktop and `?lowmem`) within PERF.budget.

Opening kitchen fronts in the visited flats (#621): every front an Openable of its own costs two calls (its mesh and its
architecture edges; measured +42 at L1004's kitchen, its hall view 493 → 541, over PERF.budget). `standardinterior.js`
`batchFronts` draws all of a flat's fronts as one vertex-coloured mesh + one LineSegments: each vertex carries its front's
index (`fi`) and the vertex shader moves it by that front's pivot (a mat4 uniform array, MAX_FRONTS 40; its shadow through a
patched `customDepthMaterial`), E aims at an undrawn box per front and the focused one is brightened in the shader (`aimAt`).
Measured (desktop, worst of 12 yaws): L1004 kitchen 473 → 475, hall 493 → 495; L1201 kitchen 369 → 371. One new program.


## Phone memory probe and texture cap (#628, refs #585 — not verified on a device)

iPhone 14 Pro froze, reloaded and showed "Ett problem inträffade flera gånger" again. `tools/phonememtest.cjs` (Playwright
Chromium on SwiftShader; run instructions in [verification](verification.md)) simulates the phone — **844×390 landscape (the
game asks for landscape), DPR 3, iPhone UA, touch** — wraps the WebGL calls to total texture / renderbuffer / buffer bytes over
time, reads JS heap and long tasks, throttles the CPU (`--cpu 4,6`), walks the flat (start, hall, living room, kitchen,
upstairs, every mirror, patio, stairwell storeys, garage) and compares the total with an iOS budget that is a *guess*
(`--budget-mb`, default 600: iOS kills the WebContent process somewhere between a few hundred MB and ~1 GB on a 6 GB iPhone; the
real figure is unknown). All GPU numbers are estimates from the page's own allocations, not readings from a GPU.

**Does #585's work apply in a phone profile?** Yes: with the iPhone UA `lowMemory`, `isPhoneDevice` (the `phone` class, from
`(pointer: coarse) and (hover: none)`), `maxTextureSize` 1024, shadow map 1024², pixel ratio 0.9 (quality level 2 × the 1.0 cap)
and the lite campus facades are all on. Note that the iPhone UA also makes the start warm-up *run* (it skips only
`HeadlessChrome`), like on a real phone: `--nowarm` appends `HeadlessChrome` to compare.

**Before (main at d654ad5, estimates, MB):**

| point | textures | renderbuffers | buffers | canvas | GPU total |
|---|---|---|---|---|---|
| after load (before warm-up) | 36 | 4 | 89 | 9 | 138 |
| after the warm-up (262 textures, 205 programs) | 207 | 7 | 104 | 9 | **327** (peak) |
| after the route (every spot, 9 mirrors, stairwell) | 207 | 7 | 104 | 9 | 327 (no growth) |

Besides the GPU: 186 MB of CPU canvases (the sources of canvas textures), 134 MB of CPU copies of the geometry
(3 320 geometries, kept by three), ~335 MB JS heap → GPU + heap + canvases ≈ 854 MB vs the 600 MB guess.
What grows: only the **start warm-up** (textures 36 → 207 MB in one burst behind the start screen, programs 50 → 205). It matches "loads, starts playing, then freezes". Walking everything *without* the warm-up (`--nowarm`) ends
at 182 MB of textures, so the warm-up only moves the cost forward by ~25 MB. Mirrors are **not** the problem any more: one
shared 256² 4× half-float target (~3 MB) at level 2, no growth over nine mirrors, no new render targets while walking; the
shadow map is 1024² (4 MB). Largest items: textures 207 MB (145 MB in ~27 textures of 513–1024 px with mips), vertex buffers
103 MB (merged world, 49 MB in one group), canvas sources 186 MB (curtain prints 24, escape plan 11, rugs 27, garage floor
10, cat board 9), geometry copies 134 MB.

**Change:** `LOW_MEMORY.maxTextureSize` 1024 → 512 (config). On a screen under 850 px wide a base level above 512 is
rarely sampled (*guess*; compared by screenshots only: living room, mirror and kitchen views look the same, mirrors 1/3/7 draw
their reflection). Desktop untouched. After: textures 207 → **105 MB**, GPU peak 327 → **226 MB**, total estimate 854 → 753 MB
(still over the 600 MB guess); perfcount `?lowmem&w=390&h=844` texture estimate ~98 MB, budget passes.

**Not done (measured, but not safe to change blind):** the 134 MB of CPU geometry copies (raycasts read them), the 186 MB of
canvas sources (many canvases are redrawn, freeing needs a per-module opt-in), vertex-buffer quantisation, and warm-up changes.
Frame times in SwiftShader (seconds per frame) say nothing about the phone. **Physical iPhone verification is still required.**

**Step 2 (#628, phone only, not verified on a device):** (1) `freeCanvasAfterUpload(tex)` (`src/lowmemory.js`, `lowMemory` only) shrinks a
canvas texture's source canvas to 1×1 in three's `onUpdate`, i.e. right after the upload. Opt-in, only for canvases drawn once and
never cloned or redrawn: curtain prints, the garage escape plan / floor / sign plates, the rugs (archRug, rugTexture, zigzag,
pile), K-pop poster atlas, AO overlays and street-sign atlas. NOT applied to anything that calls `needsUpdate` again (cat board,
drawing sheets, calendar, cheat note, cups, signs that change) or may be cloned. A later re-upload (e.g. after a lost WebGL
context) would show these blank, so on a phone `reloadOnContextRestore(canvas, reload)` (`src/lowmemory.js`, wired in `src/main.js`) reloads the
page on `webglcontextrestored` after a loss, through the ordinary resume (place + world, as "Ladda om"), at most once per 60 s
(sessionStorage `lunden.glReloadAt`; then it only logs). Crashlog still reports loss/restore. Tested by `tools/glrestoretest.cjs`. (2) `WarmUp` option `lazyHidden` (phone): stage 4 (upload of every texture of hidden objects)
is skipped; they upload when first shown. Measured with `phonememtest --cpu 1 --dwell 600` (estimates, MB):
A restore inside that 60 s guard is not reloaded automatically; the scene is then broken (freed normals/uv re-upload empty,
so meshes stop drawing while the position-only architecture edges remain: walls look like see-through wireframes, #1128), so
`reloadOnContextRestore`'s `onSkip` shows `#gl-lost` ("Grafiken tappades efter en krasch." + **Ladda om**, a user tap, so no loop).

| | before (a3541b8-ish) | after |
|---|---|---|
| textures after warm-up | 105 | 87 (94 at the end of the route; 195 → 211 textures) |
| GPU peak | 235 | 224 |
| CPU canvases after warm-up | 187 | 106 |
| JS heap peak | ~343 | ~338 |
| sum of the three peaks | 766 | 732 (guess budget 600) |

Screenshots of start, living room, kitchen and the nine mirrors before/after are the same (the one pixel-diff outlier was a
different camera yaw). perfcount `?lowmem&w=390&h=844` passes (textures ~74 MB). The canvases still held (~106 MB): cat board 9,
cheat note 6, cups, 2828×1000 and 2160×1076 canvases of other makers, many small ones. Still not done: geometry CPU copies (135 MB:
raycast, marks.js, basket bounces, DetailCuller and `edgeSources` read them), chunking the one-frame warm-up draw, vertex buffers.

**Step 4 (#628, phone only, not verified on a device): geometry copies and normals.** `src/lowmemory.js`: `freeGeometryAfterUpload(geo)`
hooks three's `onUploadCallback` so that `normal`, `uv`, `uv1`, `color` and `plantWind` are replaced by empty typed arrays of the
same kind once the GL buffer exists (`position` and `index` stay: raycasts, TriGrid, DetailCuller, architecture edges, marks and
basket bounces read them). A raycast's interpolated uv/normal then reads NaN instead of throwing; `marks`/`basket` use the face
normal from `position`. `mergeStatic` hooks its outputs, and `freeSceneGeometryCopies(scene, renderer)` (main.js, right after the
`WarmUp` is built, before the first draw) hooks every other mesh geometry. `packNormals` also turns Float32 normals into
normalized Int8 ×4 (12 → 4 bytes on the GPU; axis-aligned normals exact, smooth ones within 0.4 %) while nothing is uploaded yet.
Opt-outs: skinned meshes, morph targets, geometries with any dynamic attribute or a `bedCare` attribute, and
`geometry.userData.keepCpu` (set by watering, fruit and the drawing sheet, which rewrite their arrays or read `hit.uv`). A
console canary warns (`freed vertex attribute …`) if a freed attribute is cloned or marked `needsUpdate`; none fired in the
runs below. A new maker that rewrites or clones a mesh's vertex arrays after the first draw must set `geometry.userData.keepCpu`.
`&keepgeo` (with `&lowmem`/phone) turns all of it off for an A/B run. Not touched: desktop.


**Courtyard bicycle re-upload (#1047).** The two merged bike batches in
`src/courtyard.js` now declare their rewritten position/normal attributes as
`DynamicDrawUsage` before the low-memory pass. `Player.mountBicycle → bikePose →
Courtyard bicycle.place` changes both arrays; the previously static declaration
allowed normals to be packed into Int8×4 and their CPU arrays freed after upload.
The next normal update then threw the actual Three.js buffer-size exception. Only
these two existing batches opt out through the established dynamic-geometry rule;
`src/lowmemory.js` remains byte-identical to reported build `f581417`.

`tools/courtyardlowmemorytest.cjs` renders actual Courtyard/Player components at
480×320, with a native touch button invoking the real mount controller from
x−14.38/z16.2, next to the last existing bicycle. The independently loaded
`f581417:src/courtyard.js` reproduces the exact WebGLAttributes resize error after
its first upload. Its `&keepgeo` control, fixed `&lowmem`, and fixed desktop cases
complete without the error. All five bicycles retain finite unit normals across
repeated yaw/pitch updates; authored position/normal/UV/color SHA256 values match
before and after. The tiny scene stays at 3 calls/8,700 triangles, including its
static control cube; that cube still frees its normals on the fixed low-memory path.
The two moving batches retain 1,146,816 rather than 312,768 CPU bytes (+834,048,
about 0.80 MiB), and measured first-upload GL buffers add 208,512 bytes (about
0.20 MiB), with no added geometry or material batches. This is a bounded component
cost, not apartment FPS or physical Android acceptance. Artifacts:
`/tmp/lunden-reports-1047/result.json` and `fixed-lowmem.png`.

The public Android reports have no object identifier, so their exact initiating
object cannot be established from the truncated reports alone. The reproduced
native path matches the reported location, input and exception. The equivalent
streetlife yard bicycles move instance matrices; the garage bicycle paths move
position ranges and separate objects, rather than re-uploading the freed shared
normal attribute. No layout/dimension change or additional house variant is involved.


The existing non-WebGL `courtyardbicycletest.cjs` run passed its first 11 checks
(selection, mount, motion, unchanged unowned buffers, bounds, normals, culling and
pause), then stopped on the pre-existing missing `keepWorld` fixture helper while
saving a mounted session. That incomplete run is tracked separately as #1048; it
is not counted as a successful regression suite for #1047.
For physical-phone follow-up: reload, walk to the courtyard bicycles, press
“Cykla”, ride and turn, then dismount. Check that rendering and controls continue
through the first mount and subsequent movement. That phone check remains unperformed.

Measured with `phonememtest --cpu 1 --dwell 600` (the full route, SwiftShader estimates, MB), `&keepgeo` vs default:

| | before | after |
|---|---|---|
| CPU copies of geometry | 138 | 66 (position 48, colour 5.5, normal 4.7, uv 4.1, index 1.9 left) |
| vertex buffers (GPU) | 113 | 88 |
| GPU peak | 229 | 204 |
| JS heap after the warm-up (steady) | 369 | 301 |
| JS heap at load, before the warm-up | 375 | 394 (the packed copies; freed at the first draw) |
| steady heap + GPU + CPU canvases (after warm-up) | ~690 | ~600 |

The old "sum of the three peaks" (769 vs 785) hides this: the heap peak is the moment before the warm-up, the GPU peak after it,
so they do not coincide; the heap peak itself did not fall. Parity checks (before/after identical): 112 aim samples at seven
spots (focus kind/name) and 56 `marks.hit` hits (points and normals); sitting on the sofa, armchair and stool and standing up;
nine mirrors, start, hall, living room, kitchen, patio, stairwell and garage screenshots differ only by rain streaks.

Not done: positions (48 MB CPU, 48 GPU; needed by raycast, could move to TriGrid's own world-space copy), vertex colours
(Float32 → byte would band dark tones), uv, merged non-indexed geometry (indexing would cut vertices but costs frame time),
the transient +19 MB at load (pack in place), the ~106 MB of CPU canvases and the heap's remaining ~300 MB.

## Phone graphics a little finer (#662 — not verified on a device)

The iPhone crash (#585/#628) can no longer be reproduced, so `LOW_MEMORY` was raised carefully, one knob at a time, measured
with `tools/phonememtest.cjs --route living,mirrors,stairwell` (iPhone 14 Pro profile, 844×390 @3, SwiftShader; GPU
numbers are the page's own allocations; budget 600 MB is still a *guess*). Peak GPU estimate, MB (JS heap/canvas copies
vary ±30 MB between runs, so the GPU column is the comparable one):

| step | textures | renderbuffers | canvas | GPU peak | GPU + heap + CPU canvases |
|---|---|---|---|---|---|
| baseline (512 / 1024² / 1.0) | 97 | 7 | 9 | **203** | 768 |
| `maxPixelRatio` 1.0 → 1.25 | 95 | 7 | 14 | 206 (+3) | 778 |
| + `maxTextureSize` 512 → 768 (tried) | 137 | 7 | 14 | 248 (+42) | 820 |
| `maxPixelRatio` 1.25 + `shadowMapSize` 1024 → 1536 (**taken**, 512 textures kept) | 100 | 12 | 14 | **216 (+13)** | 721 |

Taken: `maxPixelRatio` 1.25 (start level 2 now draws at 0.9 → 1.125×, the top level at 1.25×; the drawing buffer is 14 MB instead
of 9) and `shadowMapSize` 1536 (the map is 9 MB instead of 4; levels 0–1 still use 1024 through `QUALITY.shadowSize`, levels 2–3
wanted 2048 and are capped at 1536). Not taken: `maxTextureSize` 768 costs +42 MB for a base level a 844 px wide screen
rarely samples; `startLowMemory` stays 2 (the adaptive levels, `quality.js`, still step down on a slow frame rate and back up,
and the lost-context reload is unchanged). Everything is still above the 600 MB *guess* in total (as before #662: the
CPU canvases and geometry copies dominate), GPU peak is 216 MB, +13 MB (+6 %) over the baseline. Desktop is untouched
(`lowMemory` only). perfcount `?lowmem&w=390&h=844`, `glrestoretest.cjs` and `turntest.html?lowmem` pass. To go back: `LOW_MEMORY`
`maxPixelRatio: 1.0`, `shadowMapSize: 1024` in `src/config.js`. Screenshots: `/tmp/shots-grafik` (not in the repo; the living
room looks slightly crisper, nothing else changes).

Ghosts (#666, `src/ghosts.js`), avatars (#705, `src/avatar.js`): each other player costs two draw calls (one SkinnedMesh with vertex colours, one
name tag sprite; an armed player one more for the prop, `src/ghostprops.js` (#1126): the weapon's own model baked to one vertex-coloured
geometry shared by every ghost — rifle ≈ 0.3 k, lite blaster ≈ 0.4 k, saber 0.6 k + its blade (one more call), wand 0.1 k, bow 0.5 k triangles), no shadow pass, no extra pass for the outline (a fresnel term in the same Lambert material's shader, one program for
all), at most `GHOSTS.max` (30); hidden beyond `GHOSTS.far` (900 m, the whole walk/fly area; #1296 — it was 60 m, so far players vanished), the tag (fog-free) grows linearly beyond `GHOSTS.tagFar` so a far player stays a constant-size marker (no pop-out; `node tools/ghostfartest.cjs GAME WORKER`), posed only within `AVATAR.poseFar` m (a
13-bone IK pose + matrix update, ~0.05 ms). **Triangles per avatar: 4 056 – 4 856** (the 8 hairstyle × sleeve variants; `avatarTriangles(v)`; #1102's hair shells added short +0.2 k, bun/beanie +0.4 k, long +0.8 k
to #1103's 3 874 – 4 082 (body/hands/clothes ≈ +0.3 k on the earlier 3 554 – 3 766);
the earlier merged dummy was 1 652), before and after: one draw call each, no texture (#1104's skin shading is a few ALU per skin fragment plus a
shared 4-byte-per-vertex `bare` attribute; Iris 640 at 1400 × 700: 8 avatars filling the screen 5.25 → 5.5 ms/frame, 24 at a few metres 11 ms both, within noise; so nothing on the low-memory mode's texture
budget; a variant's base geometry ≈ 0.4 MB, built lazily, an avatar owns a 45 KB colour attribute, a 13-bone skeleton with an 8 × 8 float bone
texture and a material). One name tag texture (256 × 64) per distinct name, shared, disposed with its last ghost. Nothing exists without
other players. Our own mirror image (#691): +1 draw call and ≈ 3.7 k triangles inside the mirror pass only (while a mirror reflects and
the frame is not a held one), posed lazily from the pass; the main camera never draws it. perfcount is unchanged (no players there).

## iPhone loses the WebGL context after one very long frame (#669 — not verified on a device)

Crash reports (`/crash/public`, 2026-10-10/11, three iPhone 14 Pro cases, all `low: 1`): fps ~53 → 5–15, **one frame of 4.4–4.7 s**
(`lagMs`), `webglcontextlost` → `restored`, the warm-up `phase` still `compiling` at up 112 s, draw calls 150–220 → 878–906,
`prog` 298 → 299, plus two `Script error.` (kind `error`, up 7 s, `phase: compiling`).

**What was measured** (headless Chromium, iPhone 14 Pro profile 844×390 @3, `?lowmem&perf&warm`, SwiftShader — frame times are
not iPhone times; counts are):

| finding | evidence |
|---|---|
| **The draw-call jump is the shadow pass, not a new view.** | `info.render.calls` is per `render()` and includes the sun's shadow pass: 209 in the first frame, **845** in the frame that redraws the shadow map (the `hitch` log: `shadow:true`, `shadowMap` 11 s under SwiftShader). A shadow redraw every 1 s (levels 0–1; 0.5 s at level 2) lands in any heartbeat sample, so 150–220 → ~900 is normal, not a spike. perfcount phone views stay at 44–305 calls. |
| **A material disposed while the warm-up compiles leaves it in `compiling` for ever.** | three's `compileAsync` polls `properties.get(material).currentProgram.isReady()` in a bare `setTimeout`; a disposed material has no program → `TypeError … reading 'isReady'` (a "Script error." on the device: three comes from another origin), the promise never settles. Reproduced: dispose 5 scene materials while the state is `compiling` → still `compiling` after 150 s (`warm.done` false: no adaptive quality, mirror variants and the draw-everything frame never done). Matches the reports (`phase: compiling` at up 112 s, `Script error.` at up 7 s = when the compile starts). The device's parallel shader compile (KHR_parallel_shader_compile) makes that window long enough to hit. |
| **The heavy stages were each ONE frame.** | Stage 3 (mirror variants) compiles 109 programs in one frame (SwiftShader 1 s sync on a desktop CPU; `lagMs` 4.4–4.7 s on the phone fits ~110 programs × ~40 ms of main-thread shader translation — a *guess*), the draw-everything frames upload ~1250 geometries / ~100 textures at once (8 s and 15 s under SwiftShader). With the warm-up stuck in `compiling`, all of that happens at first sight *while playing*. |
| Not reproduced: the context loss itself (SwiftShader has no iOS watchdog). | The long frame is the best explanation, not proven. |

**Fixes (phones: `sliced`, `lowMemory`; the robustness part is for everyone):**
- `src/warmup.js` `whenReady()` replaces `compileAsync`: every program read is guarded, it gives up after `WARM.timeout`
  (8 s) and never leaves the state machine. After the same dispose test the warm-up runs on to `done` (desktop and phone).
- `sliced` compile (`WARM.programs` 4 new programs or `WARM.compileMs` 20 ms per frame, `renderer.compile` per `WARM.batch` 8
  objects through a stand-in scene; the next slice when the last one's programs are ready, at most `WARM.ready` 1.5 s):
  the most new programs in one frame while warming is 5–15 (draw slices: shadow depth programs), not 109.
- `sliced` draw: `WARM.drawObjects` 120 objects or `WARM.drawVertices` 200 000 vertices per frame (33 slices per pass; the rest
  sit on layer 31 for that one render, the cameras skip it; layers, not `visible`, so children of hidden meshes still draw;
  a single huge merged mesh still gets one slice of its own).
- Diagnostics (`src/crashlog.js`, `frameDiag` in `main.js`): every heartbeat sample has `warm` (`compiling 12/113`, `drawing
  3/33 mirror`, only until done) and `worst` = [CPU ms, new programs, shadow redraw, warm state] of the slowest frame ≥ 50 ms
  since the last beat — the next report shows directly whether a long frame was a compile, a first draw or a shadow redraw.
- #662's values (pixel ratio 1.25, shadow map 1536) are **unchanged**: nothing measured implicates them (the same loss happened
  at px 0.6 before #662).

SwiftShader run, complete warm-up in the phone profile, sliced: `done` after 554 s (every frame is seconds under SwiftShader;
on a phone a slice is a normal frame plus a few ms), 262 programs (old: 242), 66 draw slices, `hidden textures left for later`.

**Interplay with #668 (`prepare()`):** the lamp washes' periodic patch (every 120 frames) recompiles every material made since
the build under a new key; a sliced warm-up lasts hundreds of frames, so `startCompile` and `startDraw` call `prepare()` before
each stage (not only before the first compile). Programs after a full sliced run 262 vs 242 unsliced, the difference probably being
such late recompiles (the "298 → 299 late program" in the reports is the same kind). Materials made after `done` still compile
(and get patched) on first sight.

The first-frame burst above is addressed by #697 below. Still open: materials made after startup (cups, cat coats, new
life items) compile on first sight; `worst`/`warm` in the next iPhone report will show whether those cause a long frame.
Context-loss prevention still needs verification on a real iPhone; #669 remains open.

## Triangle budget over by the basement's bike racks (#704)

`tools/perfcount.html` failed on desktop (big hall 1 020 495 > 1 000 000) after #683's realistic bikes. Cause, found by hooking `onBeforeRender` on every drawn mesh at the view and diffing against c5a1a9e: the garage bakes every rack's bikes (2 104 triangles each: frame 620, tyres 816, metal 664) and stalls (384 each) into the *area shell* mesh. That mesh is one per area, so its whole bounding sphere is always in the frustum and every bike in the area is drawn from anywhere in the basement: the L-house shell 22.6 k → 77.3 k, the next 14.9 k → 55.3 k, three smaller shells +25 k (about +105 k together), the rest of the increase being doors and the courtyard rack. Not the courtyard's Hus A–C or the other models listed in the issue.

Fix: `bikeGeometry(lod)` / `standGeometry(lod)` in `src/streetlife.js` take a level. Level 1 (near) has 6-sided tubes, a 6×20 tyre torus and 4×20 rim torus (2 104 → 1 552 triangles per bike, no visible change at the distances the old set was judged at); level 0 (far) has 4-sided open tubes, a boxy saddle, a 4×16 tyre and 3×16 rim (756 per bike; stall 240 → 96). `Garage` builds each rack row (per area) as two meshes in the area's own shell material, so the tube light level still applies, and `Garage.update` shows the near one within `GARAGE.bikeLodNear` (10 m, *guess*, plus the row's bounding radius) of the camera and the far one beyond. The row meshes are also frustum-culled on their own. Spokes stay one alpha batch (4 triangles a wheel pair). Cost: +9 draw calls at the big hall (352 → 361 desktop, 281 → 284 phone), well inside the call budgets.

| view (triangles) | desktop before | desktop after | phone before | phone after |
|---|---|---|---|---|
| big hall | 1 020 495 | 922 959 | 873 618 | 757 874 |
| basement | 973 417 | 879 189 | 921 702 | 820 262 |
| bike room | 800 375 | 743 755 | 730 216 | 671 572 |
| bike yard | 750 755 | 739 715 | 703 146 | 692 106 |
| upstairs | 736 479 | 725 439 | 637 118 | 626 078 |
| park | 909 031 | 897 991 | 591 864 | 588 384 |

Desktop peak is now 922 959 at the big hall (budget 1 000 000), phone peak 820 262 at the basement (budget 950 000). The courtyard rack and the bike yard's instanced bikes only got the lighter near geometry (no distance swap); they are the next lever if the budget is hit again. To find what a view's triangles are made of, hook `onBeforeRender` on every mesh, render once and sum `index.count / 3` (× `count` when instanced) per mesh, with the material colour and bounding box to recognise merged batches.

## Triangle budget over by whole-site instanced batches (#1246)

`tools/perfcount.html` failed on desktop (garage 1 030 833, park 1 026 713, big hall 1 023 703 > 1 000 000; textures 315-317 MB of 320, run dependent) from 622b0268 on. Found as in #704 (hook `onBeforeRender`, sum `index.count / 3` x `count`): the growth was not the river park's own geometry (two path meshes, one bridge, one shore mesh: a few k triangles) but two kinds of site-wide InstancedMesh, each drawn *whole* from every spot because one bounding sphere covers the site: the trees (1 486 crown lobes x 60 = 89 k, 1 232 trunks x 46 = 57 k; #1233's denser park woodland added ~130 trees and ~190 shrubs to these) and the parked cars (23 garage + 19 street cars, ~5.1 k each, ~215 k, drawn although most stand underground or behind the viewer).

Fix, bounded and reversible:
- `surroundings.js` `trees()` splits the trunk, birch and crown batches into one InstancedMesh per `FOLIAGE.cell` (130 m, *guess*) square, each with its bounding sphere computed from the full-leaf matrices (seasons.js only rewrites instances), so frustum culling drops the cells behind the viewer. Same geometry, material and instances: no visible change. `registerTrees` is called per cell. To go back: one cell larger than the site.
- `viewlod.js` (#1213, phones only until now) also runs on desktop from `VIEW_LOD.carNearDesktop` (60 m, *guess*; phones keep `carNear` 30 m): parked cars further away use the ~100 triangle body, near ones stay full (+2 calls, `?nocarlod` turns it off).

| desktop view | before (tri / calls) | after (tri / calls) |
|---|---|---|
| garage | 1 030 833 / 375 | 853 857 / 395 |
| park | 1 026 713 / 492 | 861 365 / 505 |
| big hall | 1 023 703 / 344 | 960 465 / 364 |
| start | 814 742 / 478 | 774 422 / 494 |

Desktop peak 960 465 at the big hall, most calls 505 at the park (≤ 520). Phone (`?lowmem&w=390&h=844`): peak 801 744 → 726 892 triangles, calls 348 → 356 (≤ 370). Textures stay ~315 MB in 323 (≤ 320): the big ones are the picture frames, stair pictures and the garage/hall photos (14 MB each at most), none added by #1233/#1235 and none safely shrinkable without visible loss; this is the next budget risk. Next levers if hit again: big hall's 516 k triangles are the garage area shells (unnamed meshes, one per area), and the street/garage car batches could be split by cell like the trees.

## Triangle budget over by the terrain mesh (#1311)

`tools/perfcount.html` failed on desktop at the big hall (1 005 848 > 1 000 000) after #1305: the terrain grid follows the Copernicus ground and got northern 5 m rows over the whole -340..0 range, taking the single `site-terrain` mesh from ~85 k to 111 518 triangles, all drawn from every spot (one bounding sphere; the big hall looks east from underground and still pays for the whole site). Found as in #704 (hook `renderBufferDirect`, sum `index.count / 3`, list the biggest meshes with their bounding boxes).

Fix: `terrainGeometry()` in surroundings.js thins the grid where the ground is smooth DEM and nothing is built (`TERRAIN_FAR` in config.js, *guess*): columns west of x -150 and east of x 235 are 12 m instead of 4 m (the river corridor reaches x ~232, so it keeps its detail), rows further than 60 m north of `terrainNorth` are 10 m instead of 5 m. The mesh is 81 838 triangles (-29.7 k). Roads, backdrop buildings, tree feet and the asphalt cut (#1309) sample `renderedTerrainY` / `renderedTerrainY.grid()`, so they follow the thinner grid. Daylight shots before/after from a rooftop north, west and east look identical; `terraintest` passes.

| desktop view | before (tri) | after (tri) |
|---|---|---|
| big hall | 1 005 848 | 976 599 |
| basement | 963 616 | 934 367 |
| garage | 902 156 | 872 915 |
| park | 936 196 (509 calls) | 906 955 (510 calls) |
| start | 848 181 | 818 940 |

Desktop peak 976 599 at the big hall (≤ 1 000 000), calls 510 at the park (≤ 520), textures ~308 MB (≤ 320). Phone (`?lowmem&w=390&h=844`): peak 742 136 at the big hall (≤ 950 000), calls 363 at start (≤ 370), PASS. Next levers if hit again: `ground-ao` (25 k, one site-wide mesh), `east-modern` (49 k, one mesh for the whole east), the terrain split into culled tiles (costs draw calls at the park, 510 of 520).

## Phone warm-up before the first complete view (#697)

`WarmUp.blocksView` gates ordinary scene and mirror renders on low-memory devices until sliced warm-up reaches `done`.
Compilation starts on the first controlled frame rather than after three ordinary frames. All upload/mirror slices stay
behind the loading screen or the existing resume cover; only the first complete ordinary render releases it. Desktop
warm-up timing and headless skips keep their previous behaviour. Pixel-ratio, shadow and quality configuration are unchanged.

Measured with `tools/firstframetest.cjs`, Chromium/SwiftShader, iPhone UA, 844 × 390 @3, `?lowmem&perf&warm&shot` at the start
view, noon in July. Screenshot mode pins quality 3 (the existing phone limits still apply); the harness pauses the initial
animation loop and drives real `frame(1/60)` calls. Baseline: 339e769; after: 77cb75e plus #697 (also includes #688’s grass
shader/atlas, so this is not a same-geometry frame-time comparison).

| Count | Baseline frame 0 | After frame 0 | After first complete view |
|---|---:|---:|---:|
| New shader programs | 74 | 0 | 0 |
| Buffer uploads (`bufferData`) | 2,692 | 0 | 0 |
| New textures | 111 | 0 | 0 |
| Image upload calls (`texImage`/`texSubImage`, etc.) | 116 | 0 | 0 |

Warm-up finished in 226 controlled frames (35 normal and 35 mirror upload slices). The largest preparatory frame created
7 programs, uploaded 449 buffers and made 17 image upload calls. The first canvas upload slice created 2 programs and
uploaded 341 buffers / 8 images; the initial offscreen environment-map pass during compilation created 1 program.
The regression gate allows at most `WARM.programs + WARM.batch` (12) new programs per preparatory frame, allowing the
compiler to finish its object batch, and exactly zero in the first complete view. All 249 cached programs linked; no
shader or page errors, and five start-view turns needed zero new programs. Public `hideLoading`, `showOverlay(false)`
and screenshot mode kept the loading/resume cover until a real view existed. Desktop/skipped state gates were checked.

These are GL call counts, not iPhone frame times or proof that the iOS watchdog will keep the context. A physical iPhone
check is still required for #669. The loader can remain visible longer while preparation completes; hidden seasonal
textures still upload lazily later, as before.

## Phone draw calls at the start view (#695)

`tools/perfcount.html?lowmem&w=390&h=844` reported 766 draw calls at `start` (budget 370) on one machine and 188 on another.
**Cause: the measurement, not a recent model.** perfcount read `renderer.info.render.calls` after `render()`, but a nested
render inside the frame (three's PMREM regenerating the sky's environment, a mirror's Reflector) resets `info` half-way, so
the count held only the draws after it. Whether a run printed ~190 or ~770 depended on whether such a render fell in that
frame. Counted per draw, the phone start view was 769 / 772 / 772 at b155cf4 (2026-10-09, when `PERF.budget` was set),
6765803 and 73f185e, and 783 on 74bb6c4 — no commit of the last day broke it (the courtyard's grill, benches and playground
merge into their batches; bikes, bins, Olof, the ghosts add a few calls each where they are in view). The phone budget of 370
was set from the under-counted numbers, but every other spot fits it (peak 332), so it stays; the desktop's 520 too.

**perfcount** now counts every `renderBufferDirect` that draws to the screen (no render target, outside the shadow pass) and
sums `info`'s triangles around each one (with `info.autoReset` off for that render); shadow / mirror / environment draws are
printed apart (`+36 shadow/mirror/env` at start: the PMREM). Every spot reads ~4 more than before (draws before the nested
render that used to be dropped).

**Where the start view's 783 phone draws went** (each mesh by its group and position; a temporary hook on
`renderBufferDirect`): ~490 meshes inside the flat that the DetailCuller's sphere test let through the windows (its margin
grows with the radius: a sofa or a fridge "passes" a window it is metres from); 72 outline line sets of doors, lids and
appliances (architecture edges, never culled: the culler took meshes only); 37 our car in its garage stall (under the patio,
underground); 33 the patio's furniture behind the flat; ~40 the fridge and the freezer (every shell, liner, shelf and bin a
mesh of its own, the inside drawn behind the shut door); the rest the façades, backdrops, entrance plants and the street.

**Changes:**
- `src/detail.js`: from outside, a thing is also hidden when (a) its box, projected from the eye onto the façade plane,
  misses every opening; (b) every line from the eye through those openings runs into a full-height wall of its storey
  (`world.openings.walls`: the plan's wall polygons as rectangles, `wallStrip` in world.js; doorways are gaps, half walls are
  left out); (c) it is on Övre plan and every such line climbs through the floor between the storeys away from the stair's
  hole (`openings.slab`). Things beyond the flat (the patio, the garage under it) are judged the same way: a line that meets
  our façade within its width and below its roof goes through the flat, or below its floor through the foundation and the
  ground (*guess*: nothing under our façade opens; not used with the eye below ground). All three are conservative (box ⊇
  mesh, walls only where the plan has them); the sphere test stays. The outline lines (`userData.architectureEdges`) are
  judged like meshes.
- Phones only: `PERF.detail.lowMemoryOutside` 0.7 (*guess*) — small things inside the flat (r < `maxR`) seen from outside go at
  0.7 × their usual distance (the kitchen's jars and cups from the street, ~15 m).
- `src/fridge.js`: shell, liner, glass shelves and door bins merged per material; the inside (liner, lamp, shelves, drawers
  with their stored food) is drawn only while the door is open, like the beer shelf. At the start view the fridge and freezer drew 40 calls, now 15.

**Measured** (perfcount, headless Chromium + SwiftShader, July noon; before = 5ac634a with the new counter, after = this change):

| spot | phone before | phone after | desktop before | desktop after |
|---|---|---|---|---|
| start | 782 | 359 | 849 | 445 |
| kitchen | 187 | 187 | 347 | 347 |
| living | 237 | 237 | 349 | 349 |
| upstairs | 223 | 223 | 325 | 325 |
| patio | 92 | 92 | 112 | 112 |
| courtyard | 163 | 163 | 173 | 173 |
| courtyard bikes | 228 | 223 | 326 | 256 |
| karpvagen | 74 | 74 | 85 | 85 |
| garage | 118 | 118 | 386 | 316 |
| bike yard | 331 | 256 | 342 | 267 |
| park | 177 | 174 | 482 | 414 |
| east | 49 | 49 | 61 | 61 |
| big hall | 287 | 249 | 364 | 295 |
| basement | 322 | 249 | 362 | 289 |
| bike room | 125 | 125 | 149 | 149 |

Phone: PASS (peak 359 calls at start ≤ 370; 822 566 triangles in the basement). Desktop: PASS (peak 445 calls at start ≤ 520;
925 263 triangles in the big hall). Start-view triangles: phone 892 934 → 659 728, desktop 962 303 → 732 493.

**Checked by pixels (desktop 1280 × 800, `&weather=clear`):** at 11 views (the start, the street near / far / oblique / east, the
patio three ways, the doorstep, Karpvägen, the courtyard) everything hidden only by the new tests (58–834 things per view) was
drawn and hidden again in the same frame: 0–16 pixels of 1 024 000 differ (single pixels along window frames). With the front
door open, at the doorstep 0 pixels at 900 × 600 (a few at 640 × 400). Not covered: a mirror inside the flat seen from outside
reflects from its own viewpoint while the culler judges from the eye (as before). Phone screenshots (390 × 844, clear weather): Karpvägen,
the courtyard, the patio and the kitchen are pixel-identical before and after; the start differs in 228 of 329 160 pixels, all
inside the kitchen window (a small thing on the worktop gone at ~15 m: the phone factor) plus a 1-px line on the brick that had
shown through (`/tmp/claude-0/shots695`, not in the repo).

**Not done:** the kitchen's fronts and drawers are an Openable each (2–3 calls apiece, ~30 at start): batching them like the
visited flats' `batchFronts` (#621) is a larger change; the entrance plants (~13 calls at start, one pot, soil and foliage
mesh per plant); the street's start view still draws ~170 things through the kitchen window that are really in view.

Leaf-card trees (#679, `src/foliage.js`): the crowns stay one InstancedMesh per batch (site trees + shrubs, courtyard plantings,
vines, southern woodland) on ONE shared material and atlas, so draw calls do not change. Per lobe 60 triangles (phone 56)
instead of 80, trunks 46 instead of 28 (a leader and three branches); the cards are single quads drawn two-sided. Textures:
one 512² leaf atlas (256² on phones, a `DataTexture`, ~1.3 / 0.3 MB with mips) and two 64 × 128 bark textures. perfcount on
84c3207 without → with (calls unchanged at every spot; the `start` spike to 768–837 calls is #695 and comes and goes in
both): desktop kitchen 628 034 → 621 648, park 895 157 → 893 663, big hall 1 007 801 → 1 006 343 triangles (over budget
before as well, #704); phone kitchen 437 230 → 426 064, park 579 166 → 571 220, basement 915 934 → 908 628; textures
~297 → ~298 MB desktop, ~81 → ~82 MB phone. One new program pair (leaf material + its alpha-tested depth variant), compiled
by the warm-up like every scene material. No distance LOD: an InstancedMesh draws every lobe; fewer cards on phones only.

Combat collision (#715) uses a capped conservative private occupancy grid, prepared incrementally with native-raycast fallback. [Actual-scene CPU update measurements and cold-build limitations](../validation/issue-715/README.md) document the confirmed desktop gain; these are not rendered-frame/FPS measurements or physical-phone validation.

Cold-path diagnosis (#715): `combatWorldMetrics().lastPath` holds one copied record of the latest **completed** asynchronous obstacle query (completion order, not start order for concurrent callers). It records `result`, `reason` (`clear`, `blocked`, `deadline`, `cancelled`, `cache-invalidated`, `instance-mutated`, or `error`) and final `stage` (`prepare`, `cache`, `traversal`), plus elapsed time, active intervals between yields, total yielded wall time, the subset spent awaiting promoted cache entries, maximum active slice, promoted-cache count and deadline overrun. Read it with `const { combatWorldMetrics } = await import('./src/combatworld.js'); combatWorldMetrics().lastPath` on the game page after the shot resolves. Active intervals are wall-clock measurements, **not thread CPU or GPU time**; yielded time includes other tasks, cache construction and scheduling delays and does not isolate each cause. No scene objects, player identifiers, paths or history are retained or uploaded. A delayed deadline callback can overrun while the query is yielded; elapsed time alone does not prove one long synchronous raycast. The native 2 s deadline, scheduling and hit decisions are unchanged. See [new evidence and scope](../validation/issue-715/README.md#cold-path-diagnosis-2026-10-13).

Nerf (#714) adds bounded private spatial indices and per-shot instanced selection, with cooperative obstacle validation and a conservative 2 s deadline. [CPU-only apartment validation, preparation and cold-miss limitations](../validation/issue-714/README.md) separate the actual scene from small-module/Worker tests; no measured FPS or physical-phone claim.


## Cold triangle copying (#715, 2026-10-13)

TriGrid still constructs the same Float32 world-space triangles and synchronous cell map. Copying a world
vertex now uses three scalar stores instead of allocating `[x, y, z]` and calling `Float32Array.set` for every
vertex. Groups, private bounds, binning, hit traversal and invalidation are unchanged; no new background jobs,
quotas or readiness states are introduced. Separate native constructor-phase measurements on the production
furniture component found transformation/copying dominated the tested cases, rather than cell binning.
Independent historical-source parity and balanced uninstrumented construction/actual Darts samples establish
less cold work in those component fixtures; no measured reduction of the earlier full apartment's 625 ms spike
or physical-phone FPS is asserted. [Measurements and limits](../validation/issue-715/README.md#cold-triangle-copy-follow-up-2026-10-13).

## Phone panels and covered rendering (#669)

Reading the freezer note previously set the moving-shadow hold for 1.5 seconds even
though it only opened DOM. This requested the full shadow pass on every frame.
The note no longer requests that hold. Doors and other moving shadow casters keep it.
After startup and warm-up, phones keep simulation, DOM and network updates running
while drawing at most once per `LOW_MEMORY.coveredFrameMs` under reading/pause panels
(100 ms, a conservative assumption rather than a device measurement). The opaque
portrait instruction and hidden document suppress those regular scene/mirror/shadow
renders. Closing the panel or returning to landscape draws the next gameplay frame
immediately. Quality adaptation is reset while the phone view is covered; fast
logic-only callbacks must not be mistaken for spare GPU capacity.

Warm-up, the first complete visible frame and explicit `&shot` mode retain their
usual rendering. Shadow time accumulates over skipped draws; simulation time and
multiplayer updates are not throttled. `tools/phonepaneltest.cjs` uses the real app,
real WebGL and a controlled clock to compare draw/pass counts, not physical FPS or
proof of a fixed iPhone watchdog failure.


Current local cold Marks diagnosis (#715): after private-bounds rejection and scalar TriGrid copying, the native production-furniture component's actual Marks mesh collector still spends most cold overlapping/distant query time scanning private bounds. The diagnostics driver separates instrumented scan/grid/hits/native/residual intervals from uninstrumented query/Darts timing; it changes no production runtime. See [current samples, reproduction and limits](../validation/issue-715/README.md#current-private-bounds-diagnosis-2026-10-13). These component intervals neither attribute the previous full apartment 625 ms spike nor measure phone FPS.


The subsequent #715 scalar-bounds mitigation keeps native getter/extrema semantics and all transforms/padding/cache behavior. Independent baseline/native parity and balanced uninstrumented furniture-component runs reduce whole-list cold query/Darts work, with no warm gain and a measured regression for the isolated largest mesh. [Exact samples, retained failed stochastic attempt, deterministic parity inputs and limitations](../validation/issue-715/README.md#scalar-private-position-bounds-candidate-2026-10-13) prevent extending that result into an unmeasured apartment/phone claim.


Current full-apartment diagnostic (#715, source d962618b) retains a local cache-cold 90.4 ms effect-update spike and incoming/obstacle cache waiting after a 30 s scheduler window. It is one no-test/quality 0 same-browser injected-effect sample, not reciprocal combat, a native before/after or phone-FPS proof. Idle startup rendering, shadow intervals and later render calls are separated and retain their actual different draw counts. [Raw-case summary, provenance and finite remaining investigation](../validation/issue-715/README.md#current-actual-apartment-diagnosis-after-scalar-bounds-2026-10-13) records no remote-warm claim and no additional runtime change.


### Combat cache queue selection (#715)

`combatworld` now reuses a cache-job selection within one synchronous builder callback until the queue head changes or spatial completion changes eligibility. The original urgent-first/spatial-first order, every between-operation budget check, timers, admission limits and raycast/cache algorithms are preserved. The former implementation searched hundreds of queued jobs again for every vertex/triangle/bitmap cell. `tools/combatcachetest.{cjs,html}` retains the unchanged historical source, bounded phase diagnosis, complete operation/buffer parity, independent native hit metadata, urgent/invalidation/disposal/large-AABB checks and uninstrumented reversed-order callback-throughput observations; it loads actual Three without WebGL or the apartment. Existing `combatworldtest.html` remains the broader native query/path regression. [Results and limits](../validation/issue-715/README.md#cache-queue-selection-remedy-2026-10-13).

Spatial readiness and bitmap readiness are distinct: the existing scheduler postpones bitmap filling while any admitted spatial view remains unfinished. `fallbackQueries` increments for a nonempty ray candidate before rangedHits, including spatial-accelerated traversal; it does not count only full-mesh native raycasts. The new representative 804-job component shows greater spatial progress in the same 100-callback allowance, not actual apartment readiness, full effect/frame time, thread CPU/GPU work or physical-phone FPS. Source-stamped raw results are saved before native result screenshots; incomplete later phases cannot produce CLI green.


`nerfapartmentprobe.cjs --cache-acceptance` provides a separate finite ordinary-app check of the cache scheduler: native 30-second callback progress, actual scene geometry/cache counts, independent native solid-hit metadata before/after, actual local/incoming Darts and deadline query, followed by two quality-0 native draws and one bounded CDP PNG. Automatic app-loop registration alone is paused; native clocks/idle/rAF callbacks remain active. Source-stamped checkpoints precede images and retain failed or incomplete final phases. [Current observations and validation limits](../validation/issue-715/README.md#actual-apartment-cache-acceptance-after-scheduler-selection-reuse-2026-10-13). First-run CLI 1 is retained for the erroneous four-children-per-dart fixture assumption; production darts have two meshes each/four combined. No CPU/GPU/FPS or causal cross-host before/after claim follows from that partial result.

Corrected actual-app cache acceptance: 17 checks/real CLI 0, 118.987 s, no source mismatch/page errors; native 30,000.2 ms progresses 0→31 spatial-ready with 804 pending/0 bitmap-ready. The clear obstacle finishes within its original 2-second deadline. A root-reviewed actual 480×300 CDP image shows the ordinary room/gun and local/incoming darts; this remains same-browser injection with a paused app loop, not a fully warm cache, reciprocal WS PvP, a phone measurement or a causal before/after benchmark. The first wrong-hierarchy fixture run remains CLI 1/image incomplete.


Reciprocal transport follow-up (#715): `nerfreciprocaltest.cjs` verifies two real native held-Nerf clients against the actual local Worker (18 checks/CLI 0, no WebGL), including authoritative hits/lives, actual WS incoming darts and natural heartbeat frames. The one ordinary-apartment-plus-native-peer attempt remains CLI 1: its first pending shot sends a targetless packet after 2002 ms, without a hit receipt. A deadline is a source/timing-supported theory; that executed driver did not record exact muzzle or completed lastPath, so blocking versus deadline is not established. No World image, reciprocal World completion, FPS/phone or latency benchmark is claimed. [Exact retained evidence and next diagnostic fields](../validation/issue-715/README.md#real-reciprocal-workernerf-follow-up-2026-10-13).


Cold pending-cache wait (#715): the actual first-shot-only ordinary apartment diagnostic now establishes `result:null`, `reason:deadline`, `stage:cache` for 55 promoted entries at the unchanged 2-second limit; its exact recorded candidate arc has zero independent native solid hits. The narrow remedy rechecks the existing conservative emptyPath only after a private vertex scan finishes. It drops an entry's wait/urgent ownership only if every originally overlapping mesh occurrence now prunes; actual live hit traversal remains unchanged. No budget, timer, synchronous geometry scan, grid representation or hit algorithm is changed. Native historical parity covers shared/colliding meshes, mutations and concurrent urgency. [Actual observations, controlled component proof and limits](../validation/issue-715/README.md#first-shot-cache-deadline-and-conservative-wait-release-2026-10-13).

Post-remedy first-shot actual check (`0b19f75`): 8 diagnostic checks/actual driver+supervisor CLI 0, but the gameplay prediction still reaches null/deadline/cache with 55 promoted and no hit receipt; exact recorded native arc remains clear. Thus the native unnecessary-wait class is improved without establishing resolution of this actual cold apartment path. Its different timing intervals are observations, not a causal before/after or phone-speed claim; see the retained `apartment-after` evidence in the validation note.


Native actual-building phase diagnosis (#715) constructs production world/Core/Garage/Detail geometry without a renderer. Passive per-promoted-entry snapshots show serial spatial construction leaving other urgent entries unscanned. Thirty-nine of 55 component candidates are already rejected by the **exact native infinite-forward local ray** against their existing authored box. Async promotion/wait now uses that rejection, with finite/invertible/safe-mesh guards and no box recomputation/mutation; generic near/far queries remain unchanged. Never replace this with clipped segment-AABB rejection: intentionally undersized boxes can lie beyond far or behind near while native Mesh still hits a triangle elsewhere. [Phase data, preserved parity and remaining deadline](../validation/issue-715/README.md#native-actual-building-phase-and-native-box-admission-2026-10-13).


Fresh native-bound reuse (#715): independent post-outcome scans of the actual component's remaining16 entries find **0 finite-arc/private-AABB rejections**, so scanning every urgent entry first is not justified for extra pruning. All16 instead have newly computed native bounds at Detail with unchanged position/layout/getter/version identity, matching independent extrema exactly. Detail's existing missing-box native call now seeds only an already queued, valid, untouched (`scan===0`) private entry before spatial/bitmap work. Existing authored boxes, unsupported/mutated/custom/morph/invalid/disposed/partial entries retain the original pass. No new compute, registry, timer, budget or scheduler policy is added. [Exact operation reduction, buffer parity and native scheduling limits](../validation/issue-715/README.md#fresh-detail-bound-reuse-after-frontier-diagnosis-2026-10-13).

The one ordinary World+native-peer acceptance after fresh-bound reuse still records first-shot null/deadline/cache1999.0ms with17promoted,804pending/0bitmapready/1spatialready; actual CLI1 and no image/retry. This bounds the native component claim:307335 duplicate operations avoided is not a demonstrated full-game first-hit fix or phone gain. The17 cannot be identified as component16 plus one from counters. A next attribution needs entry identities/phase and trusted-call coverage, not longer wait budgets.

Spatial count/fill (#715) now lazily reuses six per-entry scratch arrays with direct three-element resets, preserving getter/numeric/finite order, triangle mapping, typed outputs, budgets and scheduler. Scratch starts only at the first spatial triangle and is released at spatialReady/cancel/invalid settlement; no new long-lived registry or eager804-job allocation. Existing typed spatialBytes does not account all JavaScript heap. On the saved49118-triangle component this changes785888 executed array-creation expressions to6, not a measured heap-allocation number (V8 may scalar-replace temporaries). A first `.fill` reset candidate was rejected for measured slowdown despite parity. The delivered constant-reset candidate passes82 focused/485 broad native checks; matched controlled count+fill observations are76.0→61.4ms,157.3→75.9ms (reverse order),115.6→70.7ms. These variable native blocks neither map actual17 waiters nor prove cold World/phone/FPS improvement; [full evidence and limitations](../validation/issue-715/README.md#spatial-builder-array-reuse-2026-10-13).

Cold static native query (#715): `combatcold.js` borrows original geometry attributes/index/bounds in a query-local shallow view. Already scanned valid entries can answer in128-triangle native chunks while spatial construction continues; the original2ms cooperative slices/2s prediction deadline, ready accelerator and unsupported waits remain. Each original group's native start phase/order/overlap/partial triangle is retained; public drawRange/groups/bounds never change. Whole geometry/material/ancestor/matrix/layer/native-getter signatures and disposal are checked before resuming a chunk after yields, and before accepting hits. Only when every original occurrence is eligible can its shared wait/urgent user release early. [Native parity, held-builder policy observations and limitations](../validation/issue-715/README.md#cold-native-triangle-path-2026-10-13) distinguish this from a whole-app/phone gain.


## Covered phone viewport resize (#669, 2026-10-14)

The new public loss/restore pair in build7834406 occurs after warm-up (`done`,
260 stable programs), 1.1 s after the recorded orientation event, with a 47 ms
restore. Saved CPU samples are 2–6 ms; they are not the loss frame or GPU timings.
The preceding ~9–10 fps while reading follows the intentional 100 ms covered-view
cadence. Aggregate renderer calls/triangles can include a shadow redraw. Neither
the estimated source texture bytes nor this timing establishes the loss cause.

`bindGameViewport` accepts optional `deferResize`; existing callers retain immediate
resizing. Main enables it only under the same fully prepared phone policy used to
skip ordinary draws: low-memory, no screenshot mode, warm complete, first full view
complete, and hidden document or opaque portrait cover. CSS remains in charge of
the canvas and `gameView` follows each valid observed CSS size. While deferred,
projection remains paired with the old buffer. Pending changes flush inside the
CPU frame timer before simulation/render, independently of resize-rAF ordering.
Unchanged frames do not read layout through the flush. Disposal cancels pending
work and prevents later flushes; no new timers or changed quality settings.

Actual native index/Three r170 component comparison at ratio0.75: landscape
852×393 → covered393×793 → covered393×852 → original landscape formerly made
three `setSize` calls (six canvas width/height writes); now none. An uncovered
844×390 resize still makes one call/two writes and yields633×292. A latest-layout
resume before the queued resize-rAF synchronizes760×340/570×255 and projection
before the actual tiny-scene draw. Original loss/restore logging and guarded
phone reload remain unchanged. This is a reversible reduction of unnecessary
covered-buffer resizing, not a demonstrated iPhone GPU-crash fix. #669 stays open.

Recovered covered-projection diagnostics (#669, 2026-10-15): CrashLog now labels the
intentional mismatch `covered-projection` only after measuring the opaque rotation
cover and validating the binding's pending resize and retained camera/buffer pair.
It preserves the original report/message; genuine surface/projection faults remain
reportable. This adds no rendering or allocation policy. Native DOM/camera tests do
not establish a GPU cause: the actual build0eed5ed iPhone context loss at up61,
after orientationchange at60.6, remains a real unexplained loss. Physical iPhone
rotation and context-loss acceptance are outstanding.

Warm custom intersections (#949): private combat proxies require the original captured Three Mesh `_computeIntersections` method as well as existing raycast/getVertexPosition eligibility. A custom method uses the original mesh fallback, including after cache preparation or path snapshot creation; removing it permits acceleration again. Shared geometry does not transfer one mesh's eligibility to another. This fixes native0/cache256 false hits without changing geometry, metadata or the cold query policy. Native CPU regression uses explicitly synthetic256-triangle geometry, not the unavailable Surface component or a World benchmark.

## Complete static entrance backing (#976)

`CoreHouse` retains the original static wall runs and dark flat-door cells in its exterior opaque batch. Immediate lobby-floor adjacency alone is insufficient: C’s entrance sees a hall/shaft through a corridor. The exact original triangle/color/material multisets are preserved, without duplicated or invented wall shells. Actual lift/stair detail and its near rectangle remain unchanged; native frustum culling stays enabled.

Native visible far mesh/triangle totals: A8/572→8/2722, B0→8/3760, C0→8/6540. Near A67/10790 stays unchanged; B55→56 meshes with10458 triangles unchanged; C76→77 meshes with17242 triangles unchanged. These CPU geometry counts exclude outlines and are not screen draw calls or live performance. Additional distant shell triangles are bounded original static geometry; the heavier lift/stair detail stays gated.

Final actual World screen-pass comparison (900×560/DPR1, desktop quality0/3): A far169→173 calls/+5836 triangles, B far118→131/+6398, C far115→126/+6530. Near A adds1 call and B/C3 calls each, with unchanged screen triangles. L far adds19 calls/+12382 triangles; L near adds13/15 calls and12342/12366 triangles at quality0/3 respectively because the scene also includes the newly retained neighbouring core shells. L’s own geometry and through-passage stay unchanged. All16 final views are within the existing desktop520-call/1,000,000-triangle bounds; maxima are463 calls and784326 triangles. The quality0 check is not a lowmem-phone benchmark; no live FPS, texture-memory or physical-device claim is made.

## Shadow redraws after "Använd" on phones (#1100 — not verified on a device)

iPhone reports (`/crash/public`, builds a3541b8 … 8650128) lose the WebGL context mostly in the hall and kitchen, typically
0–3 s after `tap action`, and restore it within 13–31 ms (the page then reloads, `reloadOnContextRestore`). What the button
hits there (iPhone profile, headless): the hall mirror's night lamp, the front door, the fuse box, the inner doors, the
kitchen board, fridge, drawers and drawing. All of them go through `use()`/`runChoice()`, which set `shadowState.hold = 1.5`:
the whole shadow map (~600–850 draw calls on a phone) was redrawn **every frame** for 1.5 s of game time (longer in wall
time below 20 fps, since `dt` is clamped to 0.05), instead of once per `QUALITY.shadowInterval` (1 s at level 0).

`sourceTexMB` jumping from ~40 to ~120 MB around up 20 s is **not** a late load: the crashlog's texture walk runs after
~10 s and then every 60 s (`CRASHLOG.textureEveryMs`), and nearly every session (Android too) settles at 115–127 MB.

**Change (phones only, `lowMemory`):** during a hold the shadow map is redrawn at most every `LOW_MEMORY.shadowHoldEvery`
(0.15 s, *guess*), plus once after the hold so the final pose is drawn. Desktop keeps every-frame redraws (`shadowHoldEvery`
is 0 there; the code path is the old one). Measured with a probe (iPhone profile 852×393 @3, `google-chrome --headless=new
--use-angle=gl`, real Iris 640 GPU) at 11 targets: shadow passes in the 1.5 s after the tap, before → after: every frame
(8–16 of 8–16 frames) → 4–7 of 13–33 frames; the following 1.5 s 6–11 (all frames) → 1–5. Draw calls per window drop
accordingly although the after-run drew more frames. Screenshots: `~/lunden-shots/krasch1100/` (outside the repo).
To go back: set `shadowHoldEvery: 0`. Diagnostics: every crash heartbeat sample now carries `sh` / `shHold` (shadow redraws
since the last beat, all / held after a tap); in a headless check after a tap they read 6 / 5 on the phone profile and
12 / 12 → 15 / 15 on desktop (every frame, unchanged). The next iPhone report shows directly whether a loss follows a burst. The cause is a *guess* (a sustained GPU spike tripping iOS); the context loss itself
cannot be reproduced without a device.

## Sun and follow-box shadow redraws on phones (#1192 — not verified on a device)

The first iPhone report after #1100 with the `sh` counter (build 4aa06b6, kitchen) shows **18–20 shadow passes per 2 s
sample with only 0–2 of them held**, at fps 10, right after the wall clock strip was used (`tap BUTTON`, `clock-close`), and
the context lost at the next sample. Spooling the clock moves the sun 1.5 h/s, i.e. > 0.2° every frame, and the sun
trigger in `updateShadows()` was not throttled: every frame redrew the shadow map. Outdoors, #1144's follow box led 5 m
along the view, so merely turning on the spot moved the target and redrew the map ~5 times a second.

**Change (phones only, `lowMemory`):** sun-triggered redraws wait at least `LOW_MEMORY.shadowHoldEvery` (0.15 s) like the
held ones, and the follow box does not lead along the view (`SHADOW_BOX.lowMemoryLead` 0; it is still centred on the
visitor and snapped to 2 m). Desktop: `shadowHoldEvery` 0 and `SHADOW_BOX.lead`, the old path. Probe (iPhone profile
852×393 @3, `&lowmem`, google-chrome headless `--use-angle=gl`, 3 s windows), shadow passes / frames before → after:
kitchen spooling 22/33 → 10/46; outdoors turning at the start spot 15/63 → 2/74; kitchen idle 2/41 → 2/47; outdoors idle
2/43 → 3/49; outdoors walking 4/52 → 4/46. Triangles, draw calls, geometries and textures unchanged. To go back: set
`lowMemoryLead` to `SHADOW_BOX.lead` and drop the `shadowState.age >= shadowHoldEvery` condition (or `shadowHoldEvery: 0`).
The cause is a *guess*; the other losses that day (start-up warm-up, an orientation/viewport change, 3–4 s stalls after
`start-go`) showed no shadow burst and are tracked separately.

## Site-wide instanced batches in the phone shadow pass (#1195 — not verified on a device)

iPhone reports (#1192) also lost the context outdoors without shadow spikes: after `viewport-resize`/`orientation-change`
and 6 s after `tap start-go`, with `lagMs` 3.4–3.7 s and fps 43 → 4 / 15 → 2 at ~480 calls / ~1 M tris. Measured in headless
Chromium/SwiftShader, iPhone 14 Pro profile 852 × 393 @3, `lowMemory`, quality 0 (px 0.75, shadow 1024²), noon in July:

- **Resize/rotation does no heavy work of its own.** After a full sliced warm-up, frames driven by hand around a visualViewport
  shrink (852 × 300 and back) and portrait → landscape: 0 new programs, 0 texture or buffer uploads, 0 renderbuffer allocations;
  the drawing buffer stays 639 × 294 (portrait defers it, #669). A few frames after the rotation single render frames of
  1.8–4.1 s appear with no uploads and no shadow pass: GL calls wait for the GPU process, which is re-compositing the page at its
  new size. *Guess:* on the iPhone the same wait is the 3–4 s `lagMs`, and its cost grows with what our frames already ask of the GPU.
- **What the start area draws** (render-buffer hook per draw, view and shadow pass apart): worst at the start, yaw 135°, view
  513 calls / 897 k, shadow pass 239 / 495 k. ~218 k of the shadow triangles were InstancedMeshes covering the whole site — the
  trees (≈1 200 crowns, ≈1 000 trunks over ~570 × 450 m) and the 19 parked cars on the north street (≈5.1 k each) — drawn whole on
  every shadow redraw because three culls an InstancedMesh by one sphere round all instances, while the shadow box is ±14 m.

**Change (`lowMemory` only, `src/shadowtiles.js`, `SHADOW_TILES` in config):** before the warm-up, every shadow-casting
InstancedMesh spreading over more than `minSpread` m stops casting and gets children holding its instances in `size` m squares
(same geometry, material, matrices, colours; 230 squares in 8 batches). A wrapper round `renderer.shadowMap.render` shows the
squares only during a shadow pass, so the shadow camera culls the far ones; the view still draws the batch itself (calls and
look unchanged). The squares follow the batch's `instanceMatrix`/`instanceColor` versions (seasons.js rewrites the crowns).
`&noshadowtiles` turns it off for A/B runs. Desktop never calls it. How often the map is redrawn is #1192's (unchanged here).

| shadow pass, triangles | before | after |
|---|---:|---:|
| start, yaw 135° | 495 k | 313 k |
| start, yaw 0° | 333 k | 158 k |
| outside the front door (1.2, −0.3) | 431 k | 249 k |
| x 13.7 z 1.4, yaw 90° | 518 k | 316 k |

Parity: read-back pixels at five outdoor spots (start, the parked cars, park, courtyard, east trees) differ between tiles on/off
by 1.1–8.9 % of pixels, less than two runs with tiles on differ from each other (0.7–13.9 %: moving clouds, traffic, people).
perfcount `?lowmem&w=390&h=844` view numbers are identical with and without (its pre-existing FAIL is #1211);
`turntest.html?lowmem&spots=start,courtyard` passes (0 new programs and textures while turning after the warm-up: the squares
share the batches' programs and are drawn by the warm-up's shadow pass). View-pass detail for the cars and trees is #1213. The iPhone check
remains: whether outdoor rotations and the first seconds after Börja keep the context.

## Far parked cars coarse in the phone view (#1213 — not verified on a device)

The car park on the north street (19 cars) and the garage (23 cars) draw their cars as four InstancedMeshes (paint, trim,
glass, tyres; ~5.1 k triangles a car) culled by one sphere, so the start view drew all street cars in full although most
stand 30–75 m away. On `lowMemory` (`src/viewlod.js`, `VIEW_LOD` in config, batches tagged `userData.carBatch`) each set
keeps only the cars within `carNear` m (30, *guess*; 2 m hysteresis) in its batches (`count` + instances packed to the
front); the others go to one extra InstancedMesh of a coarse body (`streetlife.js carFarGeometry`, ~125 triangles, vertex
colours, paint as instance colour). The split is redone when the camera moved `step` m. Shadows are unchanged: the
batches' shadow squares (#1195) are frozen with the full cars before the buffers are reordered (`freezeShadowTiles`).
An emptied batch gets a far-away bounding sphere (no zero-instance draw). Rays hit near cars in the batches and far cars
on the coarse body. `&nocarlod` turns it off. Desktop never calls it.

Measured (headless Chromium/SwiftShader, iPhone 14 Pro profile, quality 0, noon in July; view pass, calls / triangles):

| spot | before | after |
|---|---:|---:|
| start, yaw 135° | 514 / 897 k | 515 / 817 k |
| start, yaw 180° | 486 / 857 k | 482 / 759 k |
| start, yaw 0° | 87 / 447 k | 83 / 349 k |
| outside the front door, yaw 135° | 255 / 742 k | 252 / 646 k |
| x 13.7 z 1.4, yaw 90° | 398 / 850 k | 395 / 754 k |

Calls change by at most +1 (the coarse batch next to a partly near set) and drop where the near set is empty. Read-back
pixels at six spots (start, the car park from both ends and its middle, the garage drive) differ between on/off by
0.06–2.7 %, the same as two runs with it on (0.1–3.3 %). `turntest.html?lowmem&spots=start,courtyard,street`: ALL PASS
(the one program on arriving at `street` is there with `&nocarlod` too). The trees were left alone: their crowns (56
triangles) and trunks (46) are already coarse, seasons.js rewrites the crowns, and a near/far split would add a call
per batch for ~8 % of the start view's triangles.

## Startup long tasks and the world built in parts (#1133)

`src/longtasks.js` records startup long tasks (`PerformanceObserver` `longtask`, buffered, until `#loading` is done), each
with the loading step it began in: `__lundenLoading.long = { top: [[ms, step]…], n, sum }` (top `STARTUP.longTasksKept`),
also in the crash heartbeat as `long`. `buildWorld` is now the synchronous wrapper around the generator `worldParts`;
startup calls `buildWorldSliced(plan, pause)`, which awaits `loadingYield` (one paint, at most `STARTUP.stepYield` ms)
between parts. `surroundingsParts`, `southBackdropParts` and `leafAtlasParts` are delegated the same way; their
`buildSurroundings` / `buildSouthBackdrop` / `leafAtlas` stay synchronous for tools. Per-part timing showed that the
longest single block was not the flat but the shared leaf atlas (first drawn by the southern backdrop): ~25 s in one
`getImageData` flush of ~9 000 queued GPU canvas draws in headless Chromium. Its canvas is now CPU-backed
(`willReadFrequently`), drawn in parts; the readback costs ~50 ms. Warm-up (#697) is unchanged.

Measured (headless Chrome/SwiftShader, very loaded 4-core machine, before = b504d57, after = 673b78d, runs
alternated; numbers are noisy):

| Profile | Longest task before | Longest after | Start to card done, before / after |
|---|---:|---:|---:|
| desktop `?warm`, 1280×800 | 56 s, 48 s (whole Bygger huset) | 25 s, 99 s | 137 s, 125 s / 63 s, 161 s |
| phone `?lowmem`, 390×844, iPhone UA | 37 s (Bygger huset) | 14 s | 137 s / 140 s |

That run also showed a desktop block of 25–105 s in a pause after the façade-texture part of the surroundings, then
thought to be queued 2D-canvas textures flushed at a paint. #1159 (2026-10-17, unloaded 4-core VM, headless
Chromium 141/SwiftShader, `?warm`, 1280×800, Chrome traces) did not confirm that:

- Default headless flags: 2D canvases are not GPU-backed at all (20 000 `fillRect` + `getImageData`: ~15 ms with or
  without `willReadFrequently`). With `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` they
  are (the same readback ~1.2–1.3 s, ~15 ms with `willReadFrequently`), but all 2D-canvas raster on the GPU thread up
  to the card being done summed to ~4.5 s in ≤ 0.8 s tasks; no long task in Bygger huset after the surroundings.
- The façade/roof textures in `surroundings.js` are tiny: ~450–740 draw calls each (≈ 3 000 together) of ~680 000 2D
  calls at startup. The volume is in the furniture textures (`zigzagRugTextures` ~238 000, `pileTextures` ~180 000,
  `archRugTexture` ~60 000), then the palm (`patio.js`), boxwood and grass textures.
- Forcing `willReadFrequently` on *every* 2D context (init-script patch) changed nothing measurable, alternated runs:
  longest startup task 19.0 / 28.3 s before vs 20.1 / 28.5 s after (default flags), sum of long tasks 39.5 / 55.2 vs
  39.4 / 56.9 s. So no canvas was switched.
- The long block that remains is the WebGL warm-up (#697), Värmer upp vyn: 19–30 s single tasks, the renderer's
  compositor `ReadPixels` waiting on the GPU thread executing the queued WebGL frame (SwiftShader draws, ANGLE
  shader compiles on worker threads). On desktop it can fall after the card is hidden, so `__lundenLoading.long`
  sees it only sometimes. It is a SwiftShader cost (headless runs skip warm-up without `?warm`), not a 2D canvas one.

Re-measure with a Chrome trace (`GPUTask` children `WebGL` vs `RendererMainThread`/`RasterDecoderImpl`) before
switching canvases. Next: Möblerar on phones, ~12 s (#1160), and smaller build parts, 3–9 s (#1161; the furniture part,
share 0.33–0.42 of the build, was the longest Bygger huset task here, 4–6 s).

**Möblerar on phones (#1160).** Per-statement `performance.mark`s showed that the ~12 s block was not the furnishing
itself (~1.5 s in all, no part over ~0.4 s) but one `renderer.setPixelRatio` from the quality level's resolution knob
(1.25 → 1.125 at `QUALITY.startLowMemory`): reallocating the drawing buffer after the house is built waited ~11.5 s
on the GPU thread. `quality` and its resolution knob are now created right after `params0`, before the house is
built, so the start ratio is set while the buffer is still empty (desktop starts at the top level: no change in ratio).
The other knobs still register where `sun`, the mirror and the weather exist. Möblerar also yields once before
`new Life` (nothing above it registers listeners or timers). Phone profile, headless SwiftShader, before = 4aa06b6,
runs alternated: longest task 19.4 s / 13.0 s (Möblerar) → 3.8 s (Bygger huset) / 4.9 s (Värmer upp vyn); Möblerar
1.4–1.7 s as a step; card done 98 / 74 s → 86 / 92 s (noisy). Part of that queued GPU work now lands in warm-up's
first renders instead (its longest tasks 3–4 s → 4.7–5.5 s), still behind the cover; #1159 owns that cost.
Warm-up (#697) and `STARTUP` are unchanged.

**Smaller buildWorld parts (#1161).** The remaining long synchronous chunks in Bygger huset (the upper floor `buildLevel`,
loose `buildFurniture`, the visited flats `buildVisitFlat`, and the group with blinds and the hall wall)
are now generators or delegated:
- `buildFurniture`: synchronous wrapper around `furnitureParts()`, which yields progress every 10 pieces.
- `buildLevel`: synchronous wrapper around `levelParts()`, yielding between walls/windows, doors/trims, interior fittings/fixtures, and AO plates.
- `buildVisitFlat`: synchronous wrapper around `visitFlatParts()`, yielding between lower/upper level parts and the static merge.
- `worldParts`: yields around `architectureEdges`, between blinds, shelves and hall wall.


## Walkable roofs of the mapped buildings (#1294)

Collision only: `src/buildingroofs.js` adds polygon surfaces and ring walls for the mapped backdrop buildings to `userData.walk` (no meshes, no draw calls, no triangles). `Roofs` looks surfaces and walls up in a 20 m grid (`Roofs.CELL`), so the extra ~54 roofs / ~700 wall segments cost one cell lookup per query; `Roofs.walls(y0, y1, x, z)` returns only the 3x3 cells round the body.

## East lot ribbons and paving follow the terrain cuts (#1310)

After #1305 (terrain from the elevation grid) `east-access` grew from 8 524 to 13 975 triangles and the campus from 77 635 to 83 086 (budget 78 000). Per-mesh breakdown (hook over `group.traverse` in eastbackdroptest): `east-modern` 49 038, `east-access` the only grown mesh. Fixes in `src/sitebackdrop.js`, no budget raised: stall lines and the kerb strip are cut (`ribbon`) only where `cutAtTerrain` says the terrain bends and then thinned (a cut stays only if dropping it would move an edge more than its lift over the asphalt minus 3 mm, max 2 cm); consecutive kept kerb pieces join into one strip; paved polygons use `cutAtTerrain` (exact, `PAVE_CUT`) instead of 4 m bisection; asphalt/paving pieces wholly under an east building are dropped. Result: `east-access` 8 655, campus 77 774. perfcount still has `big hall` at 1 000 138 (> 1 000 000) from the terrain mesh itself, tracked in #1311; calls 509, textures ~308 MB (run the page directly: `tools/perfcount.html` is not a runtests name, use a Playwright page load against `tools/devserve.py` and read `#out`).

## The playhouse's children's room (#1326)

The hidden room (`src/playroom.js`) adds no cost outside: its group is `visible = false` until the visitor is inside (main.js `playroom.setInside`, synced every frame against the position), so it is neither drawn nor shadow-mapped and the courtyard's draw calls are unchanged before and after a visit (`tools/playroomtest.cjs`: 132 / 570 030 in the test view both times). Inside it is 4 meshes (#1327): one vertex-coloured mesh for the shell, all the furniture and the screens, the emissive lamp panel, the rotating disco ball and the light-spot quads (one alpha-textured 32 px canvas map; their 26 quads are recomputed per frame inside only) plus invisible pick boxes (not drawn); the whole view inside is 12 calls (as before the furniture; the test allows 14). No lights (the daylight is zeroed by `day.under` and `day.lit` lifts the ambient). Billiards (#1328-#1330) must stay in merged batches and keep the room's group hidden outside.

Final partial-delivery measurements at quality0: baseline445maximum calls becomes372 at start,
with370kitchen/365living/363upstairs/337garage/367park; maximum827536triangles/~97MiB.
Landscape correctly exits1/SOME FAILED against the unchanged370limit. Portrait293calls/747434triangles/~99MiB
passes. The independent desktop triangle failure#1387 remains:492calls/1042197triangles/~308MiB.
Neither#1383 nor#1361 is complete: the concrete shared far-car-batch follow-up is#1392.
Do not raise the limits or describe this partial change as a solved phone budget or iPhone crash fix.

## Complete roof-terrace batches (#1448, partial source delivery)

Standard/max quality3, July noon, actual1280×800 World at patio spawn(2.9,16),
pitch−5°, normal1.62m eye/step exceeds1M triangles. No regression cause is claimed.
The three long roof-decoration spheres admitted geometry wholly above the view.
Desktop now merges complete source terraces separately (21 meshes, three shared
surface materials); phones keep the original three combined batches. The original
single generation pass/master arrays, ordered position/normal/color/plantWind
values (including phases), records, depth material and wind-sphere padding are exact.
ONE original CeilingBatchGate retains its full union bounds, occluders/base conditions;
the distance/behind-building gate is unchanged. No movable furniture policy changes.

Fresh de1bc21b World measured patio507/1,029,670→504/998,466 (-31,204), pixel0 with
fresh shadows. Subsequent road source9eb4ccfa adds2,873 daytime triangles; a NEW actual
World measures506/1,032,541→503/1,001,337, again pixel0. **The latest target remains
1,337 over budget: #1448 stays open pending railing source
child #1454.** The roof-decor split is a verified useful partial delivery, not a resolved
latest-main budget claim. No railing changes belong to this private-decor commit.
Corner/upward-patio and clearly exposed furnished-roof pairs also have pixel equality;
the exposed roof is a diagnostic camera, not a walking-route claim. Existing native
terrace checks pass68, including all8 styles, emptyL1201, layout/gates/night/power.
Native touch opens/closes the real glazed patio door; child geometry references and
physical ray hits are exact, and all21 decorative meshes remain non-blocking.

All19 standard desktop views and quality/texture checks passed on de1bc21b: peak481
calls/979,658tri/~311MiB. With the reviewed road-only+2,873/0calls/0textures delta,
the conservative composition is≤481/982,531/~311; no repeated latest-main19 claimed.
Phone quality0 batching is exactly unchanged: inherited landscape370/834,390/~97MiB
from9eb4ccfa; portrait≤289/702,028/~101 is de1bc21b+road-delta composition. No fresh
phone profiles are claimed; pre-existing phone quality3 excess remains separate#1453.
Raw logs/images: persistent `codex-surface-20261020/patio1448/`. Early diagnostic
rebuild wind phases/eight gates and capture-string errors were superseded by canonical
one-pass/one-union-gate proofs. Only Hus L's private decor uses this builder; A/B/C
are untouched. Current public main has no private terracedecor.js: no applicable port.

## Complete architectural terrace rail groups (#1454, partial #1448)

Hus L's existing6024 railing triangles now form11 complete source terrace/gable
batches on desktop, sharing the original material. Native camera and shadow
frustums use their tighter spheres; no main-camera gate, quality/distance rule,
geometry, opening, shadow or collision policy changes. Phones retain the original
single master-array merge, identical ordered buffers/bounds/material/state.
A/B/C use separate alpha-tested loggia panels in surroundings.js, unchanged.

Actual1280×800 standardmaximumquality3 on80c78366, including both new road sources,
measures504/1004561 →503/998537 at spawn(2.9,16), yaw0°, pitch−5°, normal eye1.62.
Fresh-shadow target/exposed-rail/corner/upward pairs change0pixels. All ordered
position/normal/UV data, union bounds, shared material/shadow/raycast behavior and
33positive physical rays match the canonical original batch. Existing terrace
layout/height checks pass; actual844×390 touch opens/closes the same glazed door.

The desktop perfcount now has20poses, adding “patio toward house”; phones keep19.
The full actual20/quality/texture run is **SOME FAILED**:504calls/1000585triangles/
~311MiB, with unchanged520/1M/320limits. All old19views and quality checks pass.
A legitimate existing bike-room→patio car-LOD hysteresis state contributes one
extra2048-triangle car-far batch; no hysteresis/car behavior is changed here.
The remaining585-triangle overrun stays tracked in child #1458 under #1448.
Inherited quality0 phone coverage is not a new measurement:1433 landscape
370/837612/~97MiB; portrait conservative composition≤289/705250/~101MiB.
Independent defaultquality3 phone failure#1453 is unaffected.

Initial desktop touch CSS/locator failures remain raw, not passes; the successful
first tap's prequeued filename says close although its recorded actual state is open.
Exposed-roof/corner cameras are rendering diagnostics, not walking-route claims.
Raw evidence: `~/.local/state/lunden-orkester/codex-surface-20261020/rails1454/`.
Current public exterior has the same neutral single rail batch; its selective
LOW-priority transfer will be linked after source publication, without private decor.

## Fixed L entrance pots on phones (#1455)

Only the rigid pot/soil color draws use six native batches; original leaves and
per-part Detail eligibility remain. Original meshes cast fresh shadows with their
exact masks/frusta; color proxies never cast or answer physical rays. Desktop is
unchanged. Startup quality3 matched411→398 calls with769976triangles unchanged;
near entrance487→487 /793864→794984, loft204→200 /598121→598653. Whole eligible
batches can submit offscreen triangles: there is no global thirteen-call guarantee.
All three fresh-shadow caster lists/counts/triangles and physical masks are exact.
Pixels differ0at startup,1(maxchannel1)near entrance and11(maxchannel4)on the loft;
small native-matrix raster rounding is retained rather than claimed pixel-exact.

The first candidate submitted six empty batches at the park (366old→372new calls).
Final source hides zero-count groups: the same diagnostic returns366/761793 exactly.
Native five cases and actual nine physical/walking checks pass; native start-touch
and the real front-door action button also work. Fresh production-main-installed
landscape explicitURLquality0 passes all19views/quality checks at367calls/840699tri/
~98MiB; a separate fresh390×844 explicitURLquality0 World also passes all19views/
quality checks at289calls/705267tri/~102MiB. Highestquality3 full19 remains
FAIL399calls/841837tri/~98MiB against unchanged
370/950000/225 limits; all quality checks pass. Parent#1453 waits for its other
independent children. These are submission/resource checks, not device frame times.
Persistent raw and rejected candidates are linked in [verification](verification.md).
Public main6c69323a has no corresponding entrance-plant group or DetailCuller; N/A.

## Complete source patio hedges (#1458)

Only Hus L's existing hedge submissions change: desktop merges each of the eight
complete source geometries separately; phones keep the original single merge.
Generation, all ordered position/normal/UV/color/hedgeLow attributes, shared shader
material/depth, shadow flags, union/world bounds, rays and collision data stay exact.
Native camera/shadow spheres reject unnecessary whole runs; no gate, car hysteresis,
quality, camera or regression order changes. A/B/C use distinct surroundings/loggia
planting; shared hedgeBody/entrance boxwood and their callers are unchanged.

Actual standardmaximumquality3 on e4914dcb plus this two-line change gives
cold503/998537→503/995905 and legitimate bike-room→patio504/1000585→504/997953.
Each saves2632triangles with0changed pixels/fresh shadows. Clearly exposed own
and neighbor hedge pairs also match exactly;24positive physical rays and all eight
canonical source variants match, and production Player KeyW stops at the original
hedge boundary z17.8182. Actual844×390 touch opens/closes the same glazed door.
The unchanged desktop20-view/quality/mess/texture profile is **ALL PASS** at
504calls/997953triangles/~311MiB against520/1M/320, with2047triangle margin.

Inherited phone quality0 coverage from e4914dcb is explicitly not remeasured:
landscape367calls/840699tri/~98MiB; portrait289/705267/~102MiB. Exact original
phone merge/bounds/material/state means zero delta. Defaultquality3 phone failures
remain separate#1453/#1457; no level3 phone pass is claimed. These full phone
profiles precede59b771cc; its independently reviewed phone-only guard reduces its
actual target398→391calls, with all40entrance pots outside phoneUnit membership.
No new combined-main full phone profile is claimed. Desktop code is unchanged by that rebase.

Another actual corner view is independent#1459: after final camera direction plus
one productionstep, original562/1165094→candidate568/1164718, both over budget
with0changed pixels (+6calls/−376tri). The earlier corner picture lacked that final
step and remains diagnostic only. No broader all-view budget claim is made.
Raw proof/images/profile: `~/.local/state/lunden-orkester/codex-surface-20261020/patio1458/`.
The current public hedge builder has the same complete-source array/single merge;
a selective neutral LOW-port will be cross-linked after source/live publication.


## Fixed entrance foliage batches (#1457)

Four phone-only foliage color groups reuse exact source geometry/materials and
per-part Detail eligibility. Ordinary meshes/depth shaders retain the original
world-origin phase; native color instances use their complete per-instance world
origin before local sway and rotation. Original meshes remain the physical and
shadow sources. New proxy spheres contain full transformed local sway without
changing source spheres. No desktop culling/geometry or quality policy changes.

Actual same-World maximumquality3 pairs on117851d7:

| Pose / wind time / power | Before calls / triangles | Current calls / triangles |
|---|---:|---:|
| Start /0.0167 /0 |391 /767728|380 /768904|
| Near entry /0.0167 /0 |515 /803946|515 /808038|
| Near entry /6.0167 /.0247902 |541 /842256|541 /846348|
| Loft /10.0167 /.0249925 |215 /654863|217 /659251|

Full eligible groups can add offscreen triangles/calls; startup−11 is not a global
promise. All four fresh-shadow caster UUID/count/triangle/mask comparisons are exact.
Actual instance-origin error and full proxy-envelope excess are0. Raster differences
are2/6/4/18 pixels (maxchannel14/5/1/7), retained honestly. Native9cases and actual10
source/ray/walking checks pass. The visible front-door action uses its real DOM click
handler in touch mode; this is not claimed as a trusted native tap.

Highestquality3 full19 remains FAIL399calls at kitchen (start382),841837tri/~98MiB,
with all quality checks passing; parent#1453 remains open. Limits370/950000/225 stay
unchanged. Fresh explicitURLquality0 landscape passes367/840699/~98MiB (start349);
a separate fresh390×844 quality0 profile also passes279/705447/~102MiB.
These submission/resource checks do not establish device frame time. Public6c69323a
has no entrance-plant builder, adapter, plantwind or DetailCuller: no port applies.

## First-focus program warm-up (#1508)

The Windows Intel UHD630 trace from #1506 showed 7 of 8 >250ms intervals waiting in
Three's first-use `getProgramInfoLog` path. Targeted draw instrumentation identified
all 18 late programs as `interaction-brightness` variants, including mirror output.
`InteractionOutline` already cached them after first focus (#558); the missing step
was compiling them before that first focus. Disabling shader error checks is not
used: that could just move the wait to another GL call.

`InteractionOutline.warmCompiler(renderer, scene)` discovers existing physical
interaction roots from their `userData.door` targets. It provides detached compile-only
views of eligible meshes, including hidden contents and explicit instance targets.
`WarmUp.compileObjects` visits each original first, then its extras, with the real
scene's lights/fog and current screen/mirror target. Deduplication uses the original's
exact just-compiled program key and mesh/instance mode, so shared source materials
with different geometry flags remain distinct while equivalent material families
reuse a representative. Extras join the existing readiness set and phone compile
budget; no extra scene children, draw passes, textures or geometry are introduced.
The original focus shaders, source-driven appearance, cache/disposal and fallback
for objects arriving after the relevant compile stage remain intact; late drawings
are covered below (#1514). Headless/test-mode skip avoids
building this warm-up discovery map when no warm-up runs.

### Late-arriving drawings (#1514)

Saved drawings are built when `Posters.load` reads IndexedDB. On the Intel UHD630
native-GPU route the read finished about 4 s after the screen compile started, while
WarmUp waited for those programs: the drawing missed the screen compile, got its
base program in the draw-everything pass and its mirror focus variant in the mirror
compile, but never its screen focus variant (first focus: 1 new program, a 313 ms frame).
`Posters.onBuilt` now calls `WarmUp.add(mesh)`. Once a compile stage has started,
`add` queues the late renderables; `lateSlice()` patches them with the lamp washes
(`prepare(root)`, giving their final key) and compiles them with `compileExtras` for
every target already started, within `WARM.programs`/`WARM.compileMs`. `tick()` runs it
during warm-up (phones: in a frame of its own, not together with a compile slice);
the game loop runs it after `warm.done`, so a drawing that arrives later is compiled
a frame after arrival rather than at first focus. Startup does not await IndexedDB,
no whole-scene compile is added and nothing is created in advance; the warm-up skip
in tests leaves the queue empty. A drawing removed before its turn is dropped.

Run `tools/focuswarmtest.html` and the existing `tools/focusperftest.html`. The new
fixture checks the very first focus for screen/mirror, hidden/double-sided/instance
objects, source identity/appearance/disposal and sliced compileObjects. See the
[dated validation record](../validation/issue-1508/README.md) for matched native-GPU measurements and remaining
strong-GPU uncertainty. The public project has neither WarmUp nor InteractionOutline;
its opening fronts use an already-built focus uniform, so this private focus-material
fix has no corresponding downstream code path.
