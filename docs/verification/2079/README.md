# #2079 — Southern bridge approach

Baseline: `dd0bf970d75d3806080792e34880938046243ac2`. The before phase substitutes only
that revision's `src/southbank.js`; every other consumer, camera, light and render setting is shared.
The original report is [619e9f82](../../ingame-reports/619e9f82-bf82-45f9-a8dc-bedc3843effe.jpg)
(SHA256 `cc47eafa9e3e09b9828ed0c0631d1b3fdbea38ee2106f9096f0b45435b86f9b6`).

## Result and assumptions

The old explicit guess joined deck−3 to LM ground−0.34 over z147..152. The corrected local target
uses a Hermite grade over z147..203.9, ending at the original crest0.54 with its outgoing tangent.
Its central8m half-width covers road, GC and their walking margins; a smooth lateral fade stops
at18m. Original crossfall returns gradually. The start/end, widths and graded road surface are
**guesses**, not a measured real-world height profile. LM ground points retain their original
approximately3–5m horizontal registration and do not measure bridge/road elevation.

At road centre z152, height changes−0.34→−2.9277; z160−0.30→−2.5581; z180−0.02→−0.9074;
z204 remains0.5412. Maximum sampled longitudinal road/GC grade at offsets−6/0/+6 is0.093256
(2cm samples), versus the former roughly0.6 peak. The road still rises toward the existing plateau;
the specific reported short wall is removed while its southern height reference remains fixed.

Both bridge decks, slabs, rails, piers, underpass clearance, river water/bottom/fall/swimming and
building-pad levels remain unchanged. The11road/50cross-section raw LM controls are byte unchanged.
Analytic ground is exact outside the local corridor; existing rendered terrain-edge interpolation
has an adjacent-cell halo. The browser checks unchanged terrain position bytes beyond z143..208
or24m from the centreline. All existing building pads compare equal before/after. A/B/C/L are north
of the correction; no equivalent house geometry needs changing.

## Three check groups

1. `node --test tools/southbridge2079test.mjs tools/southbanktest.mjs tools/bridgefall1849test.mjs tools/riverfalltest.mjs`
   — **18/18 pass**. Finite/local profiles, no join height step or tangent jump, bounded unchanged
   far banks, preserved source/plateau/building controls, deck/underpass/water and sibling timber bridge.
   Actual `Player` crosses road/GC southern approaches both ways at walk and sprint,50ms updates.
   Earlier bank assertions that required a3m high crest inside the corrected approach are superseded
   by the new gentle-grade assertion and exact unchanged far-bank comparison.
2. Actual production-builder geometry/query comparison in the browser below: same terrain81486
   vertices/index/XZ, same bridge concrete/steel/water position buffers, piers/deck queries and pad
   records; same horizontal road/bridge extents. Existing adaptive `pathStrip` subdivision changes
   triangulation as slopes flatten; it is not required to retain obsolete intermediate vertices.
3. One scoped production `buildSurroundings` browser fixture, Chromium/SwiftShader,1120×800 native
   views and2240×835 paired sheets. The original rendering module builds the complete surroundings;
   no hand-built substitute road, hidden tree cull, app bootstrap, personal storage or remote service.
   Same cameras and lighting before/after. All three sheets were opened and inspected.

```sh
python3 -m http.server 8205
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright BROWSERTEST_TIMEOUT=5m \
  tools/browsertest.sh node tools/southbridge2079browser.cjs http://localhost:8205 docs/verification/2079
```

The local server was stopped after capture. Zero external requests, JavaScript/shader errors and
session-storage entries. A fresh disposable browser context creates the existing default-only
`lunden.playerId` / `lunden.players.v1` keys while constructing the production boards; no user browser
profile is opened. Initial harness assertions incorrectly assumed zero builder storage and exact
adaptive road topology; they were corrected to the invariants above before the successful run.
These are scoped fixture checks, not FPS, physical-device stability or a rerun of the full app suite.

## Exact component cost

| Whole surroundings fixture | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Unique geometries |118|118|0|
| Unique-geometry triangles (including retained hidden terrain)|593978|593540|−438|
| Geometry attribute/index bytes|46241240|46199168|−42072|
| Report view calls / drawn triangles|43 /473813|43 /473375|0 /−438|
| Side view calls / drawn triangles|47 /502785|47 /502347|0 /−438|
| Transition calls / drawn triangles|41 /466405|41 /465967|0 /−438|
| Rendered textures in each view|10|10|0|

The existing adaptive surface reductions are site-asphalt−36, pavement−186, bridge approaches−116,
park-path asphalt−98, south-land−2triangles. No new draw batch, material, texture, light, pass or
per-frame geometry upload. This is the fixture's component budget, not the global full-app budget.
Browser peak758MiB under the4GiB wrapper limit. Detailed values/cameras/check hashes are in
[browser.json](browser.json).

## Evidence

Each panel keeps its native1120:800 aspect; no cropping or rescaling. Only paired sheets are retained.

- [Report-like southbound view from GC bridge](report.jpg): clear comparison of the former wall and graded connection.
- [Side view](side.jpg): unchanged bridge and extended local tie-in, existing plateau/buildings retained.
- [Near transition](transition.jpg): shared road/walking transition, no abrupt five-metre wall.

## Source binding and downstream

These SHA256 values bind the tested product/helper/fixture source bytes; documentation and the
Swedish changelog may be integrated independently. The base and geometric controls above remain
applicable if unrelated config additions or changelog renumbering occur.

| Source | SHA256 |
| --- | --- |
| `src/southbank.js` | `784b92d13a248359abc391889e411d431b7b9e41a4ce31b5e10c053cc063ddae` |
| `src/config.js` | `8048b3ebb8694b5c0d79f6bc608cb30cfc999ad417146f6765606b9003967a41` |
| `src/surroundings.js` | `118933bf24a89b9802e142a2261b779d023b2360062b4487feaa6e57a667ad51` |
| `src/riverbridge.js` | `c1b4ed0224449182fe1965783cec7d228f9f55ddc6c7b1854e0f8a95153ef3a8` |
| `src/roads.js` | `fdf667ec499503f29760da2fa03a4fb25eb73c3a9914889936f82901847e2543` |
| `tools/southbridge2079.html` | `45f94f8c0536621c211389d778fbbc5e27fae5590c8e4113296562323fd97f89` |
| `tools/southbridge2079browser.cjs` | `d395af23ef3fe46784f34852bfc8d83feaee4b766eb6c3c9d47ab42613fb44d0` |
| `tools/southbridge2079test.mjs` | `9fef8e2165b2998d4c8d4c6f1e52c9e8b956ae180bff841afd48ce43bbff39e6` |

Neutral public applicability is tracked separately in `solwation/kvarteret-lunden#301`.
Port only this grading recipe/config with its public-specific existing ground/deck/water data;
do not import original gameplay, swimming parameters, personal assets or integrations.

## Integration review

Root opened report/side final pairs and reviewed the worker’s inspected third transition pair and18green checks. Product southbank and fixture/test bytes exactly equal4f7365b8. Config adds only SOUTH_BRIDGE_APPROACH and its historical comment to accepted main; all prior bytes and changelog rows retained. Independent #2078 pavement nearz19–58 and #2077 street corner remain; the corrected corridor beginsz147, so source-bound results are reused without a duplicate full-world browser. Component totals above refer to the tested fixture baseline, not a global budget after those unrelated additions.
