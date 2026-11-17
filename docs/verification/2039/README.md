# #2039: avatars under the street lamps at night

`tools/avatarlampbrowser.cjs` (real game, SwiftShader, 17 Nov, clear weather; before = `cb79e7e9`, after = this change). An avatar 2.25 m
in front of the camera on the Sankt Lars väg pavement: right under a lamp and halfway between two lamps (24 m apart) at 21:00, in the
living room at 21:00 and under the same lamp at 13:00 (controls). `before/` holds the same views before the change.

| View | Avatar luminance before → after | R/B before → after | Draw calls |
|---|---|---|---|
| Night, under a lamp (`natt-lampa`) | 41.2 → 85.2 | 0.755 → 1.019 (warm) | 162 / 162 |
| Night, between lamps (`natt-mellan`) | 37.1 → 37.1 | 0.688 → 0.688 | 188 / 188 |
| Night, room (`natt-rum`) | 90.3 → 90.3 | 0.981 → 0.981 | 386 / 386 |
| Day, under the lamp (`dag-lampa`) | 161.6 → 161.5 | 0.764 → 0.763 | 154 / 154 |

Shadow-casting lights: 1 before and after. Numbers: `measurements.json` (after) and `before/measurements.json`.
