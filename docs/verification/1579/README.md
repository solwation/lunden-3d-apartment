# Kantlinjer — issue #1579

Jämförelsen använder samma riktiga Chromium/WebGL-scen och kamera per rad:

| Vy | Kamera `?at=x,z,yaw,pitch,feetY` |
| --- | --- |
| Kök | `4.35,2.75,-90,-32,0` |
| Hall | `1.2,1.2,0,-8,0` |
| Vardagsrum | `2,9.8,0,-8,0` |

`*-current.png` visar den tidigare hårdgrå färgen, återställd i den körande webbläsaren.
`*-tinted.png` visar den nya yttonade färgen, med en gissad mörkningsfaktor på 0,62 i
linjärt RGB. `*-ao-only.png` döljer kantlinjebatcharna
så att bara AO och ytornas vanliga skuggning återstår. Varje triptyk har samma kamera.
Originalrapportens egen bild finns kvar på issue #1579; den sparade rapporten innehåller
ingen kamerakoordinat, så köksbilden är en separat referensvy och inte utgiven för att
vara en exakt återspelning av rapportens kamera.

## Kontroller

- `tools/architecturetest.html` i headless Chromium/WebGL: alla kontroller gröna,
  inklusive materialfärg per vertex, 8-bitars normaliserad färgbuffert, L1004/L1201,
  rörliga dörrar och hiss, sömmar, öppningar, bänkskiva och döljning bakom vägg.
- 77 lägenhetsbatchar; testvyn använder 23 synliga linjeanrop inom de befintliga
  batcharna. Ingen yta får eget material eller eget linjeanrop.
- Ingen triangulerings- eller konstruktionssöm lades till; linjegeometrins
  positioner är oförändrade. Färgdata använder 3 byte per vertex.
