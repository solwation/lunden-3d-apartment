# Living cats — #2125

Base `36005ad1`. Component views of the actual consumers, same script in both phases (the runner serves the base revision's
`src/cat.js`, `src/outdoorcats.js`, `src/outdoorcatbrain.js` and `src/config.js` for "Före"): the ordinary `CatSpawner` driven by its
own `update(dt)` at 30 fps indoors, and the real `OutdoorCats` near puppet and merged far LOD driven by `OutdoorCats.animate` outdoors,
one directional sun with shadows and a hemisphere light. Each sheet: top row before, bottom row after, native 400×300 frames.

- [Indoor sequence](indoor-sequence.jpg): face wash (unchanged), flank lick, tail wrapped round the paws, ears to a door opened on its
  left (`onOpen` → `hear`), getting up after a long sit (stretch at 0.9 s / 1.6 s), then the existing tail-up turn.
- [Coat in sunlight](fur-sequence.jpg): ginger tabby, black and grey; strand clumps along the lie of the coat and the strand sheen.
- [Outdoor sequence](outdoor-sequence.jpg): walking, stalking low towards a squirrel, crouching in ambush, resting with the tail round
  the paws (sitting habit on the shared clock), grooming, stretching over the last seconds of a scheduled rest, far LOD.

## Checks

- `node --test tools/catlifetest.mjs` — 5 tests: sitting/grooming choice (first block grooms, weights within 3 %, deterministic per
  seed and clock), tail spring/flicks bounded and deterministic for random/NaN/huge dt and turn rates (trails a turn, settles), ears and
  twitches bounded and pointing at the stimulus, the real CatSpawner wraps its tail round the paws, turns its ears to a heard door,
  stretches before (not during) the turn, shader tail bend matches the CPU tip and stays within the registered vertex slack; puppets own
  their tail bend, one `|catfur1` key for every patched material, a sphynx nearly bare, a stalking puppet 4+ cm lower.
- Existing cat tests unchanged and passing: `tools/outdoorcatbraintest.mjs`, `src/outdoorcatroute.test.mjs`, `tools/riggedcattest.mjs`,
  `tools/riggedcatmigration.test.mjs`, `tools/catnuzzletest.mjs`, `tools/bestiarycatalogtest.mjs`, `tools/catexplorationtest.mjs`,
  `tools/hepcattest.mjs`, `tools/catbindertest.mjs`, `tools/catexplorationsite.test.mjs`.
- Browser `tools/catlife2125browser.cjs` ([browser.json](browser.json)): zero page/shader errors, no external requests; WebGL
  programs 4 before / 4 after; draw calls per frame within ±1 of the same frame before (only the parts the shown pose hides, e.g. the X under a raised tail)
  (cat 20–25, far LOD 2); geometries 19 / 19, textures 1 / 1.

## Cost and limits

No new draw call, texture, light, pass or network field. The fur fragment work is one 3D value noise and one strand highlight per cat
pixel; the tail bend is a few vertex ALU ops. Per cat CPU: one small spring step and two ear angles per frame. The nose/eyes/pupils share
the coat program with the effect off, so the cat adds no program variant in lowMemory (#2118); in the full scene the patched coat
programs are separate from other lamp-washed standard materials (at most the two coat programs, normal and vertex-coloured).
Stylised: no fur geometry; the strand texture fades out within ~1.5 m. Site wind does not ruffle the coat. Shadows show the unbent tail.
Ghost/held snapshots keep the unbent tail. Ground birds do not exist in the scene, so stalking targets squirrels (existing `prey()`) and
the scheduled stalk spots. The full game scene was not rendered with the new shader (lampwash chaining was reviewed, not rendered);
physical-device frame time was not measured.
