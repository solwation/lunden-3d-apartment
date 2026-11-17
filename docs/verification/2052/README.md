# #2052 Gloss along the hair strands

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhairglosstest.cjs http://localhost:8152 docs/verification/2052`
(component page `tools/avatarhairgloss.html`; "före" = the branch base `edf705ea` served under `/base/`, "efter" = the checkout; SwiftShader
with 4× MSAA, NeutralToneMapping). Looks: short black, short brown, long blond, curly black, red bun, grey short hair with a grey full beard.
Unit checks: `node --test tools/avatarhairglosstest.mjs` (strand direction against the shells' own parametrisation, hanging curtain, optional
shader part with no attribute), plus the existing `tools/avatarheadtest.mjs` and `tools/avatarbrowtest.mjs`.

- `dagsljus.jpg`: front, three-quarter and back close-ups in daylight, before/after: the general highlight becomes a band across the
  strands (white on black/brown/grey, golden on blond, red-tinted on red), broken by the strand groups; the curls gloss along each lock.
- `motljus-profil.jpg`: profile in daylight, and three-quarter / profile in backlight: the #2040 rim and flyaways are unchanged.
- `gatlampa.jpg`: the same views at night under a street lamp (#2039 `uLamp` = 1, dim moonlight): a warm band on the crown.
- `avstand.jpg`: 3 m (day and street lamp) and 12 m: the band reads at 3 m and softens to a gentle sheen at 12 m.
- `orbit-near.jpg`, `orbit-m3.jpg`, `orbit-far.jpg`: eight frames of a camera orbit (rows before / after) close up (0.08 rad per frame),
  at 3 m and at 12 m (0.035 rad); `gloss.json` → `orbit` holds the mean frame-to-frame change and the share of pixels jumping > 48 levels.
  At 12 m they are identical (0.242 → 0.244, 0.00053 → 0.00053) and at 3 m nearly so (0.944 → 1.015, jumps 0.00303 → 0.00287): no added
  flicker. Up close the change rises (3.03 → 3.49) because the gloss moves with the view, as specular light does.
- `gloss.json`: triangles and draw calls per look (unchanged, 1 per avatar), the orbit numbers and the timing.

Cost: no triangle, attribute, texture, light, pass or draw call. One varying (`vHairT`) and one `vec4` uniform. Vertex: hair, beard and
brow vertices only, two table lookups and a few trig calls. Fragment: on hair, beard and brow pixels one `atan`, two `sin` and a `fwidth`,
then per light two `pow` lobes instead of the GGX term; other pixels take one extra branch per light. SwiftShader (software, the host at
load ≈ 20), best of three, before → after ms/frame: nine figures at 3 – 6 m on 640 × 640 with MSAA 356.5 → 409.5 (×1.15), without MSAA
133.2 → 156.0 (×1.17); one head filling the view with MSAA 113.8 → 130.3 (×1.15), without 82.4 → 93.1 (×1.13). A second run gave
×1.12 – ×1.32: a software rasterizer runs both sides of a branch, so every pixel pays for the lobes there, and these numbers are a pessimistic
proxy, not a Surface (Iris 640) measurement, which was not available.

Limits: the strand direction is derived analytically from the shells' parametrisation (within 10° of the geometry away from the ears;
over the ears the hairline table's kinks are smoothed, 5° steps); the curly locks use the scalp field (they wind about it), not each tube's
own helix; the gloss has no self-shadowing between strands beyond the sun's shadow and the diffuse terminator; the environment's indirect
specular on hair is unchanged.
