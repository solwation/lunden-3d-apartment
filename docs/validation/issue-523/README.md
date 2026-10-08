# Källarplanen, #523

Peabs försäljningsplan, tryckt sida 46 i [broschyren](../../peab/lunden-planritningsbroschyr-webb-2024-12-18.pdf), jämförd med `docs/peab/kalibrerad/vaning-m1-300dpi.png` (2481 × 3508). Samma kalibrering som tidigare: **x=(px−1909,5)×0,042356, z=(py−1073)×0,042356 m**. Grafisk avläsning cirka ±0,15 m; ingen bygg-/relationsritning eller inmätning.

## Planjämförelse

[Före](plan-before.png) / [efter](plan-after.png): faktiska `GARAGE.rects`, `partials` och `bikes` lagda på originalbilden. Grönt är cykelrum, blått förråd, turkost garage/teknik/hallar, rött dörrrektanglar och orange antagna cykelställ. De tunna linjerna visar modellens golvrektanglar, även skarvar inom samma rum; renderade väggar finns bara mot oanslutna kanter. [Före-konfiguration](config-before.json) kommer från main `19a0121`.

| Avvikelse före | Korrigering |
|---|---|
| Två ställrader bland bilar vid z≈24 | Borttagna; ingen placering här kan fastställas från texten BILPARKERING/CYKELPARKERING. |
| Första CYKEL-rummet i väster och dess södra passage saknades | Rumsgräns och dörr tillagda. Västra södra halvväggar återgivna; ställen följer separata fack. |
| Östra norra CYKEL-rummet saknade anslutningen till LGHFÖRRÅD | Öppen passage vid z=3,2…4,8; egen ståldörr mot södra bandet. |
| 15 extra förråd behandlades som all lägenhetsförvaring | Dessa heter Hyrförråd. Ordinarie LGHFÖRRÅD i C/B/A har egna rum, dörrar och skyltar. |
| Hus C:s LGHFÖRRÅD, korridor och teknikceller saknades | Nordvästra och nordöstra L-formade förråd, södra förrådet, korridor, EL och UC avlästa från planen. Två garageanslutningar till hall och förråd. Miljörummet behålls. |
| Attrappdörrar vid B/A stämde inte med anslutningar | B:s dörr mellan förrådsytorna och A:s nordliga hallanslutning återgivna, med västra/östra/södra förråd, EL och hallar. Nordfasadens tegel är utskuret vid dörrarna. |
| Antagna bilplatser kunde blockera nya verkliga dörrar | Platsrader klipps med 0,25 m antaget sidospel vid ritningens öppningar. Vår plats 18 och båda bilpoolsplatserna behålls. |

## Uttryckliga antaganden och omfattning

Rumsfunktion, horisontella gränser och öppningar avläses från planen. Golvhöjd −3 m, takhöjd, dörrhöjd/-utförande, öppningsriktning, burindelning, innehåll, cykelställens djup och beläggning samt lysrör är fortfarande antaganden. De tidigare 15 hyrburarnas geometri och modellens egen bur 7 behålls; kopplingen mellan bur 7 och L1007 är ett modellval, inte belagt i Peabs material. **22 illustrativa ordinarie burar** (9 C, 6 B, 7 A) är inte ett verkligt förrådsantal eller lägenhetsfördelning. De står inom LGHFÖRRÅD, med fria gångar och egna bakre nätväggar.

C/B/A omfattar källarens förråd och hall-/trappfotsytor. Deras hissar och uppåtgående trappor är fortsatt förenklade, slutna vid källargränsen: inga nya fungerande hissar, andra våningsplan eller lägenhetsinteriörer. UC i C saknar läsbar öppning i underlaget och hålls slutet; omärkta sidoceller heter Källarrum C utan gissad funktion. Modellens fungerande trappa och hiss i **hus L** behålls. Utrymningsplanerna leder till hus L eller garageporten; de är spelmodellens vägvisning, ingen verklig brandskyddsplan. Ordinarie förrådsdörrar och EL-dörrar används via samma E-/tryckinteraktion som tidigare.

Nya rum använder befintliga sensorområden (C: entrance, B: hallW, A: hallE). Lysrör, skyltar, skal och nätväggar sammanfogas per område; stål- och nätblad instansieras. Inga nya dynamiska ljus eller renderpass. Bladens instansskalning följer dörrens avlästa bredd även när den skiljer sig från grundgeometrins 0,9 m, med samma längd i kollision och valbar volym.

Cyklarna är statisk garagegeometri, inga sparade flyttbara föremål. Befintlig hyrbur, bil, bilpool och hus L:s kärna behåller positionerna. Ordinarie resume/unstick hanterar lägen; faktisk omladdning och återställning har testats.

## Bilder från riktig Chromium

| Vy | Före (`19a0121`) | Efter |
|---|---|---|
| Garagehallen, tidigare cyklar bland bilar | [bild](garage-before.png) | [bild](garage-after.png) |
| Västra CYKEL-rummet | [bild](bike-west-before.png) | [bild](bike-west-after.png) |
| Hyrförrådsgång | [bild](rental-before.png) | [bild](rental-after.png) |
| Ordinarie C | [bild](storage-C-before.png) | [bild](storage-C-after.png) |
| Ordinarie B | [bild](storage-B-before.png) | [bild](storage-B-after.png) |
| Ordinarie A | [bild](storage-A-before.png) | [bild](storage-A-after.png) |

Samma kameror före/efter. Före-bilder på de saknade rummen är diagnostiska: kameran står där modellen tidigare saknade källargolv. Efter-bilderna visar faktisk ny burgeometri. Inga referensbilder har ritats om.

## Verifiering

Riktig Chromium med Three.js 0.170.0 och SwiftShader, utvecklingsserver 8149; baslinje 8157 = `19a0121`, garagebaslinje 8156 = `a475cc9` (samma garage före ändringen).

- `basementlayouttest.html`: samtliga kontroller passerar, inklusive 16 fysiskt gångna rutter via Player-kollision till CYKEL, hyrgång, L:s hisshall och C/B/A-förråd/hallfötter; golv −3 m hela vägen, synliga dörrinstanser och kollisionsblad, burbakväggar, bilplats/bilpool och ändliga utrymningsvägar.
- `basementvisittest.html`: normal ray väljer fusklapp och A/B-dörrar; verklig öppning utan täckande tegel; sensorbelysning i alla tre hus; faktiskt sparat besök, omladdning av gammal hyrgång och ny ordinarie gång, sedan full återställning.
- `basementfloortest.html`, `basementhudtest.html`, `walktest.html` och `perfcount.html`: passerar.
- `garagetest.html`: alla funktionskontroller passerar; två **befintliga** knapptextkontroller fallerar även i baslinjen efter #502. `lifttest.html`: alla hiss-/trappkontroller passerar; samma gamla knapptextfel i båda versionerna. Separat **#562**, inte dolt som godkända tester.
- Prestanda: samma 331/313/297 draw calls i kök/vardagsrum/övervåning och 78/64 på uteplats/gård. Källaren har ett par fler områdesbatchar; borttagna hallarcyklar minskar total synlig triangelmängd. Loggarna nedan innehåller faktiska mätvärden.

Alla testloggar finns i denna mapp. Baslinjefelen har egna `*-baseline.log`.
