# Local road aggregate — #2072

Product source: `a6bc5b371e52e8bf4d8cba500bcd2790ab9a8858`, compared with baseline `0fd6db63`.
`source.json` binds the exact source and image SHA256 values. The fixture routes the two
changed baseline modules (`surroundings.js`, `config.js`) directly from that Git revision.

The existing local road's solid colour becomes a shared deterministic aggregate material.
Small seeded stone cores, shallow height and roughness use a fixed 1.6 m repeat in world
X/Z metres. The roughly 7 mm cells, 0.45 mm bump and 0.69–0.88 roughness are artistic guesses,
not surveyed aggregate, repairs or damage. Quiet broad ±3.5% tone modulation uses metric
fragment coordinates; trilinear mips and anisotropy 4 soften the grain at distance.

## Inspected result images

Both sheets show **before on the left, after on the right**:

- [Aggregate paired](aggregate-paired.png): near (25 cm camera height), walking (1.6 m),
  far (7 m). Small grain is readable nearby and becomes quiet at distance, with subdued
  broad tone rather than painted repair patches. No obvious repeat grid in these views.
- [Winter paired](winter-paired.png): exactly the same rendered PNG SHA256 before/after.
  The original snow colour, roughness and road boundary remain intact.

The browser uses the real `surroundingsParts` consumer up to its existing 0.15 yield, then
stops generation before distant bridges, backdrops and vegetation. `buildStreet().object`
adds the real street details. Identical cameras, one directional light plus hemisphere,
NeutralToneMapping, 1100×720 canvas, DPR1, MSAA and Chromium/SwiftShader are used in both
phases. This is controlled production-component evidence, not a complete World route,
physical-device test or frame-rate measurement. Still images cannot establish absence of
motion shimmer on every GPU; filtering and the subdued far view limit that risk.

## Checks and exact cost

1. `node --test tools/asphaltsurfacetest.mjs`: **3/3 pass**. Deterministic shared maps,
   registered metric UV phase, native vertex policy and actual snow/summer map restoration.
   The new material alone opts into removing its auxiliary maps in winter. Existing
   `registerSnow` still owns colour/map; broad tone is under `USE_MAP` and vanishes too.
2. `node tools/roadendstest.mjs`: **ALL PASS**. Existing terrain/road continuation contract,
   including 336 quarter-metre join samples with zero gaps. No road coordinates, height,
   marking, snow, collision or shared winter implementation was edited.
3. One matched browser run, **4 views per phase**, no page/shader/console errors.
   `browser.json` records exact road position/normal hashes and 4,777 triangles unchanged.
   Position/normal allocations remain 171,972 bytes each; UV allocation remains 114,648 bytes
   (values now metric). Per-view calls/triangles before and after:

   | View | Calls | Triangles |
   | --- | ---: | ---: |
   | Near | 17 | 140,283 |
   | Walking | 15 | 140,279 |
   | Far | 15 | 140,279 |
   | Winter | 15 | 140,279 |

   Two additional cached 512² RGBA textures: **2,097,152 base-level bytes**, **2,796,200 bytes
   with all 10 mip levels**. The packed map serves both bump and roughness. Winter clears
   all three material map bindings (cache retained), roughness returns to 0.7 and colour to
   `0xd9dfe4`; summer restores the exact shared objects. No added geometry, light, pass,
   per-frame update or upload. Colour/bump/roughness texture sampling and two fragment sine
   terms add work; unchanged draw counts do not imply unchanged GPU time. Wrapper peak: 719 MiB.

The first browser attempt exposed a fixture setup error: `buildStreet` returns a wrapper,
so its `.object` must be added. This was corrected before the green run; no product failure
was ignored. Only paired sheets are retained, with no raw before images in the repository.

## Reproduce

Serve the root on 8184 with the ignored `node_modules/three` exposing pinned Three r170:

```sh
node --test tools/asphaltsurfacetest.mjs
node tools/roadendstest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh \
  node tools/asphaltsurface2072browser.cjs http://localhost:8184 docs/verification/2072
```

Public transfer #294: neutral helper, road-material consumer and scoped checks only.
Conductor owns publication, revision-pinned image comment and issue closure.

## Integration

The named asphalt block and all other captured production/fixture source bytes match the
accepted worker source. The full config additionally retains the independently delivered
parquet and brick blocks; its captured hash is historical evidence. Integration preserves
every previous config/changelog line and adds only ASPHALT_SURFACE and changelog1602.
Three asphalt Node checks pass after this insertion; unchanged browser/roadends evidence is reused.

## Publication

Published code/images `f825773e60e33a7d8af2ba914336d61707ec0a5b`; Pages44263552008 and Worker44263552019 both success on that exact revision. Both image URLs HTTP200. Embedded result/checks comment before closure: https://github.com/solwation/lunden-3d-apartment/issues/2072#issuecomment-6972754558. Final receipt-only commit triggers no production deployment.
