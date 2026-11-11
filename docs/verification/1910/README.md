# Cat proportions, breeds and consumers (#1910)

Base: `e7148fe6a33acba703022897daad0f9285e09034`. Pre-consumer-migration
reference: `7f1bdfbb3473744743b18565f027b45cc5959e4e`; faulty consumer migration:
`8ac07980` (#1894). The old `buildCat`, `applyBreed`, `shapeOf`, `POSE`, behaviour
and `tabbyTextures` recipes remain in [cat.js](../../../src/cat.js).

## Implementation and appearance

The imported generic 26-bone animal and its unrelated coat atlas are replaced by
the existing project-authored articulated cat. Its broad cat head/muzzle, triangular
ears, eyes, shoulder/haunches, paws and tail are restored. Breed size/fluff/head/ear/
muzzle/tail differences and kitten head/leg/tail proportions apply again. Miele
uses the existing brown mackerel/white body and ringed tail maps, narrow face blaze,
white paws/chest and yellow eyes. The retained [Miele photograph](../../miele-foto-ram.jpg)
was opened and compared; no new personal texture or arbitrary white overlay is introduced.
The existing style is a rounded stylised cat, not a photorealistic model.

`tools/buildcatglb.mjs` exports a **neutral articulated Mesh hierarchy** from that
same recipe, with no personal map/image, visitor hand or invisible eye/butt alternatives.
The legacy `cat-rigged.glb` filename and `loadRiggedCatModel` API remain. This asset
is **not** a SkinnedMesh or a second animation authority. Loading validates the four
original primitive buffers and substitutes only geometry, preserving every existing
part/eye/paw/material reference. Original washing, walking, petting, eating, held,
play and climbing pose code drives those parts. Missing/invalid assets keep the
working source recipe; no late callback attaches or resurrects an extra scene.

Shared primitive geometry has `keepCpu`: later binder, outdoor LOD and held-cat
snapshots read/clone its normals and UVs after rendering. glTF's required normal
normalisation preserves source normal directions. Cat-only `modelVersion: 2`
invalidates old generated thumbnails; discovery data and saved encounter photos
are unchanged. The old diagnostic file/draw-reduction panels are replaced/redirected
to the actual consumer gallery.

## Measured budget

| Item | Result |
| --- | --- |
| Former imported asset | 242,696 bytes; generic one-SkinnedMesh appearance |
| Corrected neutral asset | 45,880 bytes; original articulated hierarchy |
| Original source fallback / corrected open-eye cat | 24 mesh calls, 10,008 triangles |
| Closed-eye cat in the scoped fixture | 22 mesh calls, 8,968 triangles |
| Outdoor distant representation | Existing baked one-mesh LOD retained |

The gallery JSON includes a ground plane (2 triangles) and grid (one line call);
its `calls` field subtracts those two environment calls. These are component
counts, not measured global frame rate, startup time or phone memory. The restored
appearance matches the current Pages fallback budget. The faulty migration's
claimed 96% reduction is not retained or replaced with another performance promise.

## Scoped checks and images

1. `node --test tools/riggedcattest.mjs tools/riggedcatmigration.test.mjs tools/catnuzzletest.mjs tools/bestiarycatalogtest.mjs`
   — **16/16 pass**; [log](node-tests.txt). All **37** breed/coat/kitten forms,
   two sit/stand states × six gait phases, exact actual transformed-vertex parity
   before/after loading and finite cat bounds; breed/kitten shape differences;
   eye/coat material isolation; actual four-paw climbing references; late/invalid
   model lifecycle; held/hugged eyes/paws; cat cache version; real phone cleanup
   and subsequent buffer clone; existing nose-contact/catalogue regressions.
2. `tools/browsertest.sh node tools/capture-cat-quality.cjs http://127.0.0.1:8191/tools/riggedcatproduction.html docs/verification/1910`
   — **pass**, Chromium/SwiftShader, [log](browser-test.txt), [measurements](browser.json).
   Five actual production puppets × two states × front/side/oblique; ten actual
   CatSpawner states; actual OutdoorCats construction for all 12 cats, valid near
   paw contacts and baked LODs; actual BestiaryImages for all five forms at both
   96 and 320 pixels; explicit 404 asset fallback; zero page errors. Controlled
   ground/camera/obstacles, **not full World**. No physical-phone or network gameplay
   claim. Full startup is independently tracked in #1914 and publication in #1913.
3. Diff/syntax, added links, attribution, original recipe/behaviour preservation,
   public applicability and source-manifest review. [Source hashes](source-manifest.json).

Saved PNGs were opened and visually reviewed:

- `cats-front.png`, `cats-side.png`, `cats-quarter.png`: whole huskatt, Siamese,
  Maine Coon, kitten and Miele. Sitting above; walking, washing, petting, kitten play
  and held pose below. Captions sit below models so even Maine Coon's ears remain clear.
- `cat-spawner.png`: the actual gameplay CatSpawner, same five forms, including
  the real eating head-down pose. All heads, paws and tails are inside the image.
- `cat-binder.png`: the real image provider's five 96-pixel thumbnails and five
  320-pixel details, including Miele's existing markings and distinct eye colours.

## Public assessment and handoff

Public `cd79c14d5e2f6eb3ddf4b8bcca376f0745ab1dcb` was inspected with its AGENTS.md
and docs/upstream.md. `src/catpuppet.js` retains the generic procedural source from
`578ecc09`, with its existing sit/walk/breed recipe and lighter primitives. It has
no GLB loader, imported SkinnedMesh, replacement atlas or Miele. This regression
was never ported there, so there is no applicable restoration to transfer. Personal
maps, characters, gameplay, storage and services are excluded; public is unchanged.

Integration owner: conductor `/root`, `olw-win10-codex-20261111`. Preserve the checkout
and exact revision recorded in the issue handoff. Publish the images with Refs and
embed permanent SHA-pinned URLs before any closing push. #1913 enables model
publication last after the sibling fixes and verifies actual resource/version/
deployment; #1914 owns combined full-app startup. This worker does not push or close.

## Final production acceptance

The corrected assets are published by original commit
`f124511c18d707db9a087e721dfca01c502e70f8`, successful Pages run
[43033851235](https://github.com/solwation/lunden-3d-apartment/actions/runs/43033851235).
BUILD f124511 / CONTENT2d013f8cd9ae: all12 live versioned model responses are
HTTP200 with exact source byte/SHA-256 parity (see #1913 pages.json).
Actual Pages full World startup also passes: all12 requested versioned resources200,
zero page/console errors, two loaded rigged ponies, restored cat geometry and
the loaded sitting Santa. [Combined result](../1914/pages-startup.json).
Whole-model and consumer images above remain source-bound form evidence; no new
form, hardware-phone, global frame-rate or network-gameplay claim is added.
