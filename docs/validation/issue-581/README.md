# Kunskapsskolan / byggnad 19 — #581

## Identifiering och källor

OSM 88457581 (Kunskapsskolan) är byggnad 19 på [Hemsös karta](../../references/east-campus/hemso-karta-st-lars.png); den lägre östra delen 88457601 hänger ihop med den på kartan. 2014-fotot visar Kunskapsskolans skylt och husnummer 19. Underlag i [`sources.json`](../../references/east-campus/sources.json):

- [Hemsö By19](../../references/east-campus/hemso-byggnad-19-historisk.png), historiskt (1980-talet enligt bilarna), okänt datum.
- [Commons byggnad 19](../../references/east-campus/commons-byggnad-19-2014.jpg), Peter Sondhauss 2014-03-28, CC BY-SA 3.0, nutida: västra långsidan med gaveln (mot gatan i norr, som Hemsö skriver) till vänster.

Hemsö: tvättbyggnad i rött tegel 1910–11 (Axel Kumlien), ombyggd av Klas Anshelm till centralförråd och 1994; ”ligger med gaveln mot gatan”.

## Bildanalys och modellbeslut

- Ren tegelarkitektur utan de äldre paviljongernas vita puts: segmentbågade fönster med vita karmar, mittpost och tvärpost under tegelvalv, mörk gördel vid varje bjälklag, utkragad tegeltakfot, mörka falsade plåttak, kraftig tegelskorsten.
- Båda bilderna visar en **trevåningskropp bakom en tvåvånings framdel** med lågt tak; översta våningen har parvisa fönster som syns ovanför framdelens tak. Modell: framdelen x 89,5–96,5, trevåningskroppen x 96,5–115,6 (gräns och djup är **antaganden**), sydliga utbyggnaden en våning (envåningsannexet till höger på 2014-fotot).
- Östra delen 88457601 är inte fotograferad: två våningar i samma tegelarkitektur som **antagande** (”östra lägre del”).
- Våningshöjder 3,9/3,7/3,4 m, fönstermått, takresning 3,2 m (framdelen 0,8 m) och skorstenslägen är **antaganden** i `SITE.east.facadeStyles.laundry`.

Gemensamma förbättringar i `campusfacades.js` (påverkar även 4, 8, 9 och 88): sockeln går ner till terrängens lägsta punkt i stället för att lämna bar vägg där marken sluttar, och en snittvägg mellan två delar får fönster på de våningar som går fritt över grannens tak.

## Jämförelse

Playwright-Chromium/SwiftShader, 15 juli 12:00, klart väder. Före = 536df1f (#580), efter = denna ändring.

| Vy | Före | Efter | Referens |
|---|---|---|---|
| Västra långsidan | [före](b19w-before.png) | [efter](b19w-after.png) | Commons 19, Hemsö By19 |
| Norra gaveln från gatan | [före](b19n-before.png) | [efter](b19n-after.png) | Hemsös beskrivning |
| Östra delen | [före](b19e-before.png) | [efter](b19e-after.png) | — |
| Översikt | [före](b19air-before.png) | [efter](b19air-after.png) | Hemsös karta |

Från Hus L:s östra gavel och L1007 skyms 19 av HepCat och Consensum; den syns från Sankt Lars väg österut och från gångvägen norr om huset.

## Tester och prestanda

`eastbackdroptest.html` ALL PASS med nya kontroller: annex/framdel/trevåningskropp (1, 2, 3 våningar, takfot 11 m), tvåvånings östra del, segmentbågade fönster överallt och parvisa översta fönster även ovanför framdelens tak; 1 066/1 066 synliga fönster. Campus 45 711 → 53 934 trianglar (gräns 56 000). Inga nya batcher, ljus eller texturer.

`perfcount.html` (#580 → #581, samma main): kök 339 → 339, vardagsrum 338 → 338, övervåning 323 → 323, uteplats 102 → 102, gården 87 → 91, Karpvägen 76 → 80, östra gatan 51 → 54 calls. Ökningen är skolbatchernas fyra anrop (tegel, lister, glas, plåt): med 19 sträcker sig deras gemensamma avgränsning närmare Lunden, så de ritas i fler vyer. Inga ytterligare batcher; emulerat, inte uppmätt på Surface Pro.
