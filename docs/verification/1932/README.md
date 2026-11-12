# #1932 — web hand fixture roof contract

The controlled roof stub omitted `overhead`, which `Player.climbStep` calls before moving along a wall. The real `Roofs.overhead(x,z,y)` returns `{surface,y}` for the closest surface above the player, or `null` when there is none. This fixture already represents open sky (`above` returns `Infinity`), so its matching `overhead` result is `null`.

Only that method and its explanatory comment were added to `tools/webhandstest.cjs`. Every assertion and the remainder of the test stay unchanged. Player, Roofs, Hand, SpiderSuit, World and product configuration were not changed. This is an original-project gameplay test; no public port, changelog or new product image applies.

## Reproduction and full CLI

Base: `d8c2c703b8226ba9cf29215b062d612b5d4bdef2`. Owned checkout server: `python3 tools/devserve.py 8201`. It rewrites the response import map to locally cached Three.js 0.170.0 without editing `index.html`. The shared browser wrapper selected installed full native Chromium and serialized browser access. It reported no systemd user scope, so this run had no cgroup memory ceiling.

The same complete command ran before and after, changing only the output directory:

```sh
PLAYWRIGHT_MODULE=/home/devcontainers/kvarteret-lunden/node_modules/playwright \
  tools/browsertest.sh node tools/webhandstest.cjs \
  http://localhost:8201 docs/verification/1932/before
# then the identical command with docs/verification/1932/after
```

| Run | True CLI exit | Completed checks | Outcome |
| --- | ---: | ---: | --- |
| Before | 1 | 20 | Aborted entering climb: `TypeError: R.overhead is not a function` |
| After | 0 | 26 | `ALL PASS 26 checks, 0 FAIL`; all eight phases completed |

The before-run `result.json` and `completion.json` misleadingly contain zero assertion failures: the asynchronous exception occurs after those 20 checks and is handled by the outer CLI catch. The saved shell exit status and full log capture this distinction. The fix does not alter the reporter.

## Two scoped verification groups

1. Contract and scope: read actual `Player.climbStep` and `Roofs.overhead`; verified the source delta is precisely the open-sky stub method plus comment, with all other test bytes and all product sources unchanged. The first six before/after result records compare exactly as parsed JSON. See `contract-proof.json` and the run-specific `source.json` files.
2. Full native component test: actual Player, SpiderSuit and Hand complete rest, shoot, ground/air/right/up swing, climb and held phases. Existing assertions verify finite wrists and worn save state, ray/palm origins, both swing/climb hands, web morph, same-frame feed and held-item priority with unchanged whole model matrix. No page errors; WebGL was deliberately forbidden in this native numeric/visibility-state test. Browser close completed and matching recorded test-owned process identities are absent after both CLI exits (`before/cleanup.json`, `after/cleanup.json`). The owned dev server was stopped afterward (`server.json`).

This does not claim rendered pixel quality, full World behavior, physical-phone behavior, performance or a new slab/canopy collision regression test. No broad or historical test chain was run for the one-method fixture repair.

Root reviewed the exact one-method fixture delta, full before/after CLI evidence and native contract. [Rebase mapping](integration.json) proves the test and all actual native consumers exact, with only unrelated Pingping/SMALL_FIGURES configuration additions (trailing blank normalized). Both green scoped groups are reused; no broad rerun. This test-only commit has no new product image or changelog.

[Publication record](https://github.com/solwation/lunden-3d-apartment/issues/1932#issuecomment-6821946883) for `f3f5ae145854bd40ecfe5e3ecd8cdb814142e5a0`: [Deploy to GitHub Pages](https://github.com/solwation/lunden-3d-apartment/actions/runs/43206486559): success
