# Mjukare kantlinjer — issue #1957

Samma kamera före/efter, riktig Chromium/WebGL (SwiftShader), `&time=12&month=6&day=15&freeze&mess=0&weather=clear`, 1280×800, kvalitet 3 + skuggor (`testkit.shot`).

| Vy | Kamera `?at=x,z,yaw,pitch,feetY` |
| --- | --- |
| Kök (L1007) | `4.35,2.75,-90,-32,0` (samma som #1579) |
| Badrum | `1.5,5.3,135,-15,0` |
| Fasad (norr, Hus L) | `2.5,-14,180,8,0` |

`kok-overskap-fore-efter.png`: överskåpens ramar förstorade, före överst, efter under.
Före-bilderna (`before/`) tas bort i det stängande commitet; issuekommentaren länkar dem fäst vid bildcommitet.

Kontroller: `tools/architecturetest.html` ALL PASS (77 lägenhetssatser, 15 trapphussatser, 23 synliga linjeanrop i testvyn – oförändrat; ny kontroll av multiplikativ blandning och att fogarna faktiskt mörkar).
