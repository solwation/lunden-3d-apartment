# #2053 Long hair in locks

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarlonghairtest.cjs http://localhost:8153 docs/verification/2053`
(component page `tools/avatarlonghair.html`; "före" = the branch base `b622b587` — its `src/avatar.js`, `src/config.js` and
`src/avatarhairline.js` served under `/base/`, each phase with its own shader program — "efter" = the checkout; SwiftShader with 4× MSAA,
NeutralToneMapping; dagsljus = sun over the camera's shoulder, motljus = low sun behind the subject). Rows: light skin with blond hair (female
figure), medium skin with red hair (male), dark skin with black hair (female). Hair length slider in the middle (1).

| Image | Shows |
|---|---|
| `bakifran.jpg` | from behind, daylight and backlight, before/after: locks with tapered tips and an uneven hem instead of one sheet with a cut edge |
| `profil.jpg` | profile, daylight and backlight: layered locks with air between them, side locks ending on the shoulder |
| `snett.jpg` | three-quarter from behind (daylight, backlight) and from the front (daylight): broken silhouette, strands in front of the shoulder |
| `rakt.jpg` | front, daylight and backlight: two strands per side falling forward over the shoulders onto the chest |
| `rorelse.jpg` | walking (from behind), running (profile), sitting (three-quarter front and profile): the sway, nothing through shoulders or back |
| `longhair.json` | triangles, head and hair triangles, draw calls, and the timing run (nine long-haired figures, before/after alternating) |

Checks: browser run PASS, no page or shader errors, one draw call per avatar. `node --test tools/avatarlonghairtest.mjs` (head growth
≤ +10 %, the back's hem varies, the lowest triangles are narrow tips, front strands on the chest skinned to the torso, flyaways only on the
locks, no curtain vertex > 2 mm inside the body standing / walking / running / sitting for both figures) plus the existing avatar suites
(head, hairline, sway, rigged, customizer, gloss, nose, lids, brows, expressions, eyes): 80/80.

Penetration (`node tools/avatarlonghairpose.mjs`, curtain vertices > 2 mm behind the nearest body surface, CPU skinning, sway off), base → after,
male / female: rest 12 → 0 / 12 → 0, walk 18 → 0 / 15 → 0, run 21 → 0 / 24 → 0, sit 9 → 0 / 6 → 0, head turned ±0.6 rad 72–78 → ≤ 15 (≤ 6 mm) /
57–72 → 0, drinking (head back 0.28 rad) 120 → 65 / 120 → 33 (≤ 1 cm); nodding down 0.55 rad 12 → 14 / 20 → 12 (≤ 1 cm); looking up 0.45 rad
90–132 → 232–250 (≤ 2 cm, the nape's hair into the collar — the curtain now has more vertices there; rigid skinning, no collision).

Cost: +800 triangles on the long-haired head (10100 → 10900 incl. #2048's nose; +8.5 % of the 9444 before this round's step budget), the
whole figure 15880 → 16680; no attribute, texture, light, pass or draw call. The soft hairline's fragment test gets one more comparison.
Timing (SwiftShader, CPU-saturated host): before 1195–1299 ms, after 1036–1483 ms per frame — the noise is larger than any difference;
a software rasterizer is a pessimistic proxy, not a Surface (Iris 640) measurement.

Limits: the locks are rigid ribbons (no per-lock simulation); a strong look up still pushes the hair at the nape a little into the collar,
and the side locks seen edge-on from the front read as thin lines; the far figure (#1966) is unchanged; the hairline is no longer applied
far below the scalp shell's edge (hair hanging below the line at the face edge stays whole).
