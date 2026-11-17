# #2058 The kiss no longer tears the skin beside the nose

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarkiss2058browser.cjs http://localhost:8158 docs/verification/2058 both`
(`tools/avatarexpr.html`, SwiftShader; "before" = `src/avatar.js` and `src/config.js` of `8329d671`, "after" = the checkout; every
cell in the kiss pose, `uKiss` = 1). Rows: light skin straight nose; medium skin upturned nose (#2049); dark skin straight nose
with full beard + moustache (facial 3, #2051); light skin upturned nose with facial 3. Columns: front, three-quarter, profile,
low three-quarter.

| Image | Shows |
|---|---|
| `kiss.png` | after, daylight: the nose's base closed, the moustache and beard follow the lips without gaps |
| `kiss-raking.png` | after, low sun from the side (form only) |
| [before/kiss.png](https://github.com/solwation/lunden-3d-apartment/blob/71457f3c/docs/verification/2058/before/kiss.png) (removed at closure), [before/kiss-raking.png](https://github.com/solwation/lunden-3d-apartment/blob/71457f3c/docs/verification/2058/before/kiss-raking.png) (removed at closure) (removed at closure) | before: the stepped, torn triangles at the nose's base and the cheeks pushed out over the nose |

Cause: the pout's muzzle weight (`pucker`, avatar.js base()) was cut to 0 wherever `noseBlend` > 0 but stayed ≈ 0.9 on the next
vertex, so edges at the nose's base stretched up to 8.8× (and the whole lower face, cheeks up to the eyes, moved forward with
the lips). Fix: the weight fades smoothly above the lips (`KISS.muzzleTop`) and over the nose's height (`KISS.noseFade`); the
lips and everything below the seam keep their pout. Node check: `tools/avatarnosetest.mjs` (#2058, max edge stretch < 2× round
the nose for facial 0–3, now ≤ 1.76×; none on the nose itself).
