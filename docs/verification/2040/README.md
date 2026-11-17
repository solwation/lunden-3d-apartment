# #2040 Flyaway hairs and backlit hair rim

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarflyawaytest.cjs http://localhost:8240 docs/verification/2040`
(component page `tools/avatarflyaway.html`; "före" = the branch base `3c411005` served under `/base/`, "efter" = the checkout; SwiftShader
with 4× MSAA, NeutralToneMapping, a low sun behind the subject for "motljus").

- `motljus.jpg`: backlit close-up and profile, before/after, for short, long, curly, bun, beard, short + cap and long + beanie.
- `motljus-3m-dagsljus.jpg`: the same looks at 3 m (12° lens) in backlight, and close-ups in daylight (strands read as dark fine hairs).
- `detalj.jpg`: the crown's contour (the chin's for the beard) up close, backlight and daylight: thin, antialiased strands, no stair steps.
- `langt-12m.jpg`: 12 m, where the strands have faded out (`AVATAR_FLYAWAY.fade` 6–10 m; the far figure #1966 has none).
- `before/motljus-fore.jpg`: the base alone (close-up, profile, 3 m) — removed when the issue is resolved.
- `flyaway.json`: canvas alpha after each backlit close-up (255 for all seven: the page never shows through the `alpha: true` canvas),
  triangles per look (with/without flyaways), draw calls (1 per avatar) and the crowd timing.

Hats (#2021): with the cap no head strand shows above or through it; with the beanie only the long curtain's strands below the hat line
remain. Hat-line, budget and zero-width-in-bind-pose checks: `node --test tools/avatarheadtest.mjs`.

Cost: triangles +264 short, +448 long, +240 bun, +400 curly, +120 beard / +28 moustache, 0 beanie (≤ 600 per avatar, about +2–4.5 %);
no new attribute, texture, light, pass or draw call. Shader: one vertex branch for strand vertices only, one hair/beard fragment branch with
a few ALU per directional light. SwiftShader crowd (nine backlit figures at 640 × 640) best of three: 153.8 → 182.5 ms/frame (×1.19), with
the host under load (load average ≈ 15) and isolating runs scattering ±15 %; a software rasterizer is a pessimistic proxy, not a Surface
(Iris 640) measurement, which was not available.

Limits: without MSAA (`&test`, or a device that refuses antialiasing) the strands are off and only the rim remains; the sway is the existing
#2014 spring (tips follow it outwards), not per-strand simulation; strands are stylised (about 3× a real hair's width) and their colour is the
hair's own; headphones (#1322) do not hide head strands.
