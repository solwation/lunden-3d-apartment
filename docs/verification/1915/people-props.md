# Humans, first-person hands and manufactured figures

Source `4d017980e20777ae1ea194e32d5d2ae81e636f15`. These findings supplement the
[whole inventory](README.md); none is a delivered art improvement. The conductor
reviewed the helper's sources, images and distinctions between submitted render
counts and hidden/alternative geometry.

| Existing figure / actual source and consumers | Observed realism gap and appropriate scope |
| --- | --- |
| **Avatar and OlofDriver** — `avatar.js`, `olof.js`, `ghosts.js`, `reflections.js`, `rest.js`, customizer | [Actual production variants/poses](../1907/avatar-quarter.png) show mannequin-like joints, cylinders for limbs, simple separate face volumes and almost uniform cloth/hair. Most part vertices have a single bone weight; no blended skin transition is established by a SkinnedMesh name. Olof uses the same Avatar and belongs in this one model issue, including steering-wheel/pedal/seat contacts and his speaking mouth. Preserve adult/child heights, body/face/clothing/accessory choices and practical IK. The 2D customizer preview is a presentation of those choices, not another 3D character to invent. |
| **First-person hands/arms** — `hand.js`, main's Hand, suit/hug/tool/wet-hand consumers | [Actual Hand reach pose](people-props/hands.png): segmented capsule fingers, abrupt knuckles, planar palm and simple uniform skin. This independent factory needs its own natural hand shape and material work; changing Avatar alone will not update it. Retain relaxed/grip/spread/web morphs, left-hand hug, skin/clothes matching, ring/watch and wet-hand paths. |
| **Santa** — `santa.js`, actual sofa/main, collection | [Actual loaded sofa pose](../1914/glb-sitting.png): a recognizable festive figure, but separate ball/capsule face, hands and legs, simple coat and geometric beard. Improve the impression of a clothed human guest without changing arrival, sleep/sip/wave, blush, moved sofa, glass or gameplay. Rigid hair/cloth simulation is not required. The primitive collection factory also needs a separate completeness check; a correct sofa image does not prove its portrait is whole. |
| **Pingping** — `pingping.js`, bed/held/hug/collection | [Current real factory](../1905/after/pingping.png) matches the [retained cushion photo](../../pingping-pingvinkudde.jpg) in shape, panels, face, flippers and feet. The gap is manufactured-object realism: short pile, panel/embroidery seams and modest stuffing folds/compression. It must remain this soft cushion, not become a biological penguin. Preserve squeak/hearts/hug/save and bounded geometry/maps. |
| **Desk mascot** — `tillydesk.js` `deskShape`, both desk variants | [Current actual desk component](people-props/desk.png) is an almost plain egg with bead eyes and thick ring geometry. The [retained desk photograph](../../datorsetup-secretlab-batman.jpg) shows a little stitched/crocheted face and patterned fabric. Improve the recognizable small manufactured figure, judging normal desk distance as well as the close diagnostic; preserve both desk variants and their material batches. |
| **Ceramic owl** — `furniture.js` secretary `trinket('owl')`, Things/Holdable | [Current actual movable owl](people-props/owl.png) is a grey two-sphere figure. The [retained reference](../../miele-foto-ram.jpg) shows a squarer continuous ceramic body, broad eye discs and patterned brown/beige glaze/relief. Improve the ornament's silhouette and glaze; do not add a living owl species or expensive feather meshes. Preserve its footprint/held/save behavior. |
| **Unicorn lamp** — `furniture.js` `unicornLamp`, actual MALM/decor | [Actual furniture component](people-props/lamp.png) has obvious sphere joins and almost no face. It should read as a coherent manufactured lamp with a readable eye/muzzle, preserving the light/emission behavior and existing material batches. It does not need live horse anatomy or animation. |
| **Craft-table unicorn** — `furniture.js` `alex`, actual ALEX | [Actual component](people-props/unicorn.png) uses separate rounded boxes, post legs, a straight mane strip and cone horn; neck/ears/eyes/muzzle/tail identity is extremely sparse. Improve it as a small toy with a coherent shape, without high-cost equine detail or changing the furniture. |
| **Drawer dinosaur, LEGO-like figure and mini duck** — `furniture.js` `SECRETS`, `secret.js`, `things.js` | [The three unchanged movable production models, displayed in a row](people-props/toys.png) lack identifying face/body detail: cylinder/cone dinosaur, arm/face-less brick figure and eyeless sphere duck with cone bill. Improve small plastic/rubber toys with readable shapes and a few useful surface details; preserve their small dimensions, drawer/secret/Holdable/save behavior. |
| **Remote/held/collection representations** — `ghostprops.js`, `ghostcat.js`, `bestiarymodels.js`, `bestiaryimages.js` | These are consumers and distance/cost choices, not separate species or an excuse for many support stories. Include the relevant retained palette, silhouette and close presentation in the owning model issue. Do not render every far held object at maximum detail. |
| **Historical humans, flat artwork and non-figure toys** | Main instantiates only the car's OlofDriver; removed neighbours are not current actors. `footballlife` is a ball system, not football players. `toys.js` contains blasters/wands/headband; generic `stuff.js` toy fill is blocks/ball/car. Posters, bedding, drawings/photos and screen cartoons are intentionally flat motifs; making their printed figures biological would change the products. Inventory them as excluded, rather than creating new characters or arbitrary art tasks. |

## Measured or source-bound costs

- Actual first-person Hand reach component: **3 submitted calls** without ring/watch.
  [Capture log](people-props/capture-fix.log). No frame-time result is asserted.
- Three actual drawer toys together: **6 submitted calls / 884 triangles**; actual
  owl: **4 / 234**. These are the displayed models, not whole-room budgets.
- Desk **11 / 9,534**, MALM/lamp **40 / 19,424**, ALEX/unicorn **27 / 20,692** in
  these controlled cameras include the **whole furnishing**, not just its figurine.
  Raw traversal sees hidden alternative desk/furniture parts and is not draw cost.
- Reused #1907 source-bound Avatar result: **one draw**, **10,790–15,710 submitted
  triangles** for six supported looks, including shader-hidden accessory alternatives.
  Neutral GLB **5,150 triangles / 1,813,152 bytes** is not the cost of every runtime look.
- Santa's raw GLB contains alternative sitting/sleeping legs; summing every raw part
  is not actual pose cost. Its actual sofa and collection paths must be measured separately.
- Pingping's existing actual factory has four visible material parts and its GLB is
  152,308 bytes; no performance gain is claimed from those numbers.

All new images are actual unmodified production factories in a controlled component,
not a full World playthrough. Chromium1248/SwiftShader, DPR 1, 1500×950 for prop images,
900×600 for the Hand canvas. The temporary gallery reparented drawer toys for a clear
view; it did not replace their geometry/materials. The final captures have no page
errors. [Raw component results](people-props/result.json), [source/reference hashes](people-props/source-manifest.json),
[capture script](people-props/capture.cjs), [corrected framing/Hand capture](people-props/capture-fix.cjs),
[owl capture](people-props/capture-owl.cjs) and [gallery](people-props/gallery.html)
record the setup. Early private framing/return-property errors were corrected only
in the audit harness; they are not production bugs or evidence of passed earlier captures.
No global FPS, mobile hardware, CPU/GPU-time or battery measurement was made.

## Vehicles and the rest of the twelve-GLB inventory

Both cars and the bicycle were inspected against current source and whole actual
consumer images: [cars](../1905/after/cars.png), [bicycle](../1912/scene-false.png).
Mégane/parked cars still have faceted bodywork and simple surface response; the bicycle
is simplified but its repaired frame, wheels, saddle and bars are recognizable.
The prior GLB series did not establish a general vehicle realism upgrade either.
However, this user's specific follow-up concerns characters/animals and related
figures. No new car/cycle rebuild is introduced as a prerequisite for that work.
Record future visible finish opportunities here; preserve doors/wheels/cabin,
instancing, LOD and existing bike gameplay if separately requested/triaged later.
No actual new functional regression was established by this audit.
