# Rounded mallards — #1909

Base cf5621eb; avatar changes are unrelated. The box-based #1896 GLB discarded the
rounded `duckModel` form. The correction reuses that body/head/bill and sex-specific
vertex colours, adds separate folded wings, a white drake collar and short legs,
reduces oversized eyes and tapers the low tail. One SkinnedMesh/material per bird.
Male/female are 960/896 triangles versus the detailed original 640 and broken GLB
box recipe; restored GLB62808 bytes versus32572. No performance saving is claimed.

## Risk checks

1. Five rig tests: binary/14 bones/five clips; every neutral vertex of both sexes
   stays in place after skinning; identical measured bill z/y/vertical interval
   to the existing kissing geometry, including animated idle; finite whole-duck
   bounds at13 phases for all five clips. All pass.
2. Existing duck kiss/brain/finite-bread/reward tests pass. Combined run12/12:
   `node --test tools/riggedducktest.mjs tools/duckkisstest.mjs tools/duckrewardtest.mjs tools/ducktest.mjs`.
3. Chromium/SwiftShader actual `Ducks` constructor/setup/update on controlled flat
   land/water: both sexes, visible GLB and hidden fallback, idle/swim/waddle;
   flap is manually selected because no automatic flap behaviour exists. Final
   snapshots isolate the selected action after checking update. Water uses the
   ordinary0.12m sink and no bob at phase0; land uses y0. No page errors.
   Whole asset gallery from four axes: male/female idle, male flap and female eat.

Eight saved images beside this file, whole and actual consumer. Whole male/female,
water pair and wing-flap images inspected: coherent bird silhouette, recognizable
bill/head/eyes, collar, low tail and connected feet. These are controlled component
scenes, not full World, natural flock routes or a physical device test. The existing
habitat/feeding/kissing implementation and points/scoring remain unchanged.
The older demonstration page now forwards to the actual component fixture.

## Delivery

Publish source and images with Refs #1909. Final closure waits for #1913 to deliver
all corrected GLBs and verify actual Pages bytes/consumer loading, and #1914 full
World startup. The public app uses the retained procedural ducks and has no box/atlas
regression. Generic collar/wing/eye/leg/tail refinements are applicable there; tracked
as a separate public low-priority issue, excluding feeding, personal content and services.
