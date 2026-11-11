# Fish and shark model correction — #1911

Base2482f29e. The new generic GLB reduced the already normalized river aspect ratios
again and lacked anatomical eyes/gills/mouth. Its shark export replaced the existing
body and detailed skeleton with an ellipsoid/cones and a skull/jaw/stick.

`riverFishGeometry()` now derives a neutral grey finned fish from the established
mört loft and normalizes its complete bounds to1×1×1. Both fallback and baked static
and correctly bound animated assets share it. Existing species w/h/length instance
scaling is applied once. This remains **one generic underwater instanced batch**;
its colours/aspect differ per species, not its anatomical topology. No per-species
underwater texture or new GPU skin animation is claimed. The six detailed caught
and bestiary species geometries, cooking luminance, length scaling and gameplay
are retained unchanged (433/499/409/537/547/417 triangles respectively).

The shark export reuses the established3.2m body with eyes/gills, pectoral/pelvic/
secondary dorsal/anal/tail fins, the accurate0.42m detachable fin, and the full
skull/teeth/vertebrae/ribs/fin-ray skeleton. A separate `Shark_whole` inspection
variant includes the first dorsal; the actual carcass intentionally lacks it,
as the fin is the existing held object. Runtime keeps its proper existing carcass.
Alternatives are viewed separately. Generic fish433 triangles; GLBs41944/101960bytes
versus21356/16876. No performance improvement claim; one river batch +one rings batch
and existing shark phase draw budget remain.

## Risk checks

1. `node --test tools/fishglbtest.mjs tools/caughtfishtest.mjs`:8/8 test cases pass,
   including43 original per-species shape checks. Unit dimensions, every neutral
   vertex, deformed swim/idle bounds at9 phases, fin height, exact detailed skeleton
   position parity and true carcass length checked against production source.
2. Four-axis whole-model views: six actual bestiary species recipes, corrected
   scaled generic swim, intact shark and skeleton. The six species images show
   existing source geometry, **not a claimed GLB species migration**. Side/front/
   oblique views stay uncropped and are labelled accordingly.
3. Chromium/SwiftShader actual RiverFish, CaughtFish and Shark classes in a controlled
   scene: ordinary river matrices at a naturally calculated rise (five fish drawn),
   six caught objects with40cm bodies/70cm eel and normal rest placement, existing
   bank body and bones phases. No page errors.13 saved result images beside this file.

Inspected whole shark, bank body/bones, actual six catches, generic swim and actual
river views; also detailed perch/pike/eel views. Recognizable fins/face/eyes and species
silhouettes; complete skeleton. The sparse river surface appearance is intentionally
the existing opaque-water representation. This is not a complete World, fishing
input/network/reward/cooking or physical-device test; those paths are unchanged.
The old demonstration page forwards to the actual component fixture.

## Publication/downstream

Source/images publish with Refs #1911; closure waits for model delivery#1913 and
full app startup blocker#1914. Public ambient river fish can use the generic finned
unit geometry without any caught-fish/shark/gameplay/service integration; a separate
public low issue tracks that selective transfer. No shark or carcass is ported.

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
