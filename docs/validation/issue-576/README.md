# Byggnad 4 och 9 — #576

## Källor och identifiering

Alla bilder och uppgifter finns i [`docs/references/east-campus/`](../../references/east-campus/sources.json), hämtade 2026-10-09.

| Bild | Byggnad / sida | Datum | Typ |
|---|---|---|---|
| [Hemsö By4](../../references/east-campus/hemso-byggnad-4-historisk.png) | 4, okänd sida: tvåvåningsdel, lägre utskjutande del, lång envåningslänga | okänt | historiskt |
| [Commons byggnad 4](../../references/east-campus/commons-byggnad-4-2014.jpg) (Peter Sondhauss, CC BY-SA 3.0) | 4: ändkropp och lång länga, byggnad 2 och klocktornet bakom | 2014-03-28 | nutida |
| [Commons byggnad 9](../../references/east-campus/commons-byggnad-9-2014.jpg) (Peter Sondhauss, CC BY-SA 3.0) | 9: södra ändkroppen från sydost, längan bakåt, byggnad 8 till vänster | 2014-03-28 | nutida |
| [Peab "förskolan Framtiden"](../../references/east-campus/peab-forskolan-framtiden-gard.jpg) | osäker; envåningsflygeln har 4/9:s arkitektur och tolkas som 9 från Framtidens gård | okänt, efter 2020 | nutida |
| [Hemsös karta](../../references/east-campus/hemso-karta-st-lars.png) | numrering 4 = OSM 88457613, 9 = OSM 88457547 | 2024 | karta |

Hemsö beskriver 4 och 9 som ursprungligen identiska envåningsbyggnader (1877–79, länspaviljonger 1895, ombyggda 1926–28).

## Bildanalys

Båda 2014-fotona visar **en våning** på ändkroppar och långa längor: hög ljus sockel och vit puts upp till fönsterbröstningen, vita pilastrar mellan fönsterfacken, tegelfält runt fönstren, vit fris och takfot under ett mörkt plåttak med valmade ändar och tegelskorstenar. Fönstren är höga med flack segmentbåge. Byggnad 9 var sandfärgad 2014 men Peab-bilden (senare) visar samma typ vitputsad; båda ritas därför vita.

Den historiska bilden av 4 visar en tvåvåningsdel med fronton. På 2014-fotot skymtar en högre del bakom längan. Dess läge på fotavtrycket är inte belagt; den läggs som **antagande** på längans parti mittför den västra flygeln (z −133…−120), där en lägre utskjutande del framför motsvarar fotots uppställning. Byggnad 9 får ingen tvåvåningsdel (ingen syns på fotona).

Fönsterantal per fasad, våningshöjd 4,7 m, takresning 2,6 m, fönster- och pilastermått är **antaganden** samlade i `SITE.east.facadeStyles.ward`; inget är inmätt.

## Modell

`src/campusfacades.js` bygger kartpolygonen oförändrad, delar den i delar via `sections` (boxar klippta mot polygonen) och ger varje del sockel, förkläde, pilastrar, fris, takfot, fönster och ett valmat tak som följer delens kontur. Lägre delar saknar listverk, fönster och tak under en högre del. Allt slås ihop i skolans befintliga batcher (tegel med vertexfärg, vita lister, #569:s reflekterande glas, plåttak): inga nya ljus, texturer eller reflektionskameror.

## Jämförelse i webbläsaren

Playwright-Chromium med SwiftShader, 15 juli klockan 12, klart väder, 1280 × 800. Före = origin/main 8864dbb (port 8577), efter = denna ändring (8576), samma kameror.

| Vy | Före | Efter | Jämförs med |
|---|---|---|---|
| 4 från borggården (öster) | [före](b4e-before.png) | [efter](b4e-after.png) | Commons 4 |
| 4:s södra ändkropp | [före](b4s-before.png) | [efter](b4s-after.png) | Commons 4 (paviljongen till höger) |
| 4 från väster | [före](b4w-before.png) | [efter](b4w-after.png) | Hemsö By4 |
| 9:s södra ändkropp från sydost | [före](b9s-before.png) | [efter](b9s-after.png) | Commons 9 |
| 9 från borggården (väster) | [före](b9w-before.png) | [efter](b9w-after.png) | Commons 9, längan |
| Översikt | [före](aerialw-before.png) | [efter](aerialw-after.png) | Hemsös karta |

Silhuetten blir låg och lång som på fotona, med vitt förkläde, pilastrar och tegelfält; tvåvåningsblocket på 4 reser sig ur längan. Från L1007 och Sankt Lars väg skyms båda husen av skolan och träden (oförändrad utsikt utöver avlägsna glimtar).

## Tester och prestanda

`eastbackdroptest.html`: ALL PASS, inklusive nya kontroller för envåningskroppar, ett avgränsat tvåvåningsblock på 4 och segmentbågade fönster; 1 063 synliga fönster av 1 063. Triangelgränsen höjs till 36 000 för hela campus (21 357 → 33 670).

`perfcount.html` (före → efter): kök 338 → 338 calls, vardagsrum 333 → 337, övervåning 317 → 320, uteplats 95 → 99, gården 84 → 84, östra gatan 50 → 50; trianglar +12–22 tusen i vyerna där campus syns. Ökningen i calls kommer av att skolans sammanslagna batcher nu omfattar även 4 och 9 och därför hamnar i fler vyers frustum (även skuggpasset); antalet batcher är oförändrat 8. Emulerat, inte uppmätt på Surface Pro.
