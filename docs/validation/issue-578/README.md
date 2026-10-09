# Byggnad 8 / förskolan Framtiden — #578

## Identifiering och källor

OSM 88457606 ligger på byggnad 8:s plats på [Hemsös karta](../../references/east-campus/hemso-karta-st-lars.png); förskolan Framtiden har postadressen "S:t Lars väg, Byggnad 8" (Skolkoll, kontrollerat 2026-10-09). Underlag i [`sources.json`](../../references/east-campus/sources.json):

- [Hemsö By8](../../references/east-campus/hemso-byggnad-8-historisk.png), historiskt, okänt datum: norra fasaden mot borggården med mittparti och fronton, runda takkupor på längorna.
- [Commons byggnad 8](../../references/east-campus/commons-byggnad-8-2014.jpg), Peter Sondhauss 2014-03-28, CC BY-SA 3.0, nutida: västra paviljongen, kortsida mot norr med två fönster per våning och långsida mot väster med sex.
- [Peabs bild "förskolan Framtiden"](../../references/east-campus/peab-forskolan-framtiden-gard.jpg) visar en envåningsflygel med 4/9:s arkitektur och tolkas som byggnad 9 sedd från förskolegården (se #576); den används inte som fasadunderlag för 8.

Hemsö: 3 och 8 var spegelvända men lika; 8 byggdes om invändigt till TBC-byggnad 1947 (Hakon Ahlberg). Huvudfasaden mot Höje å är lugn, fasaden mot byggnad 1 livligare. 2014-fotot visar att exteriören med kvaderhörn, tandsnittsgesims och fönsterformer finns kvar.

## Bildanalys och modellbeslut

- Två våningar i rött tegel; ändpaviljongerna och mittpartiet har högre takfot än de förbindande längorna (syns på 2014-fotot och i 7:s motsvarighet). Modell: `sections` höjer paviljonger och mittparti 1,2 m (**antagande**).
- Vit sockel, våningsband, rusticerade hörnkedjor med fogar, gesims med tandsnitt; bottenvåningens fönster med flack segmentbåge och slutsten, övervåningens raka med krönlist och spröjs (som 2014-fotot). Rytmen 2,75 m med 2,45 m hörnmarginal ger 6 + 2 fönster per våning på västra paviljongen som på fotot.
- Fronton på mittpartiets norra fasad enligt det historiska fotot (inte synlig på 2014-bilden, därför markerad som historiskt belagd). De runda takkuporna syns bara på den historiska bilden och modelleras inte.
- Lågt valmat plåttak per del med tegelskorstenar; resning, skorstenslägen och alla mått är **antaganden** i `SITE.east.facadeStyles.stenhammar`.

## Jämförelse

Playwright-Chromium/SwiftShader, 15 juli 12:00, klart väder. Före = ba77c61 (#576), efter = denna ändring, samma kameror.

| Vy | Före | Efter | Referens |
|---|---|---|---|
| Västra paviljongen från nordväst | [före](b8c8-before.png) | [efter](b8c8-after.png) | Commons 8 |
| Borggårdssidan | [före](b8n-before.png) | [efter](b8n-after.png) | Hemsö By8 |
| Södra sidan | [före](b8s-before.png) | [efter](b8s-after.png) | — |
| Östra paviljongen | [före](b8pav-before.png) | [efter](b8pav-after.png) | — |

Från L1007 skyms 8 av skolan (byggnad 3) och byggnad 88; från Sankt Lars väg syns östra paviljongen bortom 88.

## Tester och prestanda

`eastbackdroptest.html` ALL PASS med nya kontroller: högre paviljonger/mittparti än längorna, 6 + 2 fönster på västra paviljongen, fronton mot borggården; 1 041/1 041 synliga fönster. Campus 33 670 → 41 575 trianglar (gräns 44 000). Kvaderfogar och tandsnitt är plana ytor för att hålla nere trianglarna. `perfcount`: kök 338 → 339 calls, övriga vyer oförändrade mot #576; inga nya batcher, ljus eller texturer.
