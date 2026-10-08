# Husen norrut — #530

Tre återstående hus kompletteras. Rehabiliteringsbyggnaden och Karpvägens husrad fanns redan efter #534 och behålls; Montessori och östra skolhusen från #535 dubbleras inte. Totalt 80 unika kartfotavtryck i de fyra bakgrundsområdena.

## Inventering

| Del | Kartfotavtryck | Åtgärd |
|---|---|---|
| Närmaste rehabiliteringsbyggnaden | 88457595 | Befintlig exakt polygon från #534 behålls |
| Karpvägen 2–4/6–8/10 och tre annex | 342815183/182/181,476125237/238/239 | Befintligt #534 behålls |
| Hunnerupshemmet/85 | 88457603 | Ny polygon, antagna tre våningar och låg takresning |
| Norra vinklade byggnaden | 130578354 | Ny polygon och förenklat plant tak, antagna tre våningar |
| Norra tegelpaviljongen | 88457569 | Ny polygon, antagna två våningar och mörkt sadeltak |

[Registrerad flygbild](registered-north.png): rött nytt, gult befintligt #534, cyan källstråk och ungefärliga parkeringsytor, orange kartbaserad huvudväg. [Planvy före](plan-before.png) / [efter](plan-after.png) visar samma geografiska bildutbredning, norr uppåt, riktig 3D-geometri i ortografisk projektion. Diagnostisk planvy är inte en ny spelarkamera; dimma stängs av just i denna planbild för att kunna jämföra konturer. Några nordliga delar går utanför närbilden; kartpolygonerna innehåller hela byggnaderna.

[OSM-snapshot på main](../../references/surrounding-views/osm-2026-10-08.json). [Referenspaket på separat redan publicerad branch](https://github.com/solwation/lunden-3d-apartment/tree/docs/northern-surroundings-2026-10-08/docs/references/north-buildings): kartöversikt/närbild, flygbild, planbeskrivning/plankarta från 2018 samt [metadata](https://github.com/solwation/lunden-3d-apartment/blob/docs/northern-surroundings-2026-10-08/docs/references/north-buildings/sources.json). © OpenStreetMap contributors (ODbL). Flygbild © Esri, Vantor, Earthstar Geographics and the GIS User Community. Insamlat 2026-10-08, bilddatum okänt.

De historiska handlingarna är samråd 2018-11-29 för PÄ 38/2015,1281K-P259, inte verifierad aktuell antagen plan. Sida 8 anger att byggnad 37 redan rivits; den införs inte. Planförslagets byggrätter blir inte extra hus. Lunden visas under byggnation i flygbilden; våra egna hus fortsätter följa Peabs modellunderlag. Namn/nummer är orientering, inte verksamhetsskyltar.

## Registrering och antaganden

Samma lokala meter och geografiska riktning som kompassen/#532–536: `DAY.planNorth=58°`. `sitegeo.js` använder lokal tangentprojektion med meterskala från latitud 55,684965°; geografiskt norr ger vektorn (−sin 58°,−cos 58°) i modellens x/z, alltså inte automatiskt −z.

Två gemensamma kontroller mot den befintliga modellen används: HepCats OSM-centroid (13,181015825;55,684965075) går till befintligt centrum (32,3;−0,4). Som separat kontroll ger kartans främre gatupunkt (way 60420595) modellpunkt (−32,23;−28,41); den gamla Peab-baserade främre vägmittlinjen vid samma x var z−27, alltså 1,41 m avvikelse. Karpvägens korsningspunkt(−70,98;−28,22) ligger cirka 5 m från den äldre illustrativa svängen vid (−75,8;−27). Detta bekräftar rimlig riktning/meterskala med samma ankare; det är **inte inmätning**. Horisontell registreringsnoggrannhet cirka 3–5 m. Inte alla befintliga gatumått kan tas som verifierade världspunkter.

[Exakt justerad EPSG:3857-bildutbredning](image-extent.json) används för flygbilden 1400×1050; rå latitudinterpolation används inte. Planbildens centrum i modellen är (−99,185;−7,390), bredd 385,908 m och höjd 289,431 m.

Alla nya våningsantal/höjder, fasadkulörer, fönsterdelning, takresning och nordlig marknivå är visuella antaganden. Våningshöjd 3,3 m, Hunnerupshemmets takresning 1,5 m, tegelpaviljongens 3,5 m. Takform tolkas grovt från flygbilden; den vinklade volymen har förenklat plant tak. Inga interiörer eller tillgängliga bakgrundstak. Teglet delar befintlig textur; moderna fasader använder enfärgade material.

## Markmiljö och budget

Sankt Lars vägs fjärrdel följer nu way 60420595:s verkliga sväng mot nordväst. En kort övergång vid x−82,28 ansluter till den gamla raka närvägen z−27, så bilrutternas asfaltsfrigång behålls. De befintliga närkontrollpunkterna från 24,3/−27 och fram till bron/södra vägen behålls. Källby ängaväg och Älg-/Alvägen använder egna kartvägar; source-id finns i `SITE.north`. Beläggningsbredder 5,5/4/2 m är antaganden. Två små hårdgjorda parkeringsband är avlästa i flygbilden; originalpixlar sparas i konfigurationen. Inga nya bilar, markerade platsantal eller skyltar.

39 träd i ungefärliga alléer/dungar tolkade från flygbilden, med antagna storlekar. Befintliga säsongsinstanser återanvänds och angöring/hus hålls fria. Övriga mellanrum är parkmark, inte generell asfalt. Den synliga yttermarken förlängs norrut till z−340 och västerut till x−350; gånggränsen ändras inte. Fem sammanslagna exteriör-/stråkbatchar, 8 380 trianglar; inga nya texturer, ljus eller renderpass. Årsstider påverkar befintliga träd-/snömaterial.

## Riktig webbläsarjämförelse

Chromium, Three.js 0.170.0/SwiftShader. Före=`8c58baa` på 8164, efter=implementationen på 8149. Identiska fria kameror och juni-dagsljus med explicit sommar/vintervegetation/snö. Referenspaketets originalbilder och planförslag hålls åtskilda från den modellerade befintliga miljön.

| Tillgänglig kamera | Sommar före / efter | Vinter före / efter |
|---|---|---|
| Hus L:s framsida x−25/z−8 | [före](front-summer-before.png) / [efter](front-summer-after.png) | [före](front-winter-before.png) / [efter](front-winter-after.png) |
| Västra framsidan x−65/z−10 | [före](westfront-summer-before.png) / [efter](westfront-summer-after.png) | [före](westfront-winter-before.png) / [efter](westfront-winter-after.png) |
| Hörnet x−77,4/z−12 | [före](corner-summer-before.png) / [efter](corner-summer-after.png) | [före](corner-winter-before.png) / [efter](corner-winter-after.png) |
| Hus C:s gångbara tak x−62/z 25, ögon 18,317 | [före](roof-summer-before.png) / [efter](roof-summer-after.png) | [före](roof-winter-before.png) / [efter](roof-winter-after.png) |

Befintliga närhus/bilar/träd får skymma fonden; inget flyttas för kamerorna. [Mobilprofil på framsidan](phone-after.png) använder Android/touch 844×390, inte fysisk telefon-fps. [Nordtest](north.log) kontrollerar faktiska polygoner, inga dubbletter,426 verkliga utåtvända fönster, markkontakt, källstråk och vegetation/frigång.

Biltestets samtliga fyra in-/utrutter håller hela bilen på asfalten efter den korta vägövergången. Fyra äldre knapptextförväntningar fallerar likadant i föreversionen; detta är separat ärende #563. [Efterlogg](car.log) och [ren förelogg](car-baseline.log).

[Gångtest](walk.log), [terrängtest](terrain.log), [åparkstest](park.log), [brotest](bridge.log), [västtest](west.log) och östområdets fönstertest passerar. Terrängen har noll otillåtna steg bland cirka fem miljoner markpar och inga träd på asfalt/beläggning. [Renderingslogg](perf.log) redovisar faktiska anrop/trianglar samt kvalitetsväxling.

Faktiska renderanrop före → efter: kök 330 → 335, vardagsrum 331 → 332, övervåning 310 → 314, uteplats 93 → 94 och gård 82 → 83. Inga extra texturer; cirka 35–38 tusen fler trianglar i dessa vyer, inklusive träd och utökad mark. Automatisk kvalitetssänkning och återhämtning passerar.
