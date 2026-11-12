# Manufactured small figures — #1928

Baseline `e054d606a6e98a557e7182cf98b50ce27cd987b0`, measured before art.
Scope: secretary ceramic owl, crocheted desk mascot in both straight/corner desks,
MALM unicorn lamp, ALEX craft-table unicorn, secret-drawer dinosaur, brick figure
and miniature rubber duck. These are personal manufactured props, not living
animals or exact product replicas. No public downstream transfer applies.

The retained [owl photograph](../../miele-foto-ram.jpg) and
[desk photograph](../../datorsetup-secretlab-batman.jpg) were opened. The owl's
squarer continuous ceramic body, broad eye discs and brown/beige floral glaze,
and the mascot's stitched surface guide the bounded proposal. No separate retained
unicorn product photograph was found; its existing white/pink/gold identity is
retained with restrained face/body/ear/tail detail, without a product-match claim.
The first combined proposal was reviewed by root and frozen. No later art pass.
All new art/material/tessellation guesses are centralized in `SMALL_FIGURES`;
existing placement anchors and lamp/light settings stay in their original config.

## Budget locked before the form pass

Per actual separated figure: no more submitted calls than before, <=2× triangles,
<=1.5× unique raw geometry bytes; no new light, shadow pass or per-frame geometry.
At most one shared 256px procedural texture, separately accounted. Brick figure
specifically <=144 triangles/6,600 bytes and three existing colour materials.

| Actual figure | Submitted calls before → after | Triangles before → after | Unique raw geometry bytes before → after |
|---|---:|---:|---:|
| Ceramic owl | 4 → 3 | 234 → 264 | 21,200 → 10,480 |
| Straight desk mascot | 3 → 3 | 1,704 → 1,068 | 152,208 → 102,528 |
| Corner desk mascot | 3 → 3 | 1,704 → 1,068 | 152,208 → 102,528 |
| Unicorn lamp | 16 → 16 | 6,424 → 4,568 | 169,648 → 144,712 |
| ALEX unicorn | 3 → 3 | 4,132 → 2,056 | 396,352 → 212,392 |
| Drawer dinosaur | 1 → 1 | 364 → 424 | 34,944 → 44,520 |
| Brick figure | 3 → 3 | 72 → 138 | 4,400 → 3,300 |
| Mini duck | 2 → 2 | 448 → 416 | 42,688 → 41,236 |

The lamp really has sixteen unmerged meshes; six materials are not six draws.
The desk mascot's two materials occupy three batches because its seam rings have
separate shadow flags. New brick parts retain welded indexed geometry in their
three colour batches instead of expanding into non-indexed static copies. Painted
faces reuse existing batches through normalized uint8 vertex colour attributes.
The owl shares eye/beak materials, reducing its four batches to three.

## Actual furniture and retained resources

Same actual factories and visible parts, closed drawers/flap, ordinary state,
matched whole-furniture camera, 1200×750/DPR1, no fixture shadow map:

| Actual whole furniture | Submitted calls before → after | Submitted triangles before → after | All retained raw geometry bytes before → after |
|---|---:|---:|---:|
| Secretary, including kept contents | 100 → 99 | 7,401 → 7,431 | 778,800 → 775,104 |
| Straight desk | 18 → 18 | 11,902 → 11,266 | 2,261,264 → 2,161,904 |
| Corner desk | 18 → 18 | 12,246 → 11,610 | 2,261,264 → 2,161,904 |
| Unicorn MALM | 59 → 59 | 30,596 → 28,740 | 3,584,408 → 3,559,472 |
| ALEX | 41 → 41 | 23,708 → 21,632 | 2,376,552 → 2,192,592 |

Actual renderer submissions include material passes and frustum culling. Retained
geometry includes invisible drawer contents and both desk variants; those bytes
are not an assertion that hidden parts draw. The two desk rows share one factory
instance with both retained variants and must not be summed as independent memory.
Across the union of actual factories/kept trinkets/contact shadows, all unique
TypedArray backing buffers total **9,001,140 → 8,689,188 bytes**, deduplicated by
identity. The fixture's isolated inspection copies and hand are excluded from this
furniture union. Actual low-memory cleanup retains 6,428,040 geometry bytes after
these same current components upload; no baseline low-memory saving is claimed.

The sole new texture is one shared cached 256×256 CanvasTexture for ceramic and
yarn, **262,144 source RGBA bytes**, **349,524 estimated GPU RGBA8 bytes including
all mip levels**. Existing plus new source bitmaps total 820,288 → 1,082,432 RGBA
bytes; unique textures 7 → 8. This estimate is not measured driver allocation.
The atlas intentionally retains its bounded source for sharing/re-upload, rather
than freeing a bitmap that cached materials still need. No image/model file,
network asset, GLB, new light, animation loop or per-frame allocation was added.
Factory-created geometry remains under existing furniture/scene lifetime; this
change adds no independent dispose loop or asset fallback. No attribution change.

Forty warm CPU `renderer.render` submissions after ten warmups per same furniture
case give median/p95 ms before → after: secretary 0.4/0.8 → 0.5/1.0; straight desk
0.1/0.2 → 0.2/0.3; corner 0.2/0.3 → 0.3/0.5; MALM 0.3/0.5 → 0.4/0.5; ALEX
0.4/1.1 → 0.2/0.4. These coarse local headless browser timings neither isolate GPU
execution nor establish a speedup, phone performance or FPS. No whole-World run.

## Real consumers, contacts and pixels

The harness uses `buildFurniture`, both actual `tillydesk` variants, `Trinket`,
`SecretDrawer` and `Hand`. Read-only response instrumentation captures actual desk
and ALEX figure parts immediately before their production static merge; there is
no independently authored gallery copy. Lamp/owl/toys come from the actual built
furniture/thing records. The production interaction/save/held-category/hand code
is unchanged. Other players still receive the documented generic `box` proxy for
Trinkets; no protocol or new remote figure model is introduced.

Actual take/return restores the exact parent/local home pose for all four movable
figure types. Held pose vectors are identical before/after; full model/home/hand
and camera matrices and actual automatic grip points are finite and retained in
the JSON. Put-down uses the real secretary flap plane and existing rest semantics:
all four models keep the existing 1 mm surface clearance. ALEX unicorn minimum Y
is exactly **0.7595000267 m** before/after on the **0.760 m** tabletop, retaining the
old 0.5 mm penetration. Its apparent floating in a shadowless diagnostic image is
not a lifted model. No hand scaling, furniture movement or toy enlargement.

Ordinary and held views use the app's **72° FOV**. Isolated front/side/quarter and
whole-furniture diagnosis use **40°**, with matched before/after camera matrices.
A depth-tested white target mask counts intended model pixels after occlusion,
not background/other furniture. Normal figure pixels before → after: owl
2,480 → 3,453; straight mascot 711 → 757; corner mascot 182 → 157; lamp
3,270 → 3,332; ALEX unicorn 684 → 911. Corner's inherited behind-monitor position
really obscures it; the side-standing normal camera does not move the figure.
Drawer-home dinosaur 246 → 237, brick figure 78 → 93, duck 117 → 134; held owl
15,481 → 20,806, dino 3,329 → 3,188, brick figure 788 → 935, duck 1,414 → 1,601.
This is an improvement to small props, not a claim of large details at room scale.

All mesh/index/attribute data and complete matrices were checked for finiteness.
Shadow-flag batches are preserved, including ALEX white/pink receiving shadows,
gold only casting, and the desk's separate non-casting seam batch. Lamp shade
colour/emission, object/light target identity, height, light config, keep list,
thing names/secret IDs and both desk footprints match baseline. The actual
`?lowmem` upload, secret-home/held/placed and redraw run also passes without canary
or runtime errors and submits the same current figure calls/triangles.

## Opened result images

The worker opened the combined [front/side/quarter sheet](result-contact-sheet.png),
all whole furniture images, normal views, drawer homes and actual held/contact
views. Root opened all first quarter and five normal proposals before locking.

| Prop/consumer | Before | Result | Normal/actual consumer |
|---|---|---|---|
| Owl | [quarter](before-owl-quarter.png) | [quarter](final-owl-quarter.png) | [normal](final-owl-normal.png), [held](final-owl-held.png) |
| Straight desk | [quarter](before-desk-quarter.png) | [quarter](final-desk-quarter.png) | [normal](final-desk-normal.png), [whole](final-desk-whole.png) |
| Corner desk | [quarter](before-corner-quarter.png) | [quarter](final-corner-quarter.png) | [side-standing normal](final-corner-normal.png), [whole](final-corner-whole.png) |
| Lamp | [quarter](before-lamp-quarter.png) | [quarter](final-lamp-quarter.png) | [normal](final-lamp-normal.png), [whole](final-lamp-whole.png) |
| ALEX unicorn | [quarter](before-unicorn-quarter.png) | [quarter](final-unicorn-quarter.png) | [normal](final-unicorn-normal.png), [whole](final-unicorn-whole.png) |
| Dino | [quarter](before-dino-quarter.png) | [quarter](final-dino-quarter.png) | [actual drawer](final-dino-home.png), [held](final-dino-held.png) |
| Brick figure | [quarter](before-lego-quarter.png) | [quarter](final-lego-quarter.png) | [actual drawer](final-lego-home.png), [held](final-lego-held.png) |
| Mini duck | [quarter](before-duck-quarter.png) | [quarter](final-duck-quarter.png) | [actual drawer](final-duck-home.png), [held](final-duck-held.png) |

[Full gallery](gallery.html); [whole secretary](final-owl-whole.png);
[low-memory held owl](lowmem/lowmem-owl-held.png).
Corresponding `before-*` and `final-*` front/side/normal/home/held/placed/whole files
are retained for review. Before PNGs are transient evidence for root to publish as
pinned HTTP200 URLs before deletion in the resolving commit. Results follow normal
30-day retention. Proposal duplicates are not part of the final evidence set.

## Reproduce and limitations

Source hashes, full inputs/matrices, actual renderer counts, retained buffers,
consumer contracts, pixels and timings: [baseline](before.json), [current](final.json),
[low-memory](lowmem/lowmem.json), [comparison checks](checks.json).
Three r170, Chromium156.0.8078.4, 1200×750 renderer in a 1200×800 page, DPR1.
The existing local Hand server utility is reused without changes:

```sh
python3 tools/hand-realism-server.py --three /path/to/three --baseline e054d606a6e98a557e7182cf98b50ce27cd987b0 --port 8202
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=90s bash tools/browsertest.sh node tools/props1928.cjs docs/verification/1928 before
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=90s bash tools/browsertest.sh node tools/props1928.cjs docs/verification/1928 final
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=90s bash tools/browsertest.sh node tools/props1928.cjs docs/verification/1928/lowmem lowmem lowmem
node tools/props1928-check.cjs docs/verification/1928
```

Three scoped check groups cover matched visual/contacts, real consumers/finite data
and actual submissions/resources/timing. Full producer file hashes deliberately
fail if another integration changes those files; compare the bounded figure/config
regions explicitly when rebasing unrelated furniture/config work, rather than
claiming stale whole-file evidence. No browser hardware/phone benchmark, full app
save round trip or deployment was run by this worker. Root alone owns integration,
publishing, actual Pages/Worker gates and final pinned image comment/closure.

Root reviewed the complete production/config/fixture/evidence delta and opened the final front/side/quarter sheet, actual drawer/held brick figure, held owl, corner normal and whole ALEX. [Integration mapping](integration.json) preserves every captured furniture/desk/figure/fixture and evidence file exactly. Entire config is exact after substituting only current-main PINGPING and SHARK declarations, unrelated to these selected furniture factories. All other model integrations remain exact current main. Thus the three green groups/255 comparisons are reused without calling the intentionally stale whole-config hash green. Changelog1488 follows latest main.
