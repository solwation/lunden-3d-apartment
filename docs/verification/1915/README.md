# Realism, figures and animals — audit #1915

Baseline: `4d017980e20777ae1ea194e32d5d2ae81e636f15` (2026-11-12).
The user's goal is **higher realism with acceptable performance**, for all existing
characters, animals and related figures. Restoring a recognizable old model after
a faulty migration is useful repair, but does not deliver that visual upgrade.
A GLB file, skeleton, successful load or passing geometry test is not its acceptance.

## Coverage and evidence

The inventory follows actual imports in `main.js`, the actor providers, the creature
registry, model/prop factories and their secondary consumers. It includes non-GLB
representations, first-person hands, remote/held models, distance LODs and collection
images. Removed historical neighbours are not new work. Ordinary food, flat printed
artwork, plants, magic particles and household objects without a figure model are
not treated as living characters. Existing figure-shaped lamps, toys and ornaments
are assessed as manufactured objects, not animals to make biologically realistic.
No new creature species or gameplay is proposed.

All **65 registered entries** were enumerated and rendered from the current production
bestiary factories: **37 breed/coat/kitten cats, 10 squirrels, 2 duck sexes, 1 gull,
6 ordinary fish plus shark, 2 ponies, 3 butterflies and 3 figures**. The actor/prop
review additionally covers Avatar/OlofDriver, the visible first-person hands and
figure-shaped furnishings outside that registry. Cars and bicycle are checked to
account for all **12** prior GLBs; they are separate from living-figure anatomy.

[Registry and environment](animal-inventory.json), [three figure recipes](figures-baseline.png),
[figure render counts](figures-costs.json), [figure capture](capture-figure-bestiary.cjs),
[figure capture output](figure-bestiary-browser.txt), [source hashes](source-manifest.json),
[capture script](capture-animal-audit.cjs) and [capture output](animal-audit-browser.txt)
keep the audit reproducible. No product module changed. The baseline models are
shown unchanged; none of these images is an improved result.

The eight family sheets (including the three figure recipes) are the actual **collection recipes in neutral
collection lighting**, not claims of a complete World playthrough or all animation
states. They expose existing proportions, colours and part construction. The 37-cat
sheet was reviewed alongside larger actual CatSpawner/OutdoorCats/held/pose images
from #1910, rather than judging each tiny face from a contact sheet alone.
The actual Birds shader is also captured from a ground-height camera and a deliberately
near inspection camera at a frozen simulation time. Its near view is relevant when
flying, but is not representative of its usual distant ground footprint.

- [All cats](cats-baseline.png), [squirrels](squirrels-baseline.png),
  [duck collection recipes](ducks-baseline.png), [fish/shark](fish-baseline.png),
  [ponies](ponies-baseline.png), [butterflies](insects-baseline.png), [gull recipe](birds-baseline.png).
- [Real Birds ground view](birds-ground-baseline.png),
  [same flock shader, near diagnostic view](birds-detail-baseline.png).
- Previously delivered actual component/pose views, opened again for this audit:
  [ponies in Paddock](../1906/paddock-idle.png),
  [six Avatar/IK variants and poses](../1907/avatar-quarter.png),
  [squirrel whole anatomy](../1908/whole-idle.png),
  [real Ducks swim poses](../1909/scene-swim.png),
  [cat forms and poses](../1910/cats-quarter.png),
  [actual river/catch/shark evidence](../1911/README.md),
  [whole sofa/Santa](../1914/README.md), [cars and Pingping](../1905/README.md).
- Real retained references opened: [Miele photograph](../../miele-foto-ram.jpg) and
  [Zoey/Princess photograph](../../ingame-reports/b6346949-f99d-4eb9-af70-4603dae2dceb-2.jpg).
  These establish individual appearance, not surveyed animal dimensions.

## Findings by living model family

| Model and actual consumers | Concrete gap against the realism goal | Boundary for a useful upgrade |
| --- | --- | --- |
| **Avatar / OlofDriver**: remote players, reflection, own-body/rest poses, driver and collection representation | Visible mannequin joints, cylindrical limbs, simple face/hair volumes and largely uniform clothing. #1907 restored earlier appearances/IK; it did not produce a new realistic human asset. | Connected anatomy and credible skin/eyes/hair/clothing at ordinary interaction distances, preserving all supported appearances, heights, tools, driving and poses. First-person hands are a separate consumer/factory. |
| **Cats**, all 37 forms: CatSpawner, 12 outdoor cats near/far, held/remote cats, photographs and collection | Oversized protruding eyes, balloon-like torso/bib/haunches, simple muzzle and primitive joins produce a cartoon/plush impression. Most coats are near-solid colours; Miele has recognizable stripes but remains the same stylized anatomy. | Natural feline body/head/eye/ear/paw relations and coat surfaces; real sitting/standing/walking/held/climbing contacts and retained breed/kitten/individual identity. A generic foreign cat that loses variants is not acceptable. |
| **Ponies**, Zoey and Princess: paddock, feeding/petting, winter blankets, collection | Strongly faceted barrel/neck/muzzle, broad flat colour blocks, hard joins and slab-like mane/tail. The real reference has softer muscle transitions and distinct muzzle/face/hair structure. | Equine anatomy and natural mane/tail/coat response at fence/petting distance, full stride and grazing continuity. Preserve reference identity, ground/hand contact and blanket fit. |
| **Squirrels**, ten configured looks: actual near/far actors, feeding/climbing/nuts and collection | Tail resembles stacked cones/blobs or a pine cone, visible separate body/limb volumes and stylized face. Rounded old geometry was restored, rather than a natural pelt and continuous animal silhouette. | Coherent furry tail silhouette, better chest/head/haunch transitions and paws, credible running/climbing/eating. Preserve the pale-tail and slim/dark identities and useful distance LOD. |
| **Ducks**, both sexes: flock on bank/water, bill-contact greeting, feeding, collection/fallback | Ball/ellipsoid head, neck and body remain distinct shapes; plumage is very coarse/mostly uniform in the reviewed swim image. Collection/fallback still uses the older 640-triangle recipe while loaded runtime uses the corrected 960/896-triangle version. | Natural mallard outline, bill/neck integration and restrained feather patterns for both sexes. Same identifiable appearance in real poses and collection/fallback, with existing bill contacts and waterline intact. |
| **Six ordinary fish**: live river batch, catch/held/cooking, remote proxy and collection | Every live species still shares one mört-derived topology; a stretched generic fish cannot give eel, pike and bream their characteristic anatomy. Existing detailed catch/collection models are distinct but visibly faceted, flat-finned and simply painted; the remote proxy remains a generic sphere/cone fish. | Species-specific silhouettes where visible, natural flex along body/tail and finer eye/gill/skin response. Shared/reduced representations should remain identifiable without six costly always-active render pipelines. Preserve sizes, catch/cooking transitions and water rendering. |
| **Shark**: surface fin/wake, caught body then skeleton, held fin and collection | Current form is recognizable but coarse: flat triangular fins, angular snout and simple skin; existing posed/whole image does not prove a more convincing swim. The collection is the intentional landed body without the detached dorsal. | Low-priority visual refinement of the existing fictional visitor, with coherent body/fins/skin/animation and actual live/caught/bones phases. Do not mistake intentional detached fin/gameplay for a model defect or alter the fantasy premise. |
| **Gulls**: actual flock, ground/flight views, collection | Three unlit triangles, no head/beak/body volume; near view reads as a folded paper shape. Current span is a guessed 3.2m, high flock scaled 1.8× for visibility. At normal ground distance birds occupy few pixels. | Readable gull outline and natural gliding/flapping at the distances actually seen, especially flight proximity; preserve one flock batch and cheap far silhouette. Reassess visibility scaling against the intended natural impression, not arbitrary realism detail at subpixel sizes. |
| **Ambient yellow/orange butterflies**: outdoor-cat chase and collection | Four uniformly coloured triangles without body/antennae or natural wing contours/pattern; whole-body X scaling approximates wing beats. | Recognizable small butterfly body and paired wings, restrained markings and rotation around the body; preserve the near-only chase and very small geometry/material cost. |
| **Magic butterfly**: wand Flutter instances and collection | A 64px four-oval sprite flattens/scales to mimic flapping. It is intentionally a short magic effect, not an ordinary biological species. | Review alongside butterflies for coherent wing motion/readability at its actual 8cm effect size. Keep the fantasy colour/fade/finite pool and instancing; no costly realistic insect anatomy mandate. |

## Additional people, hands and manufactured figures

[Complete additional inventory and six new actual-consumer images](people-props.md)
covers first-person hands, Olof, Santa, Pingping, the desk mascot, ceramic owl,
unicorn lamp, craft-table unicorn, drawer dinosaur, brick figure and mini duck,
as well as remote/held proxies, flat-art exclusions and the vehicle assessment.
Each is judged as a person/animal or as its real manufactured material, as appropriate.

## What the counts do and do not prove

Chromium/SwiftShader, Three r170, DPR 1; geometry/bestiary renders only. The capture
records **actual submitted render calls/triangles** separately from raw traversal
counts, because invisible alternative eye/accessory meshes must not count as draws.
`geometryAttributeBytes` is a sum of CPU attribute/index array bytes in that recipe,
not measured total GPU memory, browser heap, texture allocation or loading cost.
The component has no physical phone, full-scene frame-time or battery result.

| Current scope | Submitted calls / triangles | Evidence and limit |
| --- | --- | --- |
| Each of 37 default collection cats | 24 /10,008 | [All rows](cats-costs.json); actual open-eye default. Closed/held/near/far states have different costs; do not multiply by all 12 outdoor cats regardless of LOD. |
| Each of 10 collection squirrels | 1 /3,382 | [Rows](squirrels-costs.json); existing runtime far geometry is 1,396 triangles per prior source-bound #1908 checks. |
| Each duck collection recipe | 1 /640 | [Rows](ducks-costs.json). Loaded production male/female costs960/896; these are different recipes, not a new saving. |
| Each pony collection recipe | 1 /1,080 | [Rows](ponies-costs.json); existing runtime rig uses one draw per pony. |
| Ordinary fish collection, mört/abborre/braxen/gädda/öring/ål | 1 /433,499,409,537,547,417 | [Rows](fish-costs.json); these are the detailed catch shapes, not six live species topologies. |
| Live river,18 fish | Existing fish batch plus rings batch | One generic433-triangle body per filled instance, both distance-gated. No new FPS/memory claim. |
| Actual Birds flock | 1 /30 for 10 birds | [Actual shader capture](animal-inventory.json); low-memory count 5 is the existing source rule, not new phone timing. |
| Ambient butterfly / magic collection sprite | 1 /4; 2 /4 | [Rows](insects-costs.json). Magic collection transparent DoubleSide has two passes; actual Flutter is a separate finite instanced effect, not one mesh per effect. |

The previous cat evaluation still presents **96.3% draw-call savings, eliminated GC
stalls and mobile benefits** as established. That cannot describe current production:
the current cat again draws24 calls in this scoped fixture and still replaces its
TubeGeometry when its tail pose changes. Older attribution text also says squirrels
went3→1 although the prior original source already used one merged draw. These
conflicting claims require a separate documentation correction; they are not evidence
that a future realistic model will run faster.


A separate source/portrait defect was reproduced while completing the65-entry
inventory: `santaFigure()` creates empty leg geometry for the real Santa controller
to populate against a seat, but `createBestiaryModel({kind:"santa"})` never sets it.
[The current collection result](figures-baseline.png) therefore has no legs, while
[the actual sofa result](../1914/glb-sitting.png) does. This is a specific bug to
track separately from making the character more realistic. Likewise the duck
collection/fallback recipe demonstrably differs from the loaded corrected version.
The initial figure-counter harness failed on this empty geometry; it was corrected
to count zero positions and then captured the actual missing-leg result. The failed
initial attempt is not counted as a successful capture.

## Acceptance for the follow-up work

Each independently reviewable implementation issue must define an observable before/
after outcome: whole side/front/oblique views with identical camera, scale and normal
lighting, plus the actual consumer at ordinary viewing distance and representative
motion/contact states. Anatomy and surface response must improve visibly relative
to this baseline and retained references. A newly exported old recipe is not success.
Higher polygon counts, more bones, a PBR material or a different file extension are
implementation options, never the user's outcome. Licensed external assets require
verified provenance, compatible reuse and adaptation to existing identity/poses.

Choose 2–3 sufficient checks in the issue's short plan. Record an initial scoped cost
baseline (submitted calls/triangles, buffers/maps/asset bytes and pose/update cost),
then compare the same count/variants/distance/quality/viewport/time on the same
renderer after the change. Use an affected real scene for warm steady frame intervals
and relevant first-load/stall/memory risk; report median/p95 and environment when time
is actually measured. Keep adaptive quality fixed, distinguish software rendering and
phone profiles from real devices, and do not infer FPS from triangle counts.
A visible quality gain may justify a bounded cost increase agreed in the short plan;
preserve batching/LOD, existing weak-device paths and single shadow-light policy.
Avoid new per-frame geometry rebuilds and unbounded per-instance maps/skeleton work.
No unmeasured claim of OK performance or hardware speedup may close an issue.

Retain functioning appearance choices, gameplay, behaviour, scale and contacts. Old
exact-vertex parity tests cannot freeze the old cartoon design when the intentional
change is its shape; keep meaningful functional/pose/identity coverage instead. The
old headshot polygon/eye/hair refinement requirements remain superseded by the
user's shared three-box head-collider decision; do not revive them for art work.

## Public applicability

Public base `11d67b945daccf36f90e27cd4420b19b2ec1903f`, AGENTS.md and the relevant
`docs/upstream.md` sections were checked. Approved generic ambient cats, squirrels,
ducks, ponies and river fish exist there in adapted procedural forms. Relevant
natural shape/material/cheap animation improvements may be transferred after the
original delivery, each under its own **priority: low** public issue and its own
browser evidence. Public identity, passive scenery, budgets, independent storage and
no-network-services boundary must remain. No original snapshots/photos are copied.
Avatars, Olof, first-person gameplay hands, Santa, Pingping/personal toys, shark/fishing,
magic butterflies, gull additions and services are outside the public exception.
This audit changes documentation only and supplies no model patch to port now.

## Follow-up issues

The audit produced **13 visual improvement issues and 3 separately reproduced bugs**.
They are independent deliveries, not prerequisites for closing this analysis. No
improvement issue is claimed or implemented by the audit itself. Each includes its
observed gap, actual consumers, visual acceptance, a scoped cost baseline and limits,
priority rationale, public applicability and published baseline evidence.

| Issue | Priority |
| --- | --- |
| [#1916 — Mer naturtrogna spelarfigurer och bilförare med bibehållen prestanda](https://github.com/solwation/lunden-3d-apartment/issues/1916) | medium |
| [#1917 — Mer naturtrogna förstapersonshänder och armövergångar](https://github.com/solwation/lunden-3d-apartment/issues/1917) | medium |
| [#1918 — Naturtrogna katter med bibehållna raser, pälsar, poser och spelprestanda](https://github.com/solwation/lunden-3d-apartment/issues/1918) | medium |
| [#1919 — Mer naturtrogna ponnyer enligt Zoey- och Princessfotot](https://github.com/solwation/lunden-3d-apartment/issues/1919) | medium |
| [#1920 — Mer naturtrogna ekorrar med sammanhängande päls och svans](https://github.com/solwation/lunden-3d-apartment/issues/1920) | medium |
| [#1921 — Mer naturtrogna gräsänder i form, fjäderdräkt och rörelse](https://github.com/solwation/lunden-3d-apartment/issues/1921) | medium |
| [#1922 — Arttrogna fiskformer och simrörelser i ån, handen och pärmen](https://github.com/solwation/lunden-3d-apartment/issues/1922) | medium |
| [#1923 — Gör soffans tomte mer mänsklig med trovärdiga kläder och händer](https://github.com/solwation/lunden-3d-apartment/issues/1923) | medium |
| [#1924 — Trovärdigare måssiluetter och flygrörelser med billig fjärrflock](https://github.com/solwation/lunden-3d-apartment/issues/1924) | low |
| [#1925 — Trovärdigare fjärilsform och vingrörelse vid katterna och trollstaven](https://github.com/solwation/lunden-3d-apartment/issues/1925) | low |
| [#1926 — Mer naturtrogen hajform och rörelse inom befintlig spelpremiss](https://github.com/solwation/lunden-3d-apartment/issues/1926) | low |
| [#1927 — Återge Pingping som en verklig sydd mjukiskudde](https://github.com/solwation/lunden-3d-apartment/issues/1927) | low |
| [#1928 — Gör små figurprylar trovärdiga som leksaker, tyg och keramik](https://github.com/solwation/lunden-3d-apartment/issues/1928) | low |
| [#1929 — Bugg: GLB-utvärderingen beskriver obelagda prestandavinster som levererade](https://github.com/solwation/lunden-3d-apartment/issues/1929) | medium |
| [#1930 — Bugg: Tomtens pärmbild saknar ben](https://github.com/solwation/lunden-3d-apartment/issues/1930) | low |
| [#1931 — Bugg: Änderna har olika modell i spelet och djurpärmen](https://github.com/solwation/lunden-3d-apartment/issues/1931) | low |

[Final verification and limits](validation.md). The output is this source-bound
inventory, reviewed evidence and actionable issues, not upgraded production assets.
