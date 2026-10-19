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

This is a verified partial delivery (`Refs #1359`). #1359 remains open for physical
iPhone acceptance and the remaining memory/performance investigation. A user must test
the published candidate before any claim that their reported crashes are resolved.
