# #2154 procedural sky clouds

`node tools/skyclouds2154browser.cjs http://localhost:8226 /tmp/sky2154 after|before` (June 15, wind 8/-3 m/s, looking up 35 degrees, `&test=lazy` headless SwiftShader).

- `after-clear.png` overcast 0: empty sky. `after-part.png` overcast 0.2 (WMO code 2), `after-cloudy.png` 0.55 (code 3).
- `after-part-t30.png` the same view 30 s of wind later: the pattern has drifted (same offset as the ground shadows).
- `after-dusk-part.png` June 21:33 sunset, overcast 0.3: dusk colours and the lit sun side are kept.
- `before/before-part.png`, `before/before-cloudy.png`: the old static texture (a few big blobs regardless of weather).

Render info (renderer.info, SwiftShader, noisy ms): the sky is one program before and after; draw calls / triangles vary only with scene streaming
(28-33 calls, 308-367k triangles after; 28 / 34 before). Quality 0 (test mode) uses the old texture (`skyClouds` false); quality 3 uses noise.
Frame ms per 3 renders after (quality 0 / full): 10.8-38 / 13.5-24; before (part, cloudy): 101 and 15 / 19 and 24 (software renderer, too noisy to separate).
