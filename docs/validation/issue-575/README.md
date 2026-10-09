# Karpvägen 2–10 #575

## Källor (hämtade 2026-10-09)

| Bild | Källa | Datum | Byggnad och sida | Status |
|---|---|---|---|---|
| [Färgfoto](../../references/karpvagen/brf-foto01-fasad-okant-datum.jpg) | Brf S:t Lars Park, [Bilder](https://sites.google.com/stlarspark.se/brf-st-lars-park/om-f%C3%B6reningen/bilder) → [Foto01.jpg](https://drive.google.com/file/d/1S_IcX1wD-YE8S223ywyjBhY0sBW5XmQu/view) (3264 × 1661, nedskalad) | okänt (ingen EXIF-tid; sommar, efter inflyttning 2016) | troligen Hus 1 (Karpvägen 10) sydöstra gaveln till höger och Hus 2 (6–8) entrésidan längre bort, från gräsytan sydost om husen. Identifieringen är en **tolkning** | nutida foto, färdigbyggt |
| [Projektrender](../../references/karpvagen/brf-projektrender-balkonger-vasterlage.jpg) | samma sida, säljmaterial ("Alla balkonger i härligt västerläge", Möller Arkitekter) | före byggstart (okänt) | Hus 1–3 från parksidan (sydväst), snett ovanifrån | **planerat utförande**, inte belägg för färdigbyggt |
| [Situationsplan](../../references/karpvagen/brf-situationsplan-hus-1-3.jpg) | samma sida, "Översiktsritning" | okänt | Hus 1–3, parkering/entréer mot Karpvägen | ritning |
| Byggnadsfakta | [Mäklarinfo](https://sites.google.com/stlarspark.se/brf-st-lars-park/om-f%C3%B6reningen/m%C3%A4klarinfo) | hämtad 2026-10-09 | tre fyravåningshus, rött tegel, papptak, alla lägenheter har balkong (inglasning tillåten), källare i Hus 2 | text |
| Identifiering | [Hemsös karta](https://st-larsparken.hemso.se/content/uploads/sites/8/2024/05/Karta-StLars.png), `docs/references/surrounding-views/osm-2026-10-08.json` | — | OSM 342815181 = Hus 1 = Karpvägen 10; 342815182 = Hus 2 = 6–8; 342815183 = Hus 3 = 2–4 (storlek, form och läge mot situationsplanen) | — |

## Bildanalys

Fotot: tre våningar rött laxfärgat tegel med ljus fog och mörk plåtavtäckning, ljus betongsockel,
en indragen ljust putsad fjärde våning med mörka plåtklädda volymer i hörnen (den bortre med ett stort
glasat gavelfönster), vita fönsterkarmar och på gaveln ett vertikalt band med fönster och ljusa
fyllningsfält mellan dem. Platta tak med mörk takfotslist. Rendern visar staplade balkonger med vita
plattor och glasräcken på parksidan, takterrasser bakom räcken på den indragna våningen, svarta tak
med vita takhuvar. Situationsplanen visar entréer och parkering mot Karpvägen (nordost).

## Modell

`src/karpfacade.js`, konfiguration `SITE.west.karp`, `karp`-fält på de tre husen. Oförändrade
OSM-polygoner. Tegel upp till bröstningen, indragen ljus översta våning, mörka gavelvolymer i
parkhörnen, balkongstaplar och glasräcke vid takterrassen mot parken, trapphusband med ljusa
fyllningar och entrétak mot Karpvägen, gavelband på korta gavlar, platta svarta tak med takhuvar.
**Alla mått och antal** (våningshöjd, indrag, balkongstorlek/antal, fönsterrytm, volymernas storlek,
trapphusens lägen) är *antaganden* avlästa ur bilderna, inte inmätningar. Takets exakta lutning,
dagens eventuella balkonginglasningar och bandens exakta läge på gaveln (fotot: höger tredjedel,
modellen: mitten) är inte verifierade.

Fönstren använder #569:s delade `neighborGlass()`-material (samma instans som A–C), inga nya
reflektionskameror eller ljus. En ny delad 256²-tegeltextur för de tre husen.

## Jämförelser

- [Foto mot modell, ungefär samma kameravinkel](jamforelse-foto-vs-modell.jpg) (`at=-92,135,40`).
- [Render mot modell, ungefär samma flygvinkel](jamforelse-render-vs-modell.jpg).
- Före/efter: [gatan vid Hus C](gata-fore-efter.jpg), [parksidan Hus 2](park-fore-efter.jpg), [parksidan Hus 3](park-hus3-fore-efter.jpg).
- [Vinter, snö på taken](flyg-vinter-efter.jpg).
- [Utsikt från Hus L:s tak](fran-hus-l-tak-efter.jpg): husen syns i fjärran över Å-husen. Från L1007:s
  fönster skyms de helt av Å-husen A–C (kontrollerat från vardagsrum och övre plan), så ingen
  fönstervy påverkas.

## Verifiering

Chromium (Playwright, SwiftShader) 1280 × 800, 15 juni kl. 12, före = origin/main ba77c61.

`westbackdroptest.html`: ALL PASS (exakta polygoner, sju batcher, 161 + 328 fönster utåt, tre
tegelvåningar under indragen fjärde, balkongglas mot parken på alla hus, entréer mot Karpvägen,
samma glasmaterial som A–C, 6 082 trianglar). `perfcount.html`: ALL PASS.

| Vy | Draw calls före → efter | Trianglar före → efter | Texturer |
|---|---:|---:|---:|
| living | 337 → 338 | 692170 → 693576 | 117 → 118 |
| upstairs | 320 → 323 | 624240 → 625992 | 129 → 130 |
| courtyard | 84 → 87 | 367498 → 369250 | 129 → 130 |
| karpvagen | 73 → 76 | 319938 → 321690 | 129 → 130 |
| park | 429 → 431 | 762700 → 763046 | 135 → 136 |

Västra kulissen: 4 → 7 batcher (tegel, tak, glas för Karpvägen), 4 330 → 6 082 trianglar. Ingen
mätning på fysisk Surface Pro; mjukvarurenderarens tider är inte meningsfulla.
