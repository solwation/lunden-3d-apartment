# Santa realism — #1923

Baseline: `c1aa51549079192cc39de8b74cc3f9d3a5603ef8` (the restored model, not the broken migration).
Original-only personal Christmas character/gameplay; no public downstream transfer.

## Result and review

A shared authored surface recipe replaces the spherical head/nose/fists, separate beard
locks and capsule trousers. The head now has a jaw, nose bridge and smaller fitted eyes;
the coat has shoulders, a curved belt and restrained vertex tint. Short fingers/thumbs,
a grooved beard and continuous bent trouser sweeps improve the silhouette. The existing
red coat, hat, warm face, sofa-local pivots and floor/seat/glass paths remain. All new
surface profiles/density/colour guesses are in `SANTA.surface`. No texture, light,
per-frame geometry, animation mixer or cloth/hair simulation is introduced.

The first front/side/whole/normal proposal was reviewed by the integration owner.
That review caught a real knee transition issue, resolved by replacing two capped
segments with one continuous sweep. An apparent long hand fringe was the existing
striped sofa cushion; identical scene/camera images with only the sofa meshes hidden
prove that distinction (`hand-with-sofa.png`, `hand-without-sofa.png`). Native right-hand
skin spans only 12.9cm vertically. No hand shape was changed after this review.

All final whole/front/side/normal, sipping, waving, sleeping and moved-sofa images
were opened and inspected. The knee is continuous in the side view, the glass remains
visible for sitting/sipping and is hidden during sleep, and short fingers remain
bounded in the actual posed meshes. The hand/glass centre distances are diagnostics
of the preserved approximate animation, not a claim of anatomical finger contact.
The fixture header retains its initial sitting label; the visible pose and filenames
identify the explicitly selected motion frame.

Representative images:

- `normal.png`, `front.png`, `side.png`, `whole.png`: actual Santa, furniture.sofa and restTarget.
- `sipping.png`, `waving.png`, `sleeping.png`, `moved-sleeping.png`: production pose function.
- `fallback.png`, `late.png`: failed-request and late-success retained fallback.
- `apartment.png` / `before/apartment.png`: matched main/World normal standing view,
  Christmas Eve 15:00, quality1/light resources, CSS1100×700, deviceDPR1, renderer ratio0.75.
- `before/{whole,front,side,normal}.png`: same component camera/light/scale before the change.

## Three scoped risk groups

1. **Visible form:** matched component whole/front/side/normal views and the real
   apartment view. No unrelated headshot/detail regression chain.
2. **Actual consumers/poses:** loaded GLB, missing GLB and a success delayed until after
   fallback construction; sitting/sipping/waving/sleeping, translated/yawed sofa and
   absence. Every native attribute, full model matrix and camera/projection/inverse
   matrix is finite. Paired renders with Santa hidden prove 57,640–84,524 intended
   figure pixels in visible poses and zero while absent. Floor contact is within
   1.1e−8m; all 1,560 seated leg vertices below the cushion clear its front by at least
   0.0484m. Real greeting and dynamic blush remain active. Nine Node checks pass.
   Calendar/gift/TV/score/service implementation is unchanged and its broader suites
   were not rerun. Collection still has the separately tracked missing-legs bug #1930:
   `santaFigure()` leaves leg selection to `Santa`, so this issue does not claim that
   consumer fixed or complete. No A/B/C/L architecture changes apply.
3. **Bounded cost:** original claim ceiling is unchanged draw calls and ≤1.25× submitted
   triangles and unique raw geometry views, including retained GLB/fallback/alternative
   legs. All limits pass. The final normal apartment route supplies integration/view
   evidence, not a broad world timing profile. Verification cost was reassessed at
   roughly ten minutes; after the one knee correction only affected captures and a
   narrowly corrected comparable baseline timing were refreshed.

## Costs

All geometry rows use actual production consumers. The component sofa/floor contribute
42 calls / 15,794 triangles and are identical before/after. Both raw leg alternatives
are retained, but only the selected pose is submitted. The sleeping bundle below
includes the existing independent two-triangle text sprite; the JSON's isolated
`contribution` hides only the Santa object and therefore excludes that sprite.

| Path / quantity | Before | Final |
| --- | ---: | ---: |
| Loaded sitting/sipping/waving calls | 6 | 6 |
| Loaded sitting/sipping/waving triangles | 4,228 | 4,932 (+16.7%) |
| Loaded sleeping calls, including text | 5 | 5 |
| Loaded sleeping triangles, including text | 4,158 | 4,862 |
| Missing/late sitting calls | 7 | 7 |
| Missing/late sitting triangles | 12,440 | 4,956 |
| Missing/late sleeping triangles, including text | 12,346 | 4,862 |
| Absent Santa calls / triangles | 0 / 0 | 0 / 0 |
| Unique live instance raw geometry views, loaded | 566,568B | 606,312B (+7.0%) |
| Loaded instance + retained source GLB views | 1,068,120B | 1,064,664B (−0.3%) |
| Failed-request fallback, including both legs | 1,611,576B | 606,312B |
| Fallback + subsequently loaded source GLB views | 2,177,304B | 1,211,784B |
| GLB download | 572,944B | 612,804B (+7.0%) |

The existing sleep text still owns its 256×80 canvas (81,920 raw RGBA bytes); no new
model texture is added. Geometry figures count unique native typed-array views,
including pick geometry, rather than deduplicating unrelated buffers by equal content.
They do not estimate total browser/GPU memory. The late-baseline retained cost adds
the frozen GLB's 565,728B accessor views to the actually measured fallback instance.

Warm fixed-component intervals use the exact same normal camera, 1200×680 canvas,
DPR1, lights and renderer, 20 warm frames followed by 70 measured sync renders with
`gl.finish()`. Baseline GLB median/p95 was 0.4/1.2ms; final was 0.4/1.8ms. Fallback
was 0.4/1.6ms before and 0.6/2.1ms final. Late-loaded fallback final was 0.6/4.2ms,
with no paired baseline timing. Final update-only median rounds to 0ms and p95 is
0.1–0.3ms at the browser timer's resolution. The observed higher tails are recorded;
these short SwiftShader samples establish neither a speed improvement nor physical
phone/Surface/native-GPU FPS or frame-time neutrality. No startup speed claim is made.

## Reproduce and source binding

`component.json` contains final source/GLB SHA256s, actual pose pixels/costs, contact,
hand bounds and full matrix checks. `baseline.json` freezes the original sources and
measures the exact final camera/viewport (the older `before/metrics.json` timing used
the fixture's initial larger canvas and is not used for the warm comparison).
`apartment.json` records matching cameras, exact routed baseline inputs and both
render scales. `node-tests.txt` records the nine passing model/visit checks.

```sh
node tools/buildfiguresglb.mjs --santa-only
node --test tools/santatest.mjs tools/figuresglbtest.mjs
tools/browsertest.sh node tools/santarealismbaseline.cjs http://localhost:8202 docs/verification/1923
tools/browsertest.sh node tools/santarealismtest.cjs http://localhost:8202 docs/verification/1923
tools/browsertest.sh node tools/santarealismapp.cjs http://localhost:8202 docs/verification/1923
```

Use the existing Playwright/Three0.170 cache via the documented environment paths.
The actual browser reported Chromium156.0.8078.4 / ANGLE SwiftShader, not a hardware
or mobile device. Every browser run used `tools/browsertest.sh` and its shared lock;
this host had no enforceable systemd memory scope, so no memory-ceiling claim is made.
Before-images remain only until the integration owner publishes their pinned issue
comment, then removes them in the resolving commit. Result images have the ordinary
30-day retention. Root owns publication, Pages/Worker evidence, pinned accessible
issue images, final changelog id and closure; this worker only supplies a local Refs commit.

## Root integration

Root opened final side/front/normal/whole, sipping/waving/sleeping, moved sofa,
fallback and matched apartment before/after images and reviewed the combined diff.
The remaining hat-trim scale and hat segment literals were moved unchanged into SANTA.surface.
All body/left-right arm/sitting-sleeping-leg attributes, indices, blush ranges and
the published GLB are exactly identical ([proof and delivered hashes](config-identity.json)).
The capture hashes in component.json remain the measured worker source, explicitly
mapped to this identity-preserving delivery; no new art or broad rerun is needed.

After rebase the LANDSKRONA definition is exactly unchanged from the measured baseline;
all delivered Santa source hashes still match config-identity.json. Changelog id1481
was assigned after the final main fetch. Original-only: no public character/gameplay port.
