# Butterfly surfaces — #1925

Baseline `ad9eab1160e095847280a52c585d221a51b75cf1`. This refines the two existing
ambient colours and the existing wand effect; it adds no species or gameplay.
Original-only chase/magic scope: no public downstream port.

## Result and review

`BUTTERFLY_SURFACE` centralises the authored metre/radian/colour/density guesses.
`butterflymodel.js` supplies a small body/antennae, wing contours, vein/spot markings
and a bounded wing hinge, with corresponding normal rotation. One ambient geometry
is shared by all existing chase companions, including both yellow/orange materials.
The whole body no longer compresses along X. Magic keeps its bright colour identity,
64px painted resource and finite instanced mesh, with a stable body strip and hinged
wing strips. Both collection recipes use their corresponding production surface.

The integration owner reviewed whole/normal/folded views for both colours and actual
magic. Form was then locked. Final source review caught an implementation error:
the former flat quad used scale(s,s,1), which would make a newly folded Z direction
far too large. Final Flutter uses the existing small scale on all three axes. The
owner opened and approved corrected `magic-normal.png` and `magic-close.png`.
No further surface/detail pass followed. Ambient/art/collection source hashes stayed
byte-identical across that correction. The normal and close images now show complete
magic butterflies; earlier clipped/faded diagnostic views were superseded.

Images saved and opened:

- `whole-0/1.png`, `front-0/1.png`, `side-0/1.png`: both actual ambient colours.
- `normal-0/1.png`: actual chase companions beside their cats at approximately 3m,
  on the controlled lawn, without magnifying the insect or changing its scale.
- `folded-0/1.png`: body width retained while both wing pairs fold up.
- `magic-normal.png`, `magic-close.png`, `magic-folded.png`: the actual small instanced
  wand butterflies; the final painted open span is 7.92cm.
- `collection-0/1/2.png`: actual yellow, orange and magic collection recipes.
- Matching source-frozen views are in `before/`; the same whole/front/side/normal
  cameras and open ambient time π/32 are used before/after (closed time0 separately).

## Three scoped risk groups

1. **Visible form:** matched full/normal/side/front/wing-phase views, both ambient
   colours, actual magic size and collection recipes. Whole insects and the normal
   cat-distance view were inspected; no generic model gallery stands in for a consumer.
2. **Actual behaviour/consumers:** the fixture constructs production OutdoorCats and
   Marks, then selects deterministic real brain chase slots for existing Sotis/Findus.
   It uses actual OutdoorCats.step, actual Marks.Flutter spawn/update/fade/pool and
   actual createBestiaryModel, with a flat lawn and calendar/clock inputs. Brain or
   draw functions are not replaced. Near/hidden gates, finite pool12, hidden-surface
   fade and expiry pass. Eight existing brain tests retain season/time/chasing rules.
   Every native attribute, full model matrix and camera/projection/inverse matrix
   is finite. Paired hidden-object renders prove intended pixels in each wing phase
   and each collection recipe; shader errors are also checked. Magic's four-phase
   follow-up transforms every shader-deformed vertex through actual instance/model
   matrices, giving twelve complete posed boxes, zero body deformation and actual
   pixels in each phase. No new cat art, behaviour, network or world timing was added.
3. **Bounded cost:** one ambient call, ≤96 triangles and ≤32KB common raw cache;
   magic retains its two transparent instanced passes, twelve slots and 64px maps.
   Final forms pass all locked limits. The review near ten minutes retained this
   component plan; only the shader/scaling defects and bad close/folded diagnostic
   camera setup justified targeted corrections. Green brain checks were reused.

## Actual submitted and retained costs

| Quantity | Before | Final |
| --- | ---: | ---: |
| Ambient visible insect calls | 1 | 1 |
| Ambient visible insect triangles | 4 | 82 |
| One shared ambient geometry, both colours/all cats | 288B | 9,840B |
| Flutter transparent passes | 2 | 2 |
| Flutter submitted triangles, pool12 /3 live | 48 | 144 |
| Flutter geometry + fade/fold attributes | 188B | 960B |
| Flutter matrix/colour buffers | 912B | 912B |
| Common ambient + Flutter geometry views | 476B | 10,800B |
| Existing ordinary butterfly-mark quad + fade | 380B | 380B |
| Existing ordinary butterfly-mark matrix/colour views | 4,560B | 4,560B |
| Both existing butterfly maps, raw64×64 RGBA | 32,768B | 32,768B |
| Native collection geometry, yellow/orange | 4 triangles each | 82 triangles each |
| Native collection geometry, magic | 2 triangles | 6 triangles |

Renderer counters include the zero-scaled inactive Flutter slots: only three are
live, but all twelve submitted instances remain counted. Double-sided transparency
still makes two passes; it is not reported as one call. No pool/texture-size increase,
extra effect layer, light, image download or per-frame geometry rebuild occurs.
The new per-instance wing attribute adds48 bytes within the960B row. The static
ordinary mark retains its existing60-slot geometry/instance buffers; only its
already-shared butterfly painting recipe changes. Collection owns a transient9840B
ambient or864B magic geometry and its existing own64px magic map when selected;
disposal remains unchanged. Geometry counts are unique native typed-array views,
not estimates of total browser or GPU memory. No new external model/licence applies.

Warm scoped intervals use the same 1200×760 DPR1 component, fixed lights/calendar,
actual consumers and normal cameras, twenty warm frames plus seventy sync samples
with gl.finish. Ambient yellow median/p95: 0.6/1.0ms before, 0.4/0.6ms final; orange:
0.6/1.4ms before, 0.5/1.1ms final. Actual magic: 0.3/0.7ms before, 0.3/0.5ms final.
These short Chromium156.0.8078.4 / ANGLE SwiftShader samples include the unchanged
cat-pose work and establish no native-GPU/phone FPS, reliable speed-up or startup
improvement. No physical device or enforceable cgroup memory ceiling was tested.

Final magic deformed bounds: maximum full world-box axis0.12661m (including the
transparent quad corners), maximum local folded depth0.03399m across the twelve
sampled live poses. The depth guard is≤0.045m and each full box axis≤0.13m. Painted
open width is0.0792m; the former unused Z=1 would fail the depth bound. At normal
view the four phases contribute4,674–4,944 intended pixels; all body vertices remain
undeformed. Ambient normal views contribute433 insect pixels for each colour.

## Reproduction and source binding

`checks.json` contains the frozen before and final after source SHA256s, real pose
pixels, gates/pool/fade, raw buffers and timings. `magic-posed-bounds.json` records
all twelve fully deformed boxes and final source hashes. `brain-tests.txt` contains
eight passing behaviour checks. The baseline magic collection triangle diagnostic
was corrected to use its six indices, rather than four positions divided by three.

```sh
node --test tools/outdoorcatbraintest.mjs
tools/browsertest.sh node tools/butterflyrealismtest.cjs http://localhost:8203 docs/verification/1925
tools/browsertest.sh node tools/butterflymagicboundstest.cjs http://localhost:8203 docs/verification/1925
```

The static server must serve this checkout, with the existing local Three0.170 and
Playwright cache; use the documented PLAYWRIGHT_MODULE/CHROME_PATH settings.
Every browser run used the shared wrapper/lock. A stopped owned server caused one
capture-only connection refusal; it was restarted and that incomplete capture was
not used. No broad apartment timing/profile or new gameplay regression chain ran.
Root owns final publication, provisional changelog renumbering, actual Pages/Worker
results, pinned HTTP200 issue images and closure. Before-images are removed only in
that resolving commit after their pinned issue comment; result images retain the
ordinary thirty-day policy. This worker supplies only a local Refs handoff.
