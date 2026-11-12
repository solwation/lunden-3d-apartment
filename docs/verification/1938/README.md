# Butterfly collection cache renewal — #1938

Three butterfly metadata registrations now declare `modelVersion:2`: yellow,
orange and magic. Their new #1925 geometry was already delivered, but an existing
version1 thumbnail key returned its old picture before the renderer could run.
Only these metadata fields and the explanatory changelog change product behavior.
No geometry, materials, shaders, animation, model IDs, discovery or photo data change.

## Two scoped verification groups

1. [Source proof](source-proof.json): removing only the two textual version additions
   makes both registration modules exactly baseline990e8914. Every geometry/factory,
   image-cache implementation, collection/store and config file is exact. Existing
   [reviewed #1925 form/consumer results](../1925/README.md) remain applicable without
   a new art pass or broad World/performance rerun.
2. [Actual browser/IndexedDB result](cache.json): three successive pages in one
   isolated browser context use real `BestiaryImages`, `BestiaryCollection`, `withStore`
   and offscreen WebGL rendering. Old sourceac2fd0ea renders six actual version1
   thumbnails (three species ×96/320), records all discoveries and stores one generated
   image through the real personal-photo writer. Current geometry with baseline
   metadata1 then reproduces the bug: six persistent hits, zero renders and all six
   image hashes exactly old. Actual fixed metadata2 renders six fresh pictures with
   six different hashes while retaining all six old rows (12 keys total). Repeat
   requests hit memory six times; a fresh provider hits persistence six times with
   zero renders. All metadata besides the version, discovery localStorage, found
   flags and the stored photo remain exact. Synthetic photo data was compared exactly
   and replaced with its SHA256 in the saved text evidence.

Every actual render checks complete model/local/world and camera/world/inverse/
projection/inverse-projection matrices plus geometry/index attributes for finiteness.
Each image has more than20 intended opaque pixels against a transparent target.
The whole focused browser command exits0 without page errors. Root opened the old,
stale and renewed six-image grids at their actual96/320sizes.

| Actual cache phase | First renders / hits | Stored thumbnail keys | Repeat memory / fresh persistent hits |
|---|---:|---:|---:|
| Old geometry +version1 | 6 /0 | 6 | 6 /6 |
| New geometry +version1, bug | 0 /6 | 6 | 6 /6 |
| New geometry +version2, fixed | 6 /0 | 12, old six retained | 6 /6 |

[Old actual cache](before-old-cache.png), [stale despite new geometry](before-bug-cache.png),
[renewed actual images](cache-renewed.png). The last grid shows precisely the existing
#1925 form, rather than another model redesign. Two own before-PNGs are transient;
root pins them in the issue before pruning in the resolving commit. Result images
follow the30-day retention policy; text/JSON remain.

The change performs at most one fresh image render per requested new key. Closed
binder/cache hits add no World draw or per-frame work. Old cache rows are deliberately
retained by the existing disposable cache; no unmeasured total-memory, startup,
phone/FPS or speedup claim is made. No GLB or new product texture is added.
This is original-only butterfly/gameplay content with no public port.

Reproduction with an owned server and shared browser lock:

```sh
python3 tools/devserve.py 8204
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=2m tools/browsertest.sh node tools/butterflycache1938.cjs docs/verification/1938
```

The tool freezes the old rendering modules at40-character sourceac2fd0ea484bf7e905fb92d6bb9bb6ae40f005f3
and the buggy registrations at990e8914b036b608c104e5b014b7553a4595569d. It never clears
player storage and uses a new temporary browser context. Saved source hashes bind
all executed files. The owned8204server was identified by exact command/cwd before
SIGTERM; browser and shared lock completed normally. No other worker process was touched.
