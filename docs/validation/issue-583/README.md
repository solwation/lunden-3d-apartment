# Vägskyltar vid korsningar och svängar — #583

`src/streetsigns.js` sätter en stolpe med blå gatunamnsskyltar vid varje korsning mellan två olika namngivna gator i
modellen och vid de två tydliga svängarna vid kvarteret. Varje skylt ligger längs den gren den namnger; där källorna
ger husnummer står intervallet med en pil åt det håll numren finns. Placering och innehåll: `SITE.streetSigns` i
`src/config.js`.

## Urval

| Plats (modell x, z) | Skyltar | Varför |
|---|---|---|
| Sankt Lars väg × Karpvägen (−71,2, −21,2) | Karpvägen 2–10 ↓ (söderut), Sankt Lars väg | korsning, närmast gånggränsen |
| Sankt Lars vägs sväng vid nordöstra hörnet (17,9, −18,6) | Sankt Lars väg (västra benet), Sankt Lars väg 41–70 ↓ (söderut) | tydlig sväng; inre trottoaren, fri från campusvägens mynning |
| Karpvägens sväng in i parken (−82,2, 68,6) | Karpvägen 2–10 → (västerut), Karpvägen (norra benet) | tydlig sväng, yttre hörnet |
| Sankt Lars väg × Källby ängaväg (−122,2, −35,0) | Källby ängaväg, Sankt Lars väg | korsning (OSM-nod) |
| Källby ängaväg × Alvägen (−137,6, −35,2) | Alvägen, Källby ängaväg | korsning |
| Karpvägen × Källby ängaväg (−202,1, 28,2) | Karpvägen 2–10, Källby ängaväg | Karpvägens bortre ände |
| Sankt Lars vägs förgrening söder om ån (23,4, 212,1) och (51,1, 218,4) | Sankt Lars väg på varje gren | korsning, namn utan nummer (se nedan) |
| Sankt Lars väg × Sävsländegatan / Hattsnäckegränden / Nattsländegatan (132,9, 219,9) | Sävsländegatan 2–20, Hattsnäckegränden 2–12, Nattsländegatan 2–20 | korsning |
| Sävsländegatan × Hattsnäckegränden (223,6, 211,2) | Hattsnäckegränden 2–12, Sävsländegatan | korsning |
| Sävsländegatan × Nattsländegatan (248,0, 204,2) | Sävsländegatan 2–20, Nattsländegatan 2–20 | korsning |

Utan skyltar: campusområdets servicevägar (OSM `highway=service`, en del heter också Sankt Lars väg), gång- och
cykelvägar och vår egen infart till parkeringen. Ingen kollision: stolparna är 7 cm tunna, som de befintliga skyltarna
i `street.js`. Stolpen vid Karpvägen står utanför fotgängarens vändpunkt i `PEOPLE`.

## Källor för namn och nummer

- Gatunamn: OSM-utdragen [`osm-2026-10-08.json`](../../references/surrounding-views/osm-2026-10-08.json) och
  [`osm-south-2026-10-08.json`](../../references/surrounding-views/osm-south-2026-10-08.json) (© OpenStreetMap
  contributors, ODbL, hämtade 2026-10-08). Korsningarnas lägen är OSM-noder registrerade som i #532; vid kvarteret
  följer de Peab-baserade vägarna i `SITE.roads`.
- **Karpvägen 2–10:** Brf S:t Lars Parks hus 1–3 (Karpvägen 10, 6–8, 2–4), identifierade i #575
  ([källor](../issue-575/README.md)).
- **Sankt Lars väg 41–70:** alla `addr:housenumber` på Sankt Lars väg i OSM-utdraget (41–43, 45–49, 54, 56–64, 66, 70);
  samtliga ligger söder om Höje å. Vid kvarteret finns inga karterade nummer, så skylten i svängen visar intervallet
  åt söder. Det är ett **antagande** att inga andra nummer ligger mellan svängen och ån; campusbyggnadernas adresser
  (S:t Lars väg 1 och 88 i `docs/references/east-campus/sources.json`) är enskilda adresser och ingår inte.
- Söder om ån går det inte att avgöra från OSM vilken gren av Sankt Lars väg som bär vilka nummer (flera hus ligger
  50–100 m från båda grenarna, numren är blandade), så de skyltarna visar bara namnet.
- **Sävsländegatan 2–20, Nattsländegatan 2–20, Hattsnäckegränden 2–12:** gatornas kompletta adressuppsättningar i
  OSM-utdraget (jämna nummer).
- Källby ängaväg och Alvägen har inga adresser i utdraget: bara namn.

`tools/streetsigntest.html` kontrollerar att varje intervall är exakt det källbelagda (minsta–största numret).

## Utseende (antaganden)

Blå skylt med vit text och vit ram efter svensk gatunamnsskylt, 1,4 × 0,28 m, överkant 2,95 m, 3 m galvaniserad
stolpe, fet smal sans-serif i stället för Tratex. Allt är visuella antaganden (*guess*) samlade i `SITE.streetSigns`.

## Prestanda

En delad canvasatlas (1024 × 816 px, 15 rutor: en per text och pilriktning) och två sammanslagna meshar för alla 11
stolpar och 23 skyltar: **2 draw calls**, 1 336 trianglar, ingen skugga, inga ljus.

`perfcount.html` före → efter: start 198 → 198, kök 339 → 341, vardagsrum 338 → 340, övervåning 320 → 322,
uteplats 102 → 104, gården 88 → 90, Karpvägen 77 → 79, garage 338 → 340, parken 431 → 433, östra gatan 54 → 56,
stora hallen 343 → 345, källaren 341 → 343. Texturer +1, geometrier +2. Emulerat i headless Chromium, inte uppmätt
på Surface Pro eller telefon.

## Skärmdumpar

| Vy | Bild |
|---|---|
| Sankt Lars väg × Karpvägen från gångområdet | [före](korsning-karpvagen-fore.jpg) / [efter](korsning-karpvagen-efter.jpg) |
| Karpvägsskylten på nära håll | [efter](karpvagen-skylt-nara.jpg) |
| Svängen vid nordöstra hörnet | [efter](svangen-sankt-lars-vag.jpg) |
| Karpvägens sväng in i parken | [efter](karpvagen-svangen.jpg) |
| Sävsländegatan / Hattsnäckegränden (bakgrunden) | [efter](savslandegatan.jpg) |
