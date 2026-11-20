# #2176 snow cover from the real weather

Fixture `tools/fixtures/openmeteo-snow-2176.json` (hand-made, Jan 2026): snowfall 2 Jan 06–18 (0.8 cm/h), frost, slow thaw from 9 Jan, rainy mild from 14 Jan.
URL base: `?shot&test&cloud=&mp=0&freeze&year=2026&month=1&weatherapi=/tools/fixtures/openmeteo-snow-2176.json`, courtyard `&at=-28,32,0,-8`, Sankt Lars väg `&at=18,14,-70,-8`.
Before = a1e55c59 (calendar snow, December-February all white), after = this branch. The headless run injected the parsed fixture months into `weather.real` (the first fetch can time out while the page builds).

| Image | State | Shows |
|---|---|---|
| `court-snowfall.png` | 2 Jan 10:00, cover 0.80, snowing | courtyard white while it snows |
| `court-thaw.png` | 11 Jan 14:00, cover 0.27 | gravel and paving bare in patches, snow left on the lawn and along edges (a few flakes are the fading sim weather) |
| `court-mild.png` | 20 Jan 12:00, cover 0, +4 °C rain | no snow: gravel, paving and a dull winter lawn |
| `street-snowfall.png` | 2 Jan 10:00 | road and pavement white, grey plough ridge along the road edge |
| `street-thaw.png` | 11 Jan 13:00, cover 0.33 | asphalt bare first, pavement patchy, grey ridge at the kerb |
| `street-mild.png` | 20 Jan 12:00 | bare road and pavement |

`before/` has the same six views (all white in every state).

Measured (`renderer.info`, same views, snowfall/thaw/mild; before -> after): draw calls court 311/310/310 -> 311/310/312, street 57/57/56 -> 57/57/59;
triangles court 802943/802943/802943 -> 802943/802943/805567, street 410273/412433/410273 -> 410273/412433/414997 (the mild day shows what snow used to hide:
drain covers and similar, +2 or +3 draws, +2.6k / +4.7k triangles; snowy states are unchanged); shader programs court 90/88/89 -> 97/95/100, street 42/40/41 -> 43/41/46
(the class-keyed snow step splits programs the materials used to share; no new render pass, light or shadow caster).
