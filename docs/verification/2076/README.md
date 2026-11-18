# Subtle concrete grain on the two river bridges — #2076

Baseline `6e1576aa` (original main before this issue). Candidate source SHA-256 values
are in `browser.json`, including the real builder, scalar helper, configuration,
production terrain/road inputs and the complete fixture/capture script. Only
`src/riverbridge.js` is routed to the pinned baseline for the before phase. All
configuration, approach inputs, cameras, lights and quality settings stay identical;
the new configuration block is unused by the baseline.

## Result and scope

The existing `bridges-concrete` material now has low pores/grain and a narrow
variation in mattness. Its albedo is still white multiplied by the exact existing
vertex colours. One cached 128×128 linear RGBA texture supplies height in R and a
roughness multiplier in G; there is no colour map. Values in `BRIDGE_CONCRETE` are
artistic surface assumptions, not measurements of the actual bridge. No cracks,
new joints, stains, geometry displacement, lights, shadow passes or gameplay change.

Both **road and GC** variants are inventoried: their slabs/edges and abutments use
the metric surface; the road bridge's six piers and footings also use it. The two
granite kerb boxes share this material batch, so their UVs instead point to the
reserved flat swatch (height128, roughness255). Constant UVs give zero bump
variation, and 255 × the retained material roughness0.95 leaves granite roughness
unchanged. Their original granite vertex colour stays exact. A/B/C/L buildings do
not consume this bridge-only helper and are outside the scope.

## Inspected images and practical visibility

All three final paired sheets were opened: **before left, after right**.

- [Pillar](pillar.jpg): a macro view of an actual lit road-bridge pier corner, about
  42 cm from the target. This is the relevant concrete surface, not a sample plane.
- [Walking](walking.jpg): the existing east walking lane, railings and deck edge.
- [Full](full.jpg): both bridges, abutments and the road piers, with the water batch.

Each half is the complete native1120×800 capture at DPR1, placed without scaling in
an aspect-correct2240×835 sheet (35px label band). No raw before images are retained.
MSAA, NeutralToneMapping and the same hemisphere/directional fixture lights are used.
The effect is deliberately **very subtle** in this lighting: the macro view permits
assessment of the low surface response; walking/full views mainly establish retained
architecture. No large visual contrast or distant-detail improvement is claimed.

The first near view faced the unlit pier side. The own scoped check was refreshed
with a lit face and then native-sized macro framing so the small material response
could be assessed without changing the recipe. These were concrete camera/evidence
corrections; no broad older browser suite was rerun.

## Three check groups

1. New `tools/bridgeconcrete2076test.mjs`: deterministic finite scalar data, bounded
   pores/roughness, linear shared texture/cache, exact flat swatch, metric per-face
   UVs, unchanged positions/normals/index, both bridge clearances and exactly72
   masked granite vertices (two36-vertex boxes). Pores/UVs are applied before each
   existing bridge rotation, using local metres and0.32m repeats.
2. Existing `tools/riverfalltest.mjs` and `tools/bridgefall1849test.mjs`: graded water,
   terrain/underpass and bridge/timber-ramp support contracts. **12/12** combined
   cases pass; log in `node-tests.txt`. The historical full concrete snapshot includes
   UV bytes and therefore gets one intentional UV fingerprint update. Independent
   browser hashes below establish that geometry and colour did not move.
3. Own `tools/bridgeconcrete2076browser.cjs`: actual `buildRiverBridges`, supplied
   the same `max(groundY, renderedTerrainY)` approach-ground formula as the production
   surroundings builder. Before/after hashes match for every position, normal and
   colour attribute, indices, attribute counts and shadow flag across all four
   batches. Only concrete UV values differ. Records, all six pier collision boxes,
   deck/underside/water queries and draw/triangle counts match. Texture version stays
   at1 across rendering; no per-frame texture upload. Zero page/console/shader errors.

These bridge materials have no seasonal registration in the baseline; that policy
stays untouched. No unrelated seasonal module changes or snow logic are introduced.

## Exact geometry and resource budget

| Retained batch | Triangles before = after | Raw geometry bytes before = after |
| --- | --- | --- |
| Concrete | 288 | 38,016 |
| Steel | 7,224 | 953,568 |
| Asphalt + approaches | 204 | 19,584 |
| Water ribbon | 1,122 | 107,712 |
| Total | **8,838** | **1,118,880** |

The same position/normal/UV/colour attributes remain; there is no new geometry
attribute, buffer or instance. One shared RGBA8 scalar texture adds **65,536 retained
CPU bytes** and **87,380 nominal GPU bytes** for the complete128→1 mip chain,
excluding driver overhead. It serves both bump and roughness. Renderer textures
rise **0→1**; all three views remain **4→4 calls** and **8,838→8,838 submitted
triangles**. Texture/cache generation happens once; no update loop is added.
Standard bump/roughness sampling adds fragment work. This is a bounded material
cost, not a speed or native-memory reduction; no FPS claim or hardware timing test.

## Limits and public transfer

The fixture draws the real complete bridge group and real approach-ground callbacks,
but excludes the surrounding terrain, banks, buildings, navigation route, swimming
and weather. It is component evidence, not a new whole-game or physical-device test.
The simple fixture lighting limits how strongly the subtle material appears.

Neutral transfer is applicable and tracked in
[kvarteret-lunden#298](https://github.com/solwation/kvarteret-lunden/issues/298).
That port must preserve the public builder's own bed/pier geometry and content
boundaries; original swimming/deeper pool changes do not belong to this surface port.

## Reproduction

```sh
python3 -m http.server 8194
node --test tools/bridgeconcrete2076test.mjs tools/riverfalltest.mjs tools/bridgefall1849test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=5m \
  tools/browsertest.sh node tools/bridgeconcrete2076browser.cjs \
  http://localhost:8194 docs/verification/2076
```

The fixture loads the pinned local Three.js0.170.0 installation. The conductor owns
integration, SHA-pinned image publication/comment, CI, public transfer and closure.

## Integration provenance

Root retained the exact tested bridge helper, builder and snapshot-test bytes from7d15aa19. The accepted shared config additionally contains the independent screen-wall block; removing only the named BRIDGE_CONCRETE addition reproduces the complete preceding accepted config. All previous changelog rows are retained plus1606. Source-bound browser evidence is reused; no unrelated full-world rerun.

## Publicering

Kod/bilder `bcbfbf27db9bd5785c36ec9845c915103f8ef5b9`; faktiska run-ID [44271941627, 44271941357] success på exakt revision. Alla bilder HTTP200 och inbäddade före stängning: https://github.com/solwation/lunden-3d-apartment/issues/2076#issuecomment-6973902454. Slutkvittot är enbart dokumentation; originalets sökvägsfilter utlöser ingen ny apppublicering.
