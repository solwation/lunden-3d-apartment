# #1937 — canonical ghost item test cases

`tools/ghostitemtest.cjs` duplicated a stale list of 17 category keys. The actual fixture and protocol whitelist already had 18, including `sharkfin`. Consequently the old test interpreted sharkfin (index 17) as none, interpreted the real empty case (index 18) as its weapon case, omitted the actual weapon row from that assertion, and required 17 category draws despite rendering 18.

The test now reads `HELD_CATEGORIES` from its production pure-data module. The component page assigns explicit keys to canonical category cases and separate none, weapon and unknown cases, so negative checks use named mappings. Added rendering diagnostics check finite model/camera matrices, complete proxy vertex projections and geometry attributes, ancestor visibility, actual submitted draws, and actual RGB pixel differences when only the intended proxy is hidden at the identical pose/camera. A visible avatar or an unrelated prop cannot satisfy the target-pixel assertion. Empty/unknown/far and weapon-suppressed category proxies must have zero target pixels and draws. The actual saber is checked separately: its hilt and separately lit blade contribute two existing draws and visible pixels.

Only `tools/ghostitemtest.cjs` and `tools/ghostitem.html` changed. The protocol, product models/recipes, Ghost behavior, avatar, configuration, assets and services are unchanged (`product-source-identity.json`). This multiplayer gameplay fixture is original-only: no public port or changelog applies.

## Reproduction and complete CLI

Base: `f3f5ae145854bd40ecfe5e3ecd8cdb814142e5a0`. An owned `python3 tools/devserve.py 8201` server served this checkout and locally cached Three.js 0.170.0 through `/__three/`; production import maps were unchanged. The shared wrapper selected full native Chromium and serialized browser access. It reported no systemd user scope, so no cgroup memory-ceiling claim applies.

```sh
PLAYWRIGHT_MODULE=/home/devcontainers/kvarteret-lunden/node_modules/playwright \
  tools/browsertest.sh node tools/ghostitemtest.cjs \
  http://localhost:8201 docs/verification/1937/before
# Same full CLI after the fixture fix, with docs/verification/1937/after as output.
```

| Run | CLI exit | Actual category proxy draw delta | Outcome |
| --- | ---: | ---: | --- |
| Original fixture | 1 | 40 − 22 = 18 | Fails stale none/index and 17-draw expectation |
| Final fixture | 0 | 41 − 23 = 18 | 87 checks pass, no console/page errors |

Final mapping is all 18 whitelist categories, none at 18, weapon at 19, unknown at 20. The extra unknown avatar adds one baseline avatar draw; each of the same 18 category proxies remains one draw. Fish is the existing 161-triangle proxy under its intentional 180 cap; sharkfin is 66 under 80. Other category caps remain 80. `mapping.json` lists every category, wire input, cleaned value, actual model, triangles, submitted calls and pixel count.

An initial fixture candidate added unknown without fitting the overview camera: the leftmost proxy was culled, producing 40 − 23 = 17 despite all 18 close-up target tests passing. `initial-fixture/` retains its source/log/result/exit. The fixture overview now fits the case-row length. A subsequent added weapon assertion initially assumed one saber draw; reading `ghostProp('saber')` confirmed the existing separate hilt/blade meshes, so the assertion was corrected to their two-draw contract. Neither finding required any product change.

## Two scoped verification groups

1. Canonical source, mapping and boundaries: no duplicate category list; all actual 18 keys are exercised; keyed none/weapon/unknown cases verify cleaned wire state and effective model visibility. The exact product tree is unchanged. Per-run source hashes bind both fixture and relevant product files. Before/after full CLI logs and shell exit files retain the true outcomes.
2. Whole focused actual-Ghost component CLI: all model/camera matrices and proxy vertex projections remain finite; all 18 intended proxies are effectively visible, intersect the viewport, submit exactly one draw each and change 1,803–19,831 real pixels when toggled. None, unknown, weapon-suppressed cup and far fish contribute zero proxy draws/pixels. The actual saber contributes 4,119 changed pixels and two draws. Far state remains finite with all category proxies hidden. Persistent-context close completes, the temporary profile is removed, no process with that exact profile remains, and the owned server is stopped (`completion.json`, `cleanup.json`, `server.json`).

Opened representative result images: [whole row](after/ghostitem-all.png), [fish](after/ghostitem-fish.png), [sharkfin](after/ghostitem-sharkfin.png), [weapon](after/ghostitem-weapon.png). The whole row is the representative normal component view and shows every intended category. Individual images are diagnostic hand close-ups with neighboring avatars and cropped bodies; the close sharkfin tip extends beyond its crop, while the complete fin appears in the whole-row view. All 18 category captures and three negative captures are retained. No art was changed, and these checks make no full World, multiplayer transport/service, performance or hardware-FPS claim.

Root reviewed the combined fixture/CLI/evidence diff and opened before/after whole rows plus fish/sharkfin/weapon diagnostic images. [Integration identity](integration.json) proves all seven executed sources and all captured worker evidence exact after rebase. Current product integrations are retained with no product diff. The two green groups and true fullCLI87checks/exit0 are reused without broad reruns. Close-up crops remain diagnostic only.
