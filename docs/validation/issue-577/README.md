# Byggnad 2 och 7 — #577

## Identifiering och källor

[Hemsös karta](../../references/east-campus/hemso-karta-st-lars.png): norra raden runt borggården är 2 – 1 – 7. OSM 130678797 = byggnad 2 (väster om 1), OSM 88457552 = byggnad 7 (öster om 1). 2014-fotot av 7 visar Freinetskolans skylt och byggnad 1:s vita hörn intill, vilket bekräftar kopplingen. Underlag i [`sources.json`](../../references/east-campus/sources.json):

- [Commons byggnad 2](../../references/east-campus/commons-byggnad-2-2014.jpg), Peter Sondhauss 2014-03-29, CC BY-SA 3.0, nutida.
- [Commons byggnad 7](../../references/east-campus/commons-byggnad-7-2014.jpg), Peter Sondhauss 2014-03-29, CC BY-SA 3.0, nutida.
- [Hemsö By7](../../references/east-campus/hemso-byggnad-7-historisk.png), historiskt, okänt datum.

Hemsö: 2 och 7 byggdes 1875–76 av Stenhammar, med mittflygel och lägre utskjutande delar.

## Bildanalys (varje hus för sig)

Båda 2014-fotona visar var sitt hus med samma utförande: två våningar rött tegel, ändpaviljonger som står högre än den förbindande längan, breda vita rusticerade hörnkedjor, vit sockel och våningsband, gesims med tandsnitt, bottenvåningens fönster med båge och slutsten, övervåningens raka med krönlist och fönsterbänk, spröjsade bågar. Kortsidan har två fönster per våning, långsidan fem till sex. Lågt mörkt plåttak med tegelskorstenar. Ingen fronton syns på något av husen (till skillnad från 8). Byggnad 2:s foto kopierades inte till 7: båda kontrollerades separat och stämmer överens.

## Modell

Samma `stenhammar`-stil som 8 (#578), med egna `sections` för västra paviljongen, mittpartiet och östra paviljongen ur respektive OSM-polygon (höjda 1,2 m, **antagande**). Fönsterantal följer av fack 2,75 m och hörnmarginal 2,45 m (ger två fönster på kortsidorna som på fotona). Alla mått är **antaganden** i `SITE.east.facadeStyles.stenhammar`. Prioritet låg: husen ligger mer än 100 m från Hus L och syns från Lunden bara som glimtar bakom skolan.

## Jämförelse

Playwright-Chromium/SwiftShader, 15 juli 12:00, klart väder. Före = 58feef9 (#581), efter = denna ändring.

| Vy | Före | Efter | Referens |
|---|---|---|---|
| 2:s västra paviljong från sydväst | [före](b2c-before.png) | [efter](b2c-after.png) | Commons 2 |
| 2 från borggården | [före](b2s-before.png) | [efter](b2s-after.png) | — |
| 7:s västra paviljong från sydväst | [före](b7c-before.png) | [efter](b7c-after.png) | Commons 7 |
| 7 från borggården | [före](b7s-before.png) | [efter](b7s-after.png) | Hemsö By7 |
| Borggården mot norr | [före](courtyard-before.png) | [efter](courtyard-after.png) | — |

## Tester och prestanda

`eastbackdroptest.html` ALL PASS med ny kontroll per hus (höjda paviljonger/mittparti, bågade nedre och raka övre fönster); 1 020/1 020 synliga fönster. Campus 53 934 → 70 223 trianglar (gräns 72 000). `perfcount.html` #581 → #577: calls oförändrade eller lägre (gården 91 → 88, Karpvägen 80 → 77, övriga lika), +16 000 trianglar i vyer där campus syns. Inga nya batcher, ljus eller texturer.
