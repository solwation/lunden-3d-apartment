# Squirrel form correction — #1908

Source base: bc6f65f6. The migration #1895 replaced the established soft anatomical
parts with boxes and included a permanent nut. The corrected GLB reuses the original
3382-triangle detailed anatomy and its vertex colours. Runtime looks keep the exact
original width, belly, coat, dark eyes and optional tail-tip colour; far LOD is kept.
There is one material/draw per animal in both the detailed original and correction.
The GLB grows from 52648 to 229824 bytes to restore that detail.

## Risk checks and result

1. Four rig tests pass: binary/25 names/five clips, every vertex's neutral binding
   for all ten looks and both LODs, colour/position/triangle parity with the retained
   original, and deformed whole-model bounds at 13 times in each clip.
2. All 30 existing squirrel brain tests pass, including feeding, winter, roaming,
   water avoidance and wire state mapping. No brain, scoring or network changes.
3. Chromium/SwiftShader: whole GLB in four axis views for idle, flick and eating;
   actual `Squirrels` constructor, `setupRigged` and `pose` in a controlled component
   scene for idle/eat/run/climb/flick. Three representative looks visible together;
   fallback hidden, correct clip selected, carried nut visible only in eat, distant
   rig geometry selected and no page errors. Eight images saved beside this file.

Inspected whole idle and actual eating/run/climb images: coherent rounded body,
recognizable face, small paws and connected bushy tail; white tail tip and slim dark
look remain distinct. The component deliberately uses flat ground and controlled
brain states, not the full World/real-tree AI scenario. Run includes the consumer's
normal hop; climbing is shown against an empty background, without claiming trunk
contact. Nut size is the existing game visibility multiplier (2.6), unchanged here.

The old `riggedsquirrelproduction.html` now points to the actual component fixture;
its claimed three-to-one draw saving and unconditional success panel were removed.
The unused generic atlas has been removed, so it cannot paint over anatomical details.

## Publication and public assessment

Source/evidence can be published with Refs #1908. Closure waits for #1913 to deliver
all corrected model resources together and verify their actual Pages availability.
The public app already uses `src/squirrelmodel.js` with the same detailed procedural
anatomy and near/far selection. It has no GLB/atlas/box regression to port; no personal
animal names, gameplay, photos or Cloudflare integrations are transferred.
