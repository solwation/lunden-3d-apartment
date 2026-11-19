# #2154 procedural sky clouds

`node tools/skyclouds2154browser.cjs http://localhost:8226 /tmp/sky2154 after|before` (June 15, wind 8/-3 m/s, looking up 35 degrees, `&test=lazy` headless SwiftShader).

- `after-clear.png` overcast 0: empty sky. `after-part.png` 0.2 (WMO code 2): fewer, larger cumulus with wispy eroded edges, brighter rims, grey cores. `after-cloudy.png` 0.55 (code 3).
- `after-overcast.png` overcast 1: a mostly continuous grey deck with darker / lighter variation.
- `after-part-t30.png` the part view 30 s of wind later: the pattern has drifted (same offset as the ground shadows).
- `after-dusk-part.png` June 21:33 sunset, overcast 0.3: dusk colours kept.
- `before/*.png`: the old static texture (part, cloudy, overcast, dusk-part).

Second pass (conductor review): shared noise cell 200 m (tile 5200 m) with an added low octave, wide soft edges, thickness-based shading, self-shadow sample towards the sun, detail and density fade towards the horizon.
Cost note: the sky adds ~3 value-noise lookups (+1 for self-shade) per sky pixel; one program, no pass.

Render info (renderer.info, SwiftShader, noisy ms): the sky is one program before and after; draw calls / triangles vary only with scene streaming
(28-33 calls, 308-367k triangles after; 28 / 34 before). Quality 0 (test mode) uses the old texture (`skyClouds` false); quality 3 uses noise.
Frame ms per 3 renders after (quality 0 / full): 10.8-38 / 13.5-24; before (part, cloudy): 101 and 15 / 19 and 24 (software renderer, too noisy to separate).
