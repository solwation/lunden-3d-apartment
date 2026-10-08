# Vind i krukväxterna (#518)

Kontrollerat i verklig Chromium/WebGL med SwiftShader.

- `plantwindtest.html`: 28 PASS. Riktiga fönster och båda ytterdörrarna, stängda/halvöppna/öppna lägen, mjuk start och avklingning, regn och snö, alla växtfamiljer och båda entrénivåerna, hem-batcher och flyttade krukor. Pixeljämförelse visar faktisk bladrörelse i WebGL, även med ordinarie föremålsmarkering; krukornas renderade pixlar är identiska mellan vindfaser. Ordinarie appsteg uppdaterar vinden.
- `wateringtest.html`: 27 PASS, inklusive verklig fyllning/bevattning, flyttning, hemställning, omladdning och återställning.
- `perfcount.html`: ALL PASS. Samma ritningar som efter #516: kök 331, vardagsrum 313, övervåning 297, uteplats 78 och gård 64. Inga nya trianglar, ljus eller renderpass från vindanimationen; bara två uniforms uppdateras. Testet bekräftar också att 100 vindsteg inte skriver om några positionsarrayer.

Loggar finns i denna katalog. Skärmbilden `/tmp/518-plant-wind.png` i sessionsfilerna visar samma två krukor i vardagsrummet under förstärkt vind.

Animationen använder visuella antaganden i `PLANT_WIND`: blad/stjälkars höjd ger böjning, individuella faser/styvheter och mjuka vindbyar varierar rörelsen. Som mest 6 cm per horisontell axel. Alla krukväxter följer öppningarna, även de på uteplatsen/vid entréerna och den konstgjorda eukalyptusen. Det är en gemensam förenklad vindmodell, inte luftflödessimulering mellan rum. Krukor, jord, ursprungliga mått, sparade placeringar och kollisions-/interaktionsgeometri är oförändrade; enbart renderingssfären får svajmarginal.

`zzplanttest.html` har två befintliga testfel både här och i den rena föreversionen `a475cc9`: höjdmätning och antal mesh-objekt inkluderar det osynliga bevattningsmålet. De övriga 11 kontrollerna går igenom i båda versionerna, inklusive flyttning och verklig omladdning. Separat registrerat som [#561](https://github.com/solwation/lunden-3d-apartment/issues/561); loggarna `zz.log` och `zz-baseline.log` visar jämförelsen.
