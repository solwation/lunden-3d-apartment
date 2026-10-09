# Sankt Thomas skola / byggnad 1 (Klockhuset) — #579

## Identifiering och källor

OSM 88457546 ligger mellan byggnad 2 och 7 på [Hemsös karta](../../references/east-campus/hemso-karta-st-lars.png) = byggnad 1 (förvaltningsbyggnaden, i dag Klockhuset, Sankt Thomas skola, S:t Lars väg 1). Underlag i [`sources.json`](../../references/east-campus/sources.json):

- [Commons byggnad 1](../../references/east-campus/commons-byggnad-1-2014.jpg), Peter Sondhauss 2014-03-29, CC BY-SA 3.0, nutida: södra huvudfasaden snett från sydost.
- [Hemsö förvaltningsbyggnaden](../../references/east-campus/hemso-byggnad-1-historisk.jpg), historiskt (1960–70-tal), rakt på mittaxeln från borggården.

## Bildanalys

Båda bilderna (nutida och historisk) visar samma huvuddrag: två höga våningar; bottenvåningen helt vitputsad med bågade fönster, övervåningen rött tegel mellan vita pilastrar med raka fönster under krönlister; tandsnittsgesims och lågt valmat plåttak. Mittpartiet skjuter fram och kröns av en fronton; i övervåningen ett mycket stort rundbågigt fönster (flankerat av små parvisa bågfönster, inte modellerade). Bakom frontonen klocktornet: kvadratisk vit urtavlevåning med urtavlor åt fyra håll, mörkt lågt tak, vit lanternin med öppna rundbågar, mörk klockformad huv och förgylld spira. Hemsö bekräftar urtavlor åt fyra håll, lanternin med slagklocka och förgylld spira.

## Modell

- `SITE.east.facadeStyles.klockhuset`: våningshöjder 4,6/4,5 m, vit putsad bottenvåning (`apron`), pilastrar, våningsband, gesims med tandsnitt, kvaderhörn, fönsterrytm 3 m.
- `campus.centre`: risalit x 39,6–51,6 framför södra fasaden (fyller OSM-polygonens indrag; bredd och utsprång **antaganden**), fronton 2,1 m, rundbågigt fönster 2,6 × 3,9 m, torn på mittaxeln med urtavlevåning 4 m, lanternin 2,7 m, huv 1,7 m och spira 2,4 m — spirans topp 13,1 m över takfoten. Alla mått **antaganden** skalade från fotona.
- Klockan har statiska visare (ingen klockfunktion, enligt ärendet). Sidofasaderna följer samma stil; norra fasaden är inte fotograferad.

## Jämförelse

Playwright-Chromium/SwiftShader, 15 juli 12:00, klart väder. Före = 7d2f3bd (#577), efter = denna ändring.

| Vy | Före | Efter | Referens |
|---|---|---|---|
| Snett från sydost | [före](b1front-before.png) | [efter](b1front-after.png), [närmare](b1close-after.png) | Commons 1 |
| Mittaxeln från borggården | [före](b1axis-before.png) | [efter](b1axis-after.png) | Hemsö förvaltningsbyggnaden |
| Sankt Lars väg | [före](street-before.png) | [efter](street-after.png) | — |
| L1007:s övervåning | [före](kitchenup-before.png) | [efter](kitchenup-after.png) | — |

Tornet är det enda av husen som reser sig över skolan mittemot; från gatan och hemmet skyms det i dessa vinklar av skolan och träden.

## Tester och prestanda

`eastbackdroptest.html` ALL PASS med nya kontroller: stort rundbågigt fönster på södra mittpartiet och klocktorn på mittaxeln 13,1 m över takfoten; 1 013/1 013 synliga fönster (fönster bakom risaliten utesluts). Campus 70 223 → 75 351 trianglar (gräns 78 000). `perfcount.html` #577 → #579: calls lika eller lägre (övervåning 323 → 320, övriga oförändrade), +5 000 trianglar. Inga nya batcher, ljus eller texturer.
