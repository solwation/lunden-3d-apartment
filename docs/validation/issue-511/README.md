# #511 – daily global beer shelf

Chromium 1208/SwiftShader, Three.js 0.170.0; static devserve and real local Node Worker.

- Browser cache test: 11 checks pass, including real PNG/JPEG decoding, prepared first-offline fallback, same-day reuse with no request, next-day refresh, unchanged complete cache after network/HTTP/timeout/partial metadata/one corrupt image, retry after failure and actual page reload.
- Browser model test: 15 checks pass. Four actual beers, two groups, real decoded canvas labels, shelf contact, wall/door/roof clearance and separation; no duplicates on reopening. Future actual bottle metadata exercises both 330 and 500 ml shapes.
- Real normal-home startup through the live Worker: current source selection and all four decoded images; actual page reload retains identical metadata/images and makes zero additional Worker reads even with the endpoint blocked. No page errors.
- Node tests: all 12 new shelf/existing layout tests pass with offline fixtures. Global normalized sorting, actual packaging and product-id joins, original image bytes, incomplete/corrupt/oversized images, invalid sources, GET-only retry and no Worker cache writes.
- Existing cold-drawer browser regression: all checks pass with the new shelf present, including actual front/loading/pickup, moving contents, original shelf homes, real save/reload and door guards.
- perfcount: all checks pass. Closed-fridge kitchen/living/upstairs calls remain 330/312/296; hidden beer contents add no closed-fridge draw calls.
- shelf.png reviewed: four distinct real labels on a glass shelf with clear gaps and correct can rims. Product type and ml are source metadata; package diameters/heights are centralized standard-package assumptions, not measured manufacturer dimensions.

Source: https://untappdbolaget.se/top-10?rank=global, public source Worker catalogues/globalByStyle, fetched 2026-10-08. Prepared selection: Toppling Goliath Double Dry Hop King Sue (1014934, 473 ml), Elmeleven Parallel Universe (3143034, 440 ml), Omnipollo × RaR ROaR Saturated Double IPA (3354834, 440 ml, source classifies it as Triple IPA), Omnipollo × Brujos Unholy Church (8898334, 440 ml). All four actual packages are cans; no artificial bottle substitution. First three use original Systembolaget product photos; fourth uses its actual Untappd beer label. Source URL/sourceUpdatedAt and successful fetchedAt/day persist together with the images. The committed fallback has a separate preparedAt and zero successful timestamp.

Production follow-up: GitHub Worker deployments succeeded. The published `/beer-shelf` returns HTTP 200 and the current complete selection. Normal-home startup and real same-day reload also pass against that published Cloudflare endpoint (`deployed.log`). Edge fetch requires `redirect: manual` (redirect responses fail the batch), unlike Node which also supports `error`; the offline redirect regression passes (`redirect.log`). Public cross-Worker fetch is enabled in wrangler.toml.
