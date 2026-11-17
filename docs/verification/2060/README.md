# Nose sliders without a shading edge on the cheek — #2060

`tools/avatarnose2060browser.cjs` on `tools/avatarexpr.html` (SwiftShader, `Math.random` seeded so both phases
see the same saccades), camera 0.42 m from the nose, medium skin. Phase `before` serves `src/avatar.js`,
`src/config.js` and `src/avatarnose.js` of baseline `1a5fab00` in place of the checkout's; both phases render
the same sheets. Columns: front, three-quarter, profile, low three-quarter, from below.

| Image | Shows |
|---|---|
| [before/nose-extremes.png](https://github.com/solwation/lunden-3d-apartment/blob/72b42e19/docs/verification/2060/before/nose-extremes.png) (removed at closure) → `nose-extremes.png` | daylight. Rows: straight, convex, upturned, broad, each at the smallest + narrowest and then the largest + widest sliders |
| [before/nose-extremes-raking.png](https://github.com/solwation/lunden-3d-apartment/blob/72b42e19/docs/verification/2060/before/nose-extremes-raking.png) (removed at closure) → `nose-extremes-raking.png` | the same with a low sun from the side (form only) |
| `nose-closeup-raking.png` | crops of the raking sheets, largest + widest rows (straight, convex, upturned, broad top to bottom); columns before / after front, before / after three-quarter |
| `nose-closeup-below.png` | crops of the daylight sheets, straight (top) and broad (bottom) at largest + widest; before / after from below, before / after low three-quarter |
| `old-codes.png` | old codes (light, medium, dark skin), middle sliders: pixel-identical to the baseline |

Before: at the largest + widest sliders a thin outline runs through the cheek round the wings and up to the
inner eye corners, for every variant (clearest on broad). After: gone; the cheek shades smoothly into the
wings. The smallest + narrowest rows are unchanged in look.

Cause: #2048's widening `x · smoothstep` faded out within 1.7 cm beside the wings, so at the widest slider the
cheek there was squeezed to about a quarter of its width (and to 0.23 beside the bridge), and the normals
stayed put. The squeezed facets disagreed with their shading normals, which the skin bump's frame turns into
a visible line. Fix: the widening's profile (`AVATAR_NOSE_WIDTH`) spreads the cheek's movement over about
4 cm (narrow at the bridge), slides it back along the face's curve like the broad variant, and
`noseNormalGLSL` turns the normal by the sliders' offset together with the variant's.

Checks: browser run PASS, no page or shader errors in either phase (`browser.json`); the old-code sheet
(1,014,000 pixels) is identical to the baseline (0 differing, largest channel delta 0). Triangles 15,000 per
figure before and after (no geometry, attribute, draw, texture, light or pass). Node: `avatarnosetest` 9/9
(new #2060 test: on the cheek round the nose each facet's angle to its shader normals rises by < 12° over the
default nose at every size / width end for every variant (worst 9.9°, broad; the old code with its bind normals
reached 16° straight and 46° broad), and no strip of skin is squeezed below 0.6 across the face (old 0.28);
#2048/#2049 fold tests now use the shader twin `noseSlideOffset`), `avatarheadtest` 9/9, `riggedavatartest`
11/11, `avatarcustomizertest` 25/25, `avatarsculpttest` 3/3, `avatarexprtest`, `avatareyestest`, `avatarhittest`,
`avatarlighttest`, `avatarbrowtest`, `avatarlidstest` all pass.

Frame time (`frameMs`, SwiftShader on a machine shared with other browser jobs): relative only, and noisy here
(the same extremes sheet measured 4.5–9.7 ms across four runs of either code). Shader cost: vertex only, for
head vertices in the nose's box and only when the sliders are off the middle or a variant is chosen: three
evaluations of the slider offset next to #2049's three of the variant's.

Not covered: physical GPUs/Surface, the in-game mirror and the customizer's live preview (same material and
uniforms). Avatars with non-middle width sliders change shape slightly round the wings (the cheek moves with
the nose instead of piling up beside it); the wing itself moves 11.8 mm between the narrowest small and the
widest large nose (12.9 before). Close-up crops were cut from the two sheets with a pngjs script, not a separate render.
