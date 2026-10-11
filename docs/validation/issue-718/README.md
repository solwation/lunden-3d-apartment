# Beer shelf snapshot startup fallback (#718)

Before: `a90bbb6`, original `src/beershelfdata.js` injected into the same focused fixture, reproduces `beer shelf timeout` rejection after the local request stalls. After: the modified production module passes all 25 checks in `tools/beershelfcachetest.html` in real headless Chrome, without WebGL; no page errors or unhandled rejections.

The test covers local request/body timeout and abort, network/HTTP/JSON/schema/image-decode failures, uncached empty runtime fallback with no successful timestamp, a successful live batch despite concurrent local failure, delayed image callbacks and CPU startup stall/late promise handoff, atomic complete-cache preservation, daily retry and actual page reload. Actual `BeerShelf` construction accepts the empty result and produces four package label textures for a successful batch. The displayed label evidence is its actual CanvasTexture canvas, not a rendered apartment screenshot.

Production changes are limited to `src/beershelfdata.js`. Snapshot network deadlines remain bounded; already-local image decoding retains #711's behavior. No config, renderer, loading screen or main bootstrap changes. Full apartment startup, multiplayer chat bootstrap and physical-phone startup were not exercised by this focused test.

Local artifacts (outside the repository): `/tmp/lunden-718-shots/baseline-result.txt`, `cache-result.txt`, `cache-and-label.png`.
