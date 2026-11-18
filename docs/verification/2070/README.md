# Shallow ceramic grout — #2070

Product source: `d37b0be271ed7cb4dddd89167b524eaba4660b37`, compared with baseline
`8111f1e3`. Exact source SHA256 values and the fixture provenance are in `source.json`.

`src/tilesurface.js` extracts the original seeded colour generator, preserving tile sizes,
3 mm joints, palettes, mottling and half bond. Its one colour-boundary correction wraps the
missing half of a vertical joint onto the opposite repeat edge; this makes the repeated
joint retain its intended width and register with the structural surface. The generator is
therefore deliberately **not byte-identical** to the old one at that boundary.

One additional packed linear RGBA texture per ceramic material stores structural height
in R and absolute roughness in G, shared by `bumpMap` and `roughnessMap`. Height depends
only on joint/bond layout, never random colour variation or granite speckles. Top-down
CanvasTexture and bottom-up DataTexture samples are aligned, including half-bond rows.
The ceramic retains its previous nominal roughness; grout is 0.96. The shallow 0.8 mm
bump and 1.2 mm smooth ceramic edge are visual guesses, with a 0.75-texel filtering minimum
for the existing low-resolution maps. No measured material profile is claimed.

## Inspected result images

Both paired sheets show **before on the left, after on the right**. Rows are kitchen
splashback, bathroom wall, bathroom floor. The relief is deliberately slight: joint edges
respond to oblique light while the tile faces and existing palette stay restrained.

- `l1007-paired.png`: actual L1007 material choices and fitted-interior builder.
- `standard-paired.png`: actual standard-interior builder's three ceramic materials.
- `after-l1007-kitchen.png`, `after-l1007-bathroom.png`: context at 1.6 m eye height.

These are the production `buildInterior` and `buildStandardInterior` consumers with the
actual plan's floor 0 and wall bounding boxes, built without the full World. Both phases
have identical cameras, one directional light plus hemisphere, NeutralToneMapping,
1100×720 canvas, DPR1, MSAA and Chromium/SwiftShader. This is controlled component evidence,
not an actual lit World route, hardware performance result or physical-phone test.
The fixture does not exercise kitchen interaction, collision or the actual L1201 plan;
those behaviors/placements are unchanged by the material-only patch.

## Checks and exact cost

1. `node --test tools/tilesurfacetest.mjs`: **3/3 pass**. Checks known 20×10 cm half-bond
   joints and repeat boundaries, smooth edge samples, grout/ceramic roughness, deterministic
   output and independence of height from colour/seed/mottling. No-joint surfaces stay flat.
2. One matched before/after browser pass through both production builders, **8 views per
   phase**, no page/shader/console errors. `browser.json` records identical rendered draw/
   triangle counts in every matched view. Complete builder inventories remain:

   | Builder | Meshes before/after | Triangles before/after | Ceramic materials |
   | --- | --- | --- | --- |
   | L1007 | 322 / 322 | 93,998 / 93,998 | 4 |
   | Standard | 45 / 45 | 18,032 / 18,032 | 3 |

   Representative rendered views: kitchen 138 draws/24,360 triangles; splashback
   39/20,778; floor 21/15,532, identical before/after. These counts describe the controlled
   fitted-interior fixture, not the full apartment budget.
3. Texture accounting: **7 extra textures**, 1,544,000 RGBA base-level bytes, **2,058,192 bytes
   including every mip level**. Each keeps the existing colour map's dimensions/repeat and
   anisotropy 4. One map serves both structural channels; no extra geometry, light, render
   pass or per-frame update/upload. StandardMaterial bump and roughness sampling add fragment
   work; no timing/FPS gain is claimed. Browser wrapper peak: 455 MiB.

The first browser attempt failed solely on the fixture's missing favicon (HTTP404);
an explicit data-URL icon corrected that evidence setup before the green run. No product
failure was ignored. Raw before images were removed after assembling the paired sheets.
The later output-path housekeeping stores raw before files under `before/` on reproduction;
it does not change the rendering or tested product source.

## Reproduce

Serve the repository root on 8182; expose Three r170 as the git-ignored `node_modules/three`
(the fixture import map uses it, matching the production pinned version).

```sh
node --test tools/tilesurfacetest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh \
  node tools/tilesurface2070browser.cjs http://localhost:8182 docs/verification/2070
```

Relevant public transfer: neutral helper and standard ceramic material consumers only;
no personal finish selection, furniture, image, gameplay or Cloudflare integration.
Conductor owns separate public issue, publication, revision-pinned image comment and closure.

## Publication

Code and all retained images were published on main as
`0fd6db633ed861c1f8cf3d1f1829630b3b5963df`.
[Pages44261707020](https://github.com/solwation/lunden-3d-apartment/actions/runs/44261707020)
and [Worker44261706591](https://github.com/solwation/lunden-3d-apartment/actions/runs/44261706591)
both completed successfully on that exact revision. Three inspected representative images
were embedded in the issue with revision-pinned URLs, each verified HTTP200, before closure.
The neutral public adaptation is tracked separately in
[kvarteret-lunden#292](https://github.com/solwation/kvarteret-lunden/issues/292).
