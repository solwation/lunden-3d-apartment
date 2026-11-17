# #2047 Formed avatar ears

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatareartest.cjs http://localhost:8147 docs/verification/2047`
(component page `tools/avatarear.html`; "före" = the branch base `1fe1aba1` — its `src/avatar.js`, `src/config.js` and
`src/avatarskin.js` served under `/base/` — and "efter" = the checkout; SwiftShader with 4× MSAA, NeutralToneMapping, the sun over the
camera's shoulder for "dagsljus" and low behind the subject for "motljus").

| Image | Shows |
|---|---|
| `huvud-dagsljus.jpg` | light / medium / dark skin, short hair: front, three-quarter, profile, back three-quarter and back, before/after |
| `ora-nara.jpg` | the right ear up close: three-quarter from the front, profile and from behind, before/after |
| `ora-motljus.jpg` | backlight: the ear up close in profile and three-quarter, and the head in profile (#2032 translucency) |
| `tillbehor.jpg` | studs, hoops, drops, headphones on the ears, beanie, cap, square glasses, long and curly hair: front, ¾, profile, back ¾ |
| `ear.json` | triangles per look (whole figure, head-bone parts, ears), draw calls, crowd / close-up timing |

Before: a flat oval disc lying against the head (from the front a thin paddle edge). After: a helix rolled along the top and back
edge with the scapha groove inside it, an antihelix ridge round a darker concha bowl, a tragus, a soft lobe, and a cranial surface back
to the head; the ear turns out about a hinge at its front edge, so from the front each ear reads as a C and from behind it stands off
the head. The rim and lobe still glow red in backlight on all three skin tones. Earrings hang from the lobe's outer face (`earLobe`);
the headphone cups still enclose the ear, the beanie's cuff and the cap sit as before, glasses temples are unchanged (they end in front
of the ear, as before); long and curly hair still cover the ear (the hair now keeps clear of the fitted `earEnvelope`).

Checks: browser run PASS (no page or shader errors, one draw call per avatar for all 24 figures). `node --test tools/avatarheadtest.mjs`
9/9 with the new #2047 test (ears exactly 2 × 500 triangles, ≤ +10 % of each variant's pre-#2047 head; helix > 0.111 m off the head
axis against 0.105 before; upper back ≥ 8 mm further out than the front edge; old height envelope; stud within 4.5 mm of the lobe
surface); all `tools/avatar*test.mjs` and `tools/riggedavatartest.mjs` pass.

Cost: ears 384 → 1,000 triangles (+616 per figure; head-bone parts 7,268 → 7,884 = +8.5 % for short hair, +4.8 % for curly; whole
figure about +4.7 %). No new attribute, texture, light, pass, uniform or shader branch; one draw. SwiftShader timing on a loaded host
(load average ≈ 14) scattered too much to resolve a geometry change of this size: best-of-three crowd ratios 1.32 and 1.21, close-up
1.01 and 1.12 in two runs, with single rounds varying ±40 %. A software rasterizer is a pessimistic proxy, not a Surface measurement.

Limits: stylised forms (no crura split of the antihelix, no intertragic notch); the concha's darkening is per vertex, so it is soft;
the ear slider still scales the whole ear about the old attachment point; the far LOD figure (#1966) is not affected by this mesh.
