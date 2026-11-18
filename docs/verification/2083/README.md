# #2083 — Hus L solar-cell and glass surface

Baseline `451e12ea1e82a220fc9934052c226cbfb6c1e71e`. Before substitutes only that revision's
`src/exterior.js`; the same production `buildExterior`, plan openings, dimensions, cameras and lights
are used in both phases. Final source hashes and raw geometry/material/view results are in
[browser.json](browser.json). All evidence is this issue's own capture.

## Result, scope and assumptions

`solarsurface.js` supplies cached256²sRGB colour and128²linear roughness atlases. The existing blue
`COLORS.solar=0x1d2735` and metalness0.5 remain. Colour multipliers add dark cell gaps and very thin
busbars; roughness varies quietly around0.33 on the glass. No new reflective environment, normal
map, displacement or transparent layer is added. Detail remains subtle against the original dark
blue and fades through ordinary mip filtering at the full-roof distance.

`SOLAR_SURFACE` is an artistic **guess**, not a verified manufacturer/module specification:
nominal1.68m repeat,10×6cells,6mm gaps,3mm buses, three buses per cell,15mm frame.
Each authored long strip fits a rounded whole number of repeats, so these are approximate visual
scales rather than measured module/cell dimensions. Existing actual strip widths/locations are kept.
UV assignment runs on the original box before hinge translation/10°rotation; only its+Yface gets
the patterned atlas. Every other face samples one reserved flat point. Its colour multiplier is
exactlywhite and Float32 roughness exactly0.3; fully covered top-frame pixels use the same white/
roughness values. Native tests distinguish the module frame from the darker internal cell gaps.
The solid frame/side silhouette is the existing box; the new pattern does not add physical joints.

Inventory: Hus L's3x-ranges×4z-ranges yield12tilted strip boxes. A/B/C use roofSpec's felt hip roofs,
roof boxes and vent hoods without this solar consumer. Nordic Wellness has separate low blue boxes
in its shared glass batch; eight villa roofs use dark vertex-colour quads in their roof batch.
Those have different models/material consumers and retain their existing source bytes; the new
atlas is not applied to them. No Peab/vendor panel-model or physical finish verification is claimed.
Neutral public transfer is separately registered as `solwation/kvarteret-lunden#304`.

## Three check groups

1. `node --test tools/solarsurfacetest.mjs` — **3/3pass**. Deterministic pixel masks, cell/gap/bus
   contrast and flat swatch, cache/colour-space/filtering, top-only UV selection; every one of
   the12real tilted boxes retains12triangles and exact position/normal/index bytes.
2. Syntax checks on helper/exterior plus exact source reconstruction: exterior differs only in its
   helper import, pre-tilt UV call and existing panel material call. All config bytes outside the
   named block are equal. `corehouse.js`, `surroundings.js`, `nordicgym.js`, `southbackdrop.js`,
   `roofs.js` are byte unchanged. No original npm build is required or run.
3. One scoped actual production `buildExterior` browser comparison, Chromium/SwiftShader, native
   1200×800views. All emitted meshes' position/normal/index/non-panelUV hashes, shadow flags,
   roof-walk27surfaces/walls and collision segments compare equal before/after. The only changed
   attribute is the existing panel UV. Both images were opened and inspected. The initial roof
   camera clipped the western end; only that camera was recentered, without product/light/near
   changes. No older/broader browser suite or full-app roof traversal was rerun.

```sh
python3 -m http.server 8212
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh \
  node tools/solarsurface2083browser.cjs http://localhost:8212 docs/verification/2083
```

The wrapper's final peak was572MiB under4GiB. Own server/browser stopped; lock released.
Zero external requests, JavaScript/shader errors. This is a bounded exterior component test,
not a mobile/FPS/full-world navigation claim. The unchanged roof-walk metadata/source preserves
existing stepping support; this issue does not newly test Player roof gameplay.

## Exact cost

| Resource | Before | After | Difference |
| --- | ---: | ---: | ---: |
| Panel merged mesh / boxes |1 /12|1 /12|0|
| Panel triangles |144|144|0|
| Panel position bytes |5184|5184|0|
| Panel normal bytes |5184|5184|0|
| Panel UV bytes |3456|3456|0; contents replaced|
| Panel total geometry bytes |13824|13824|0|
| Whole fixture meshes / triangles |141 /132827|141 /132827|0|
| Whole geometry attribute/index bytes |15542788|15542788|0|
| Near calls / drawn triangles |13 /32717|13 /32717|0|
| Full roof calls / drawn triangles |135 /126087|135 /126087|0|
| Near / roof uploaded textures |5 /7|7 /9|+2each|
| Near / roof shader programs |12 /15|13 /16|+1standard variant|

New cached RGBA8colour256²:262144CPU/basebytes,349524nominal GPUbytes with the full mip chain.
New cached RGBA8roughness128²:65536CPU/basebytes,87380nominal GPUbytes with mipmaps.
Total327680CPU/basebytes and436904nominal GPUbytes including mipmaps, driver/program overhead
excluded. Existing UV allocation is reused; no extra UV/normal/position attribute. No new draw,
light, pass or per-frame texture/geometry upload. Shader map sampling adds fragment work; no FPS
improvement is claimed. Texture versions stay1after both rendered views.

## Evidence

Both2400×838paired sheets preserve each panel's native1200×800pixels/aspect, with38px labels.
Only paired sheets are retained, no raw before-images.

- [Near panels](near.jpg): readable cell separations and subdued fine busbars; original dark-blue palette.
- [Complete roof](roof.jpg): original twelve field strips, placement/tilt/lift and house silhouette retained;
  detail stays intentionally very faint at this distance.

## Source binding

| Tested source | SHA256 |
| --- | --- |
| `src/exterior.js` | `2f30685b40ca94c3bce43f0d40b202ae7fd7678bcb3806968c2de22770ab713c` |
| `src/solarsurface.js` | `8de38cd89bb0ba047628be7c40add1415f02879bc8234d7ccb7f885efaeb66c1` |
| `src/config.js` | `e41d512a75e7ad13e7fecf4043fc6dea30c0c1e01675dfcd15b5e585b9e164e5` |
| `data/plan.json` | `5b0b4a73b71dde6c3d2e00ed8de92c512ee01a8402eaa67a788d3eb4ce620de9` |
| `src/corehouse.js` | `a4f4630382b66b3fb09ce0163dde67bd2d0230a7e51ad9b3e9a35b0bd0c02a01` |
| `src/surroundings.js` | `8ec578f95641be1c2fff2c3c5509935e147f4345d75063ab819a114549baacdd` |
| `src/nordicgym.js` | `51834f7e17a5ca9355b12af98760d715d0e931a68178a407a0d65b1e6eb9c6ef` |
| `src/southbackdrop.js` | `5e177d647b9229afd17ffeb2cfd279d191c2994fdb4a7ccc533c7f80c785c891` |
| `tools/solarsurfacetest.mjs` | `fbfd07156d1a50bbb01f069872e9d39726811460f4a96d4244cbd04563f4762d` |
| `tools/solarsurface2083.html` | `94ab3d2ed8f10695d46c06b9511f35edbb155d2deccc7a284c4292558a39d1a9` |
| `tools/solarsurface2083browser.cjs` | `73012e9029f4ab0043630aaa3a399eae7c8d0b4b2fa8fbddf2f393dade5c3837` |

Documentation and the Swedish changelog may be integrated independently; unrelated config additions
or changelog renumbering do not change the tested helper/UV/material recipe and declared controls.

## Integration review

Root opened both final paired sheets and reviewed the helper/UV/material changes plus green scoped checks. Exterior/helper/fixtures/tests exactly match tested78eeccd5. Config adds only SOLAR_SURFACE to accepted main; previous bark block and every other prior byte are retained. All old changelog rows remain exact; this row is renumbered1612=max+1 without product changes. Source-bound green evidence reused, no duplicate browser or broad gate.

## Publicering

Kod/bilder `4c82da2a0cdd5fe2392a3c5eb8c3da6237952e38`; faktiska run-ID [44281441330, 44281441321] success på exakt revision. Alla bilder HTTP200 och inbäddade före stängning: https://github.com/solwation/lunden-3d-apartment/issues/2083#issuecomment-6975263267. Slutkvittot är enbart dokumentation; originalets sökvägsfilter utlöser ingen ny apppublicering.
