# Phone memory reduction candidate (#1359)

Baseline: `8cd67885d4e29015d82759a586843a67e87fe970`, 2026-10-19.
Candidate changes only static canvas CPU retention, shared static A/B/C/L door atlases
and an unused phone mirror target. No geometry, shadows, draw budget or dynamic displays
are changed. Public applicability is tracked separately in kvarteret-lunden#93.

Actual production telemetry was read privately through authenticated read-only Wrangler.
Recent iPhone reports include repeated context losses on quality0, texture cap512,
pixel ratio0.75, outside the starting house and in the kitchen after roughly17–37s.
There is no established single crash cause or measured device memory threshold.
The legacy `gpuMB` field estimates source images and is explicitly incomplete.
Raw reports and identifying session data are not committed.

## Matched browser measurement

Chromium1248 / SwiftShader, iPhone UA/touch,844×390,DPR3,quality0,max texture512,
pixel ratio0.75,shadow1024. These are simulated profile measurements on this host,
not physical iPhone Safari or frame-rate results. Same command for both variants:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node tools/phonememtest.cjs http://localhost:8879 \
  --cpu 1 --profile iphone --route start,hall,kitchen --dwell 600 \
  --query 'quality=0&month=7&weather=clear&cloud=' --out /private/results --shots \
  --chrome /path/to/chrome
```

| Quantity (MiB) | Before | After |
| --- | ---: | ---: |
| Peak GPU allocation estimate | 220.4 | 205.4 |
| Steady textures | 94.1 | 92.1 |
| Steady renderbuffers | 17.0 | 4.0 |
| GPU geometry buffers | 102.9 | 102.9 |
| CPU canvas immediately after load | 198.5 | 105.2 |
| CPU canvas after warm-up | 118.9 | 87.8 |
| Peak JS heap (GC-dependent) | 571.6 | 551.3 |

The probe's aggregate peak estimate is990→862MiB; both exceed its guessed600MiB budget.
Do not treat CLI0 as absolute memory-budget acceptance. GPU route growth is0.2MiB in
both and shader program creation287 in both. The actual full-world route's geometry
and aggregate renderer calls/triangles match. The6 before/after route images were
opened: courtyard exterior, hall wall close-up and kitchen retain their appearance.
Both local runs have the same expected missing build-generated `/data/todo.json`404;
they show no JS exceptions. Full private probe logs/JSON/images remain outside the repo.

## Correctness and remaining failure

- `tools/staticcanvascheck.cjs`:8/8PASS, actual CLI0. Real synthetic static texture pixels
  match automatic512px resizing exactly (maximum and mean pixel difference0), repeated
  draws remain stable, phone CPU source is512×256 before upload and1×1 after; desktop
  stays2048×1024. Actual A/B/C/L atlas sources are all found and within the existing cap.
  Both component screenshots were opened.
- `tools/glrestoretest.cjs`:23/23PASS, actual CLI0. Real app context loss/restoration
  reloads once at the same pose; restored curtain pixels differ by0.00 on average.
  A second loss hits the existing manual-reload guard. The explicit control suppressing
  reload shows the expected blank texture; all four pixel images were opened.
- `tools/perfcount.html?lowmem&w=844&h=390&quality=0`: **FAIL**, CLI1, both variants.
  Identical screen counts: park485 (budget370), max886178triangles (budget950000),
  textures about96MiB (budget225). Quality/adaptive checks pass. Baseline source was
  explicitly supplied for lowmemory/core/main in the comparison. Existing independent
  landscape failure is tracked in #1361; no budget has been raised.

At this delivery, #1359 remained open for physical iPhone acceptance and further
memory/performance investigation. The later user acceptance is recorded below.

## Follow-up, 2026-10-20: immutable wall-text source

The user's physical iPhone test was mixed: one crash, then a successful attempt. Fresh
read-only production KV evidence contains two new iPhone **layout** events on `2bdc822`,
with keyboard editing, displaced viewport measurements and `gl: ok`. They are not new
context-loss or abrupt-ending reports. The latest recorded iPhone loss/abrupt-ending
events still predate the 2026-10-19 memory delivery. Missing matching crash telemetry
does not contradict the user's crash or establish its cause. No reports, session ids,
credentials or raw private data are committed.

Frozen baseline: `579336bde97ab815d75a91a81465d1228d558764`. In the actual World,
the largest remaining individual canvas maker is the immutable `buildCheatNote` wall
texture: 1536×1024, 6 MiB, retained while its basement group is hidden. Its maker paints
once after the bundled font loads; no later redraw, `needsUpdate`, clone or source
read exists. The change only opts this texture into `freeCanvasAfterUpload`.
Before first upload it now retains 512×341 (0.666 MiB), saving **5.333984 MiB**;
first upload shrinks it to 1×1 under the existing guarded context-reload policy.
Geometry, UVs, catalogue text, read target and desktop source remain unchanged.

Matched full-World probes use Chromium1248/SwiftShader, actual phone UA/touch,
844×390/DPR3/quality0, the normal startup warm-up, no test rendering mode or production
cloud, October20 at noon with clear weather. The route visits start/kitchen/patio,
then three portrait/landscape cycles and two genuine page reloads.
The original `phonememtest` also completed two start/kitchen/patio circuits before
the change. It found 0.5 MiB of late first-use geometry allocation, with no repeated
route growth in texture/program counts. This is not physical iPhone evidence.

After the first warm-up, all tracked CPU canvases are 90.272→84.188 MiB. Only
5.333984 MiB is attributable to the wall texture: the other 0.75 MiB is exactly two
fewer randomly initialized 512×192 cup-pattern canvases (10→8 in the size inventory).
GPU texture allocation estimates stay 91.947 MiB, renderbuffers 4.000 MiB, geometry
buffers about104.52 MiB, active textures208 and active programs290. JS heap/whole-browser
RSS vary with GC and SwiftShader and are not used as savings or iPhone-memory claims.

The probe retains WebGL handles in accounting maps; it is not evidence of a product
leak across context loss. These allocation comparisons contain **no context loss**;
each genuine document reload starts fresh accounting. Orientation and reload evidence
must be read with this limit, separately from the real context-loss test.

The viewport/reload probe establishes allocation stability, not a newly rendered frame
in every orientation: some `renderer.info` samples retain the preceding frame. Its
last-render kitchen count is376 in both variants, above the370 configured ceiling;
this is not a passing full-budget result or the per-screen accounting of `perfcount`.
No budget acceptance is inferred from it. All three document loads in each probe also
report the same missing local build-generated `/data/todo.json`404/console message;
there are no browser JavaScript exceptions.

The actual maker component compares the frozen pre-change module and current module,
using the existing512px phone upload cap. It checks source size, release, exact GPU
pixels/repeated draws, unchanged geometry/UVs, catalogue and read callback, and GL/JS
errors. The phone output has maximum/mean/repeat pixel difference0. Desktop retains
1536×1024. Component images are opened for legibility review. Raw drivers, JSON,
screenshots and source hashes are private under the session's `iphone1359` artifacts.

The added immediate read assertion at the end of `repeat-after` failed after its memory
checkpoints were complete (actualCLI1); those counters remain observations, not a green
test. A separate first read fixture then timed out because it tried only the phone's
hidden `start-touch` button and missed `start-go`. Both original failures are retained.
The corrected bounded read fixture selects the actual start button, requires touch
activation and waits for the real ray focus. It passes with native taps on the normal
action/close buttons, exact full text, reachable position and the uploaded1×1 source;
actualCLI0, no page exceptions. Its opened World wall/read-panel images are separate
from performance evidence. This interaction run explicitly skips startup warm-up.

Final maker component:12/12PASS, actualCLI0, with the phone's512px cap and desktop's
native8192px capability; before/after pixels remain exactly equal in each profile.
The real context-loss driver adapted to select this wall texture passes23/23,
actualCLI0: one automatic reload at the same pose, rebuilt512×341source, mean RGB
pixel difference0.00, and the second-loss manual-reload guard. Its explicit suppressed-
reload control becomes uniformly blank (one channel value, mean difference4.17).
The control checks uniform blankness rather than the curtain fixture's larger
content-specific mean threshold; the actual wall print initially has57 channel values.
All four64×64 probe images were opened. Production networking is explicitly disabled.

The final integration rebases onto `f3fb127a`, the independent ceiling-decoration gate.
The wall-text module, main controller, low-memory helper and warm-up module remain
byte-identical to the measured candidate. Original full-World memory figures retain
their579336bd baseline; they are not a new performance claim for the incoming scene
change. Initial production crash-KV reading succeeded; a later refresh returned an
authentication error, so it is not presented as another complete fresh read.

This remains `Refs #1359`, not an established crash fix. No render budget is raised;
the change adds no geometry or rendering pass. There is no downstream transfer because
this particular wall text is gameplay excluded from the public project.

## Physical user acceptance, 2026-10-20

The user reported that no crash occurred when testing the latest version and explicitly
clarified that the report concerned #1359 (initially mistyped as #1357). #1359 was then
closed and its `user-question` label removed. The prior mixed result above remains part
of the history. The user did not specify the exact tested commit or test duration.

This is physical-device acceptance from the user, separate from the emulated browser
measurements. It does not establish a single crash cause or guarantee that future
crashes cannot occur. No performance budget or historical measurement is changed.
