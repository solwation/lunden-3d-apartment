# #1787: Bättre synlighet och förekomst för ekorrar och nötter i parken och å-dalen

## Sammanfattning av ändringar

Sarah rapporterade från mobil att det blivit för svårt att se och hitta både ekorrar och nötter i parken och å-dalen. Nötterna begränsades i #1742 till att markörerna endast visades mycket nära, och ekorrarna var för sällan på marken och svåra att upptäcka på mindre mobilskärmar.

Följande justeringar har gjorts:

1. **Nötter (`src/config.js`)**:
   - `maxNuts`: ökat från 18 till 20 samtidigt aktiva nötter.
   - `respawn`: snabbare återkomst från `[6, 20]` till `[4, 12]` sekunder.
   - `spread`: bredare spridningsradie från 9 till 11 m runt träden.
   - `nutNearPlayer`: 75 % (upp från 70 %) av nya nötter spawnar inom 65 m (tidigare 60 m) från besökaren.
   - `nutSize`: förstorad från 2.4 till 2.6 för bättre visuell kontrast på mobil.
   - `markDist` och `markFade`: markörglans (glint ring & beam) syns upp till 8 m (tidigare 6 m), med full styrka upp till 4.5 m (tidigare 3.5 m).
   - `nutNear`: nötens detaljmesh renderas upp till 16 m (tidigare 14 m).

2. **Ekorrar (`src/config.js`)**:
   - En tionde ekorre, **Parkekorren**, har lagts till med fokus på å-dalen och parkstråken (skala 1.08, markchans 0.72, lockavstånd 22 m).
   - En fjärde startpunkt har lagts till i å-dalen/parken: `[-105, 185]`.
   - Mitt på dagen-aktiviteten (`day.midday`) har höjts från 0.45 till 0.65, så att ekorrarna rör sig aktivt på marken under dagen.
   - Snabbare sittbeslut (`perch: [3.5, 8]` s) och längre födosök på marken (`forage: [16, 36]` s).
   - Ökade markchanser (`ground`) generellt för alla ekorrar:
     - Den stora: 0.88 (tidigare 0.70)
     - Vitsvansen: 0.55 (tidigare 0.45)
     - Den smala: 0.35 (tidigare 0.30)
     - Parkekorren: 0.72 (ny)
     - Gårdsekorren: 0.85 (tidigare 0.75)
     - Tofsen: 0.70 (tidigare 0.55)
     - Klockan: 0.65 (tidigare 0.50)
     - Rödpälsen: 0.65 (tidigare 0.45)
     - Svartsvansen: 0.60 (tidigare 0.40)
     - Ljusbuken: 0.75 (tidigare 0.60)

## Resultatbilder (mobilvy 390x844)

- `mobil-notter-parken.png`: Nötter på gräsmattan i parken med tydliga glansmarkörer och synliga nötkonturer.
- `mobil-ekorre-parken.png`: Parkekorren under födosök på marken i å-dalen.
- `mobil-ekorre-matning.png`: Matning av ekorre på nära håll med hjärteffekt på mobil.

## Genomförda kontroller

1. **Enhetstester**:
   - `node --test tools/squirrelbraintest.mjs`: **30/30 PASS**. Markchansrelationer bevarade (Den stora > Vitsvansen > Den smala, 81 > 71 > 56 turer).
   - `node --test cloudflare/squirrels.test.mjs`: **10/10 PASS**. Validering av ögonblicksbilder, nöt- och claimlistor med 20 nötter och 10 ekorrar.
2. **Integrationstest**:
   - `tools/squirrelstest.cjs`: **27/27 PASS**. 10 ekorrar i hemområden, nötglans, matning, flykt, vinterfrysning, rumsanslutning och bounds.
3. **Nätverks- och hastighetstest**:
   - `tools/squirrelratetest.cjs`: **ALL PASSED**. Ledare Bo / följare Alma, snapshot-hastighet 1.41/s (krav ≥ 0.5/s), `stateGapAtB` max 496 ms (gräns ≤ 750 ms), 0 rum-överskridanden.
4. **Visuell mobilkontroll**:
   - Skärmdumpar verifierade i mobilvy (390x844).
