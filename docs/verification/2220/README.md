# #2220 birdstest.cjs: two checks failed on main

Test: `PLAYWRIGHT_MODULE=... tools/browsertest.sh node tools/birdstest.cjs http://localhost:8560 /tmp/s2220`

## Causes

1. **"same flock every visit (seeded)" - outdated test, not a game bug.** The test compared `birds.mesh.geometry.attributes.aSeed`.
   Since the exclusive near/far LOD batches (a25c85ec, #1924) that attribute is rewritten every frame (birds sorted into the far/near batch
   by camera distance), so two page visits differ. The seeded source data is `birds.seeds` (`a`, `b`; fixed mulberry32 seed 1252) and is
   identical between visits. Fix: the test compares `birds.seeds`.
2. **"update() does not allocate per call" - a real regression plus a noisy measurement.**
   - Measurement: `performance.memory.usedJSHeapSize` deltas swing wildly (+13.7 MB / -1.5 MB / 6.8 MB for identical runs; a young-gen GC
     mid-run makes the delta meaningless), so a fixed limit cannot work. The test now uses the CDP sampling heap profiler
     (`includeObjectsCollectedBy{Minor,Major}GC`, 2 KB interval, 4000 warm-up calls, 5000 measured calls) with a positive control, and
     bounds bytes per call.
   - Real cause (6c03c9ad, #2129, small birds): `birdThreats()` in src/main.js computed `parkGround(cat.x, cat.z)` for every outdoor cat that
     is out on every call, and `Birds.update` calls it twice per frame (gulls/small birds and corvids, the latter added in 4d13c926, #2196).
     `groundY` -> `riverAt` misses its one-entry cache for each new point and clones/builds result objects: about 90 KB per update with 13 cats
     out. Fix: the cat's ground height is recomputed only when the cat moved (src/main.js).
   - Also: `FlockBase.danger` (src/birdflock.js) used nested for-of (iterator objects) in the innermost loop; now indexed loops
     (small, same behaviour; `tools/birdflocktest.mjs` 8/8 pass).
   - Remaining ~14 KB per call is V8 boxing of doubles and for-of iterators in `step()`; not an object leak, left alone (out of scope).

## Before / after (same new test, only src differs)

Before (src of the branch base, new test): `FAIL update() allocation stays small per call 106797 bytes per call over 5000 calls (limit 40000)`
After: `PASS update() allocation stays small per call 14525 bytes per call over 5000 calls (limit 40000)`

Original test on main, before any change (two FAIL lines):
```
FAIL same flock every visit (seeded) 
FAIL update() does not allocate per call 6822768 bytes over 20000 calls
SOME FAILED
```
Final run, all checks (src + test changed):
```
PASS exclusive LOD batches contain all birds {"n":10,"inst":10,"tris":12,"nearTris":240,"lights":0}
PASS bounded far and near triangles per bird {"n":10,"inst":10,"tris":12,"nearTris":240,"lights":0}
PASS visible by day in clear weather {"visible":true,"fade":1,"rain":0,"overcast":0,"above":0}
PASS exactly one draw call 
PASS animation time advances 
PASS same flock every visit (seeded) 
PASS heap sampler sees allocations (positive control) 341504 bytes
PASS update() allocation stays small per call 14525 bytes per call over 5000 calls (limit 40000)
PASS hidden at night {"visible":false,"fade":0,"rain":0,"overcast":0,"above":0}
PASS back by day 
PASS hidden when far from the area {"visible":false,"fade":0,"rain":0,"overcast":0,"above":0}
PASS hidden in rain {"visible":false,"fade":0,"rain":0.8,"overcast":1,"above":0}
PASS hidden inside the cloud whiteout {"visible":false,"fade":0,"rain":0.8,"overcast":1,"above":0}
PASS visible above the clouds {"visible":true,"fade":1,"rain":0.8,"overcast":1,"above":1}
PASS high flock on above the deck 
PASS fewer birds on phones (&lowmem) 5 < 10
PASS &nobirds turns them off 
ALL PASSED
browsertest: peak 3401 MiB of 4G
```
No visible change, so no screenshots and no changelog entry.
