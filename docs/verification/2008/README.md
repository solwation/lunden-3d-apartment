# #2008 – invalid animal-index portrait cache recovery

Baseline: `5627ecb94bcf8086d27f0bb7dc14e34bae997a8a` (fresh original main).
Previous fixes inspected: #1900 (`8f61ee0d`) and #1984
(`da739a01a32f48d1e4a8951511f31c4752abbb63`). The latter corrected the
DPR-scaled target viewport and introduced portrait revision 2; it pre-rendered
models before opening its test-mode index. This check instead opens the actual
normal-start BinderPanel, sharing the actual world's renderer and IndexedDB provider.

## Finding and bounded change

Normal cold startup **already works** on this machine. `before-index.png` shows
recognizable known cats and intended unknown silhouettes at DPR 1.5. This is not
proof of what happened on the user's device.

A concrete persistent blank-image failure was reproduced: a correctly sized but
fully transparent PNG at a *current* `bestiaryThumbs` key is blindly accepted as a
hit, assigned to the DOM and never rendered again. Seeding 21 such cat rows (the
first 14 are actually visible) produced `before-empty-cache-index.png`: every
visible image has zero alpha pixels, with **zero new renders**. Discovery metadata
was unchanged. These are explicit diagnostic fixtures, not the user's exported cache.

The provider now decodes disk PNGs and checks their dimensions and nonzero alpha
before accepting them. Invalid entries are replaced individually at the **same
revision-2 key**; valid entries keep their existing pixels and avoid rendering.
New empty GPU readbacks throw before entering disk or memory cache, so a transient
failure cannot become a permanent successful blank hit. A failed render can retry
on reopening. No storage reset, photo import, collection migration, model or UI
change was made. Only disposable generated portraits are written.

The exact cause of the user's original blank data/device remains unproven. This is
a grounded recovery fix for an observed cache failure, not a claim to reproduce a
physical phone, all GPUs, failed network models or every partially cropped image.
No downstream transfer applies: this personal animal collection/gameplay is excluded
from `kvarteret-lunden`. House variants A/B/C/L do not have separate binder paths;
the fix is in their one shared collection provider, with no geometry/layout change.

## Checks actually run

1. `node --test tools/bestiarytest.mjs`: **7/7**, 179 ms; collection reload,
   concurrent/transactional photos, blocked storage, pinned profiles and photo queue.
   Raw output: [node.txt](node.txt).
2. **One held browser turn**, 2026-11-16 approximately 10:36–10:44 UTC,
   through `tools/browsertest.sh`, Playwright Chromium 1248/SwiftShader. Viewport
   1000×760, deviceScaleFactor 1.5, normal `testMode=null`, no `shot` override.
   URL `/?cloud=&mp=0&time=12&month=7&freeze`; five saved discovery rows (four
   cats and perch). Browser headless startup normally skips warm-up; this does
   not exercise physical-device warm-up or mobile CPU-buffer release.
   World animation was stopped once startup exposed `__app`, while native DOM,
   idle callbacks, observers and provider work remained live. This avoids a broad
   world sweep. Raw phases: [actions.jsonl](actions.jsonl).
3. `node --check` on the provider and both new browser files, plus
   `git diff --check`: pass. [sources.json](sources.json) pins the final checked
   production/check source bytes. Baseline diagnostic images use the baseline
   source above, before the provider edit.

Browser results ([cache-renderstate.json](cache-renderstate.json)):

- Actual visible first page: all 14 DOM images contain 1,413–2,101 nontransparent
  pixels; both visible discovered cats have coat color pixels. No isolated portrait
  or `img.src` assertion substitutes for this check. Unknown entries remain silhouettes.
- All 21 seeded blank rows are overwritten with real pixels at their existing keys.
- Close/open after evicting only the provider's memory cache: valid disk rows are
  reused with **0 new renders**.
- Scroll to the real perch tile: 787 nontransparent pixels, 775 colored pixels.
- Fresh 320px cat portraits while world pixel ratio is .6 and 2: each has 23,439
  nontransparent pixels. Nondefault scissor, clear alpha/color, viewport, target,
  autoClear, shadows/XR flags and renderer counters are restored exactly.
- Deliberately suppressing the renderer's draw produces an empty fresh readback:
  it rejects, stores nothing in either cache, and still restores render state.
- Discovery metadata is byte-identical across the repair. A pre-existing photo-store
  sentinel row is byte-identical; this is a write-preservation guard, **not** a visual
  encounter-photo album test. The fixture sentinel is deliberately not imported as
  a collected photo.

A further normal page reload within that same browser turn proves repaired disk
entries persist: **0 renders, 21 hits**, all 14 visible images still contain real cat
pixels ([persistence.json](persistence.json), `after-reload-index.png`). The isolated
browser context seeds the same five discovery fixtures on navigation; byte identity
is checked before reload, and the final loaded metadata matches those saved values.
No real user's data was accessed or cleared. The PR .6/2 cases are world-renderer
resolution checks, not physical-phone or phone-distance-policy emulation.

[errors.json](errors.json) contains three unspecific resource-404 console messages
(one per normal startup); the driver did not capture their URLs. No page exception
was recorded. All tested image resources decoded and pixel assertions passed.
The stopped world loop leaves an unrelated corner QR badge visible in the final
screenshots; it does not cover any checked cat image.

## Reviewed result images

All four images were saved in the same browser turn and visually inspected. The two
baseline captures were moved into `before/` before commit; raw action records retain
their original capture filenames:

- [Working cold baseline](https://github.com/solwation/lunden-3d-apartment/blob/e1e612fafe58c3619e9ee218f6850fb379bd6a87/docs/verification/2008/before/before-index.png): known cats and unknown silhouettes.
- [Reproduced current-key blank cache](https://github.com/solwation/lunden-3d-apartment/blob/e1e612fafe58c3619e9ee218f6850fb379bd6a87/docs/verification/2008/before/before-empty-cache-index.png): empty cat art.
- [Selective cache repair](after-repaired-index.png): actual visible cat art restored.
- [Normal reload, persisted valid cache](after-reload-index.png): same cat art, no new renders.

## Repeating the focused check

Start `python3 tools/devserve.py 8808 .`, then use a **fresh control prefix**:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_MEM=5G BROWSERTEST_TIMEOUT=20m \
  tools/browsertest.sh node tools/binder2008browser.cjs \
  http://127.0.0.1:8808 docs/verification/2008 /tmp/binder2008-new
```

The held driver reads `<prefix>.command` JSON (`id`, `code`, optional `shot` or
`reload`) and writes results/phase history. Seed transparent 96×96 PNGs for the
first 21 cat entries through `__app.bestiaryImages.store('bestiaryThumbs',
'readwrite', s=>s.put({id:key,data:blank}))`, where
`key = id + ':' + modelVersion + ':96:' + PORTRAIT_REV`. Seed the preservation
sentinel `{id:'2008-preserved-photo',data:'preserve-test-sentinel'}` in `bestiaryPhotos`.
Use a reload to start a fresh provider; call
`import('/tools/bestiarycache2008check.js').then(m=>m.verify(__app))` and save
its first-page screenshot. Reload once more and call the exported `reopen(__app)`;
assert `renders===0` and inspect its visible image pixels. With baseline source the
seeded first-page pixels are zero; with the fix they are replaced in place.
Create `<prefix>.release` to stop. Stop the server too. Both owned processes were
stopped and the browser wrapper released before this delivery.

## Root integration

Rebased onto a05683d4 after the unrelated body delivery. All eleven checked
source files are byte-identical to sources.json; [integration.json](integration.json)
records parity and image hashes. Root reviewed the provider, actual browser harness,
metadata/photo preservation and result images. Existing passing evidence is reused;
no broad normal-app bootstrap is repeated for the unrelated body rebase.

Before-images were published and embedded in the issue comment before closure,
pinned to e1e612fafe58c3619e9ee218f6850fb379bd6a87. They are removed in the resolving commit; links above remain.
