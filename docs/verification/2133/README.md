# #2133 Streaky leaf cards up close: verification

## Diagnosis

The streaks were in still air too (`&wind=0` in every view here). `before/park-filtering-diagnosis.jpg` shows the #2101 park
view three times on the base revision: as shipped (anisotropy 2, trilinear mipmaps), with anisotropy 16 and with mipmaps off.
The long sweeping streaks are the same in all three, so texture filtering is not the cause. The cause is the cards' geometry:
a leaf card seen almost edge-on squeezes its leaves into thin lines along the card, and with the crown sizes of #2131 a single
card spans a metre or more. Alpha-to-coverage would only soften the edges of those lines (and the game has no MSAA target in
every profile), and turning the cards would only move the edge-on views elsewhere.

## Fix

`src/foliage.js` `makeLeafMaterial` adds a fragment step before alphaTest (`LEAF_GRAZE_GLSL`). It takes the card's own plane
normal from the screen derivatives of the view position, because the vertex normals are radial. Alpha is multiplied by
`smoothstep(FOLIAGE.graze.cos)` of |cos| between that normal and the view ray, so alphaTest drops cards below about 0.2.
This applies only within `FOLIAGE.graze.near` (18–30 m) and never to the opaque core (atlas cell 3).

## Checks

1. `node --test tools/leafgrazetest.mjs`: 4/4 pass. The patch appears once, before alphaTest, in the shared, LOD near/far and
   wind leaf materials and in none of their shadow depth materials. The program keys stay distinct. The shared material keeps
   a native vertex compile, and the atlas filtering, alphaTest and sides are unchanged. The fade ends at or before the phone LOD
   start. From 4 m around a tree lobe about 19 % of the card triangles are cut, and the core is never faded. These also pass:
   `treeformtest`, `lodtest`, `sitewindtest`, `leafrgbtest`, `barksurfacetest`, `entrancefoliagetest`, `entranceplantbatchtest`,
   `phonedetailunittest`, `tightfrustumtest`, `siteinstancebatchtest`, `lampwash2090test` and `seasoncrowntest` (75 total).
2. Browser (`tools/leafgraze2133browser.cjs`, SwiftShader, 1280 × 800, June 13:00, clear, no wind). The base phase serves
   the base revision's `foliage.js`/`config.js`. It covers the #2101 park view and the bridge-side park tree from underneath at
   three azimuths. There are no page errors or shader errors in either phase. The only console errors are the blocked CDN/404
   network requests.

| View | Calls before → after | Triangles before → after | Programs before → after |
|---|---|---|---|
| park | 48 → 48 | 381,616 → 381,616 | 44 → 45 |
| under-south | 58 → 58 | 380,783 → 380,783 | 55 → 56 |
| under-west | 43 → 42 | 375,308 → 375,208 | 57 → 57 |
| under-north | 49 → 49 | 375,681 → 375,681 | 57 → 57 |

Both phases end with the same program count (57). The ±1 earlier on follows compile order. The one-call difference in
under-west is LOD repacking along the camera path, not a new draw. There are no new textures, meshes, uniforms or per-frame work.
On the GPU each leaf fragment does two derivatives, a cross product and two smoothsteps. Shadows use the unchanged depth
materials.

## Images

- `park.jpg` / `before/park.jpg`: the #2101 park view. The sweeping arcs in the near crowns are gone, and the crowns keep their outline.
- `under-south.jpg`, `under-west.jpg`, `under-north.jpg` (and `before/`): looking up into the crown from 3–4.5 m at three
  azimuths. The smeared bands are gone, and the leaves read as leaves.
- `before/park-filtering-diagnosis.jpg`: base revision as shipped / anisotropy 16 / no mipmaps.

## Limits

Cards seen at moderately oblique angles (|cos| above about 0.3) still look somewhat elongated. That is the cards'
foreshortening, kept on purpose so the crowns do not thin. Far crowns (beyond 30 m), the far LOD and the south woodland are unchanged.
The courtyard plantings and wall vines share the material and get the same fade up close. They were not photographed here. Not measured on a real
phone. The phone profile gets the same fragment step.
