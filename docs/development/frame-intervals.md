# Fånga frysningar (#1507)

Detta är diagnostik, inte en verifierad lösning på #1506. Den drabbade datorn är
inte tillgänglig för agenten. SwiftShader-kontrollerna visar bara funktion.

## Fast scenario och kort insamling på den drabbade datorn

1. Öppna `chrome://gpu`. Spara raderna **Graphics Feature Status → WebGL/WebGL2**,
   **GL_RENDERER**, aktiv GPU och eventuella **Problems Detected**. Notera Chrome-version,
   skärmens Hz och om **Inställningar → System → Använd grafikacceleration när det är
   tillgängligt** är på. Ändra inte GPU/acceleration mitt i en jämförelse.
2. Använd samma revision och ett nytt, separat Chrome-testkonto utan personliga flikar.
   Öppna spelet med
   `?cloud=&life&perf&quality=3&time=12&month=7&day=1&freeze&weather=clear&mess=0&at=3.5,3,0,0`.
   `life` ger ett fast utvecklarhem och varken läser eller skriver personligt återupptaget
   hem. `cloud=` kopplar bort delad speldata. Inget `test`, `lowmem` eller `shot`.
   Använd 1280×800 innehållsyta, webbläsarzoom 100 %, oförändrad DPR. Exporten visar
   verklig viewport/renderstorlek och nivå; om datorns problem bara uppstår med andra
   inställningar, samla dem som ett separat märkt scenario. Stäng av tillägg i testkontot.
3. Låt startens uppvärmning bli klar och välj **Mus & tangentbord**. Exportera vid behov
   uppstarten separat före nästa steg. Fäst DevTools i ett separat fönster så att
   spelstorleken inte ändras. I Console: `__app.hitch.quiet = true` för att undvika
   konsolutskrifter för varje lång CPU-bildruta. Öppna **Performance**, välj ingen CPU-
   eller nätverksstrypning och stäng av skärmbilder/minnesinspelning. Börja inspelning.
4. Kör `__app.hitch.intervals.start()` i Console och återgå till spelet. Gå från
   köket till hallens ytterdörr, öppna/stäng den med E, vänd ett helt varv långsamt,
   gå tillbaka till köket, öppna/stäng kylskåpet med E och stanna vid startpunkten.
   Samma gånghastighet, ingen sprint. Gör ett varv på ungefär 20–30 sekunder.
5. Efter ett hack, stoppa Performance och spara spåret med dess nedladdningsknapp.
   Kör `__app.hitch.intervals.stop().summary` och därefter
   `__app.hitch.intervals.download()` för `lunden-perf.json`. Döp filparet till
   `forsta-varvet.*`. Kör sedan steg 3–5 igen i samma hem utan omladdning och döp paret
   till `upprepat-varv.*`. Om inget hack uppstod, säg det; påstå inte att spåret innehåller
   ett verkligt stopp. Håll varje mätning under en minut och exportera direkt.
6. Bifoga endast den saknade hårdvaruevidensen till #1506: GPU-raderna, inställningarna
   och de två matchande spår/statistikparen, helst med ett faktiskt hack. Granska Chrome-
   spåret före offentlig uppladdning: det kan innehålla webbadresser och maskinuppgifter.
   Dela inte personliga sparfiler, mediebilder, profiluppgifter eller andra flikars innehåll.

Klockans `freeze` stoppar bara speltiden, inte animationen och räknas inte som paus.
Öppna spelmenyn för ett explicit pauskontrollprov. Växla till en annan flik och tillbaka
för ett separat bakgrundsprov; dessa ska inte räknas som aktivt spel. DevTools/fokusbyten
kan själva skapa pauser, vilket gör tillståndsmärkningen nödvändig.

## Vad siffrorna betyder

`__app.hitch.intervals` är en lokal opt-in-logg under `?perf`; ingen nätverkstjänst eller
beständig lagring tillkommer. `start()` nollställer, `stop()` fryser, `export()` ger JSON,
`download()` hämtar den. Utan `perf` startas ingen intervallmätning. Bufferten rymmer högst
3600 intervall (budgetgissning i `PERF.intervals`), cirka 60 sekunder vid 60 Hz. Äldre
prover ersätts och `droppedSamples` redovisas. Statistik avser bara kvarvarande prover.

Callback-start mäts med `performance.now()` före Clock, warm-up, kvalitetsfiltrering och
simuleringens clamp. Även synliga 250 ms–2 s-stopp behålls. Varje intervall har början,
slut och **föregående** callbacks CPU-arbete/faser; det arbetet ligger i intervallet,
medan den nya callbackens arbete hör till nästa intervall. `outsideWorkMs` är resterande
väggtid, inklusive schemaläggning, annan JS, webbläsare, väntan och diagnostik. Den är
inte ett mått på GPU-tid eller bevis för en bestämd orsak. Fasernas delmätningar
(`shadowMap`/`mirror`) överlappar `render` och ska inte summeras igen.

Statistik: vanlig median, nearest-rank p95/p99, max, antal, summerad intervallängd och
strikt **över** 50/100/250 ms. `byState.active` innehåller bara intervall där båda
ändpunkterna var aktiva utan noterad paus/bakgrundsövergång däremellan. Övriga grupper
startup/warmup/paused/background/covered kan överlappa; summera inte deras antal.
Ingen lång bildruta klassas som paus på grund av sin längd. Synlig meny är explicit paus;
telefonens rotationsskydd märks covered. Uppvärmning och första scenbild märks separat.

`timeOrigin + startMs/endMs` ger UTC-ankare i millisekunder. Chrome-spåret innehåller
User Timing `lunden-perf-start` och `lunden-perf-gap` för intervall över 50 ms. Poster rensas
omedelbart ur sidans User Timing-buffer men finns kvar i en pågående Chrome-inspelning.
Exporten har byggrevision, mätkälla, GPU-renderer, context-loss-status, grafiknivå,
viewport/DPR/renderstorlek och vitlistade scenarioparametrar vid start/export. Ändra inte
storlek/inställningar under ett varv. GPU-strängen bevisar inte hårdvaruacceleration.
CPU-tid runt render är inte GPU-tid; program/uppladdningsräknare och heapfall är ledtrådar,
inte uppmätt shaderkompilering, GPU-kostnad eller bevis för GC. Analysera faktisk JS/GC/
kompilering/uppladdning/sparning/GPU i Performance där spåret tillåter, märk resten osäkert.

## Begränsad verifiering och mätpåverkan

`node --test tools/frameintervalstest.mjs` kontrollerar råa långa intervall, föregående
arbete, övergångar, exakta trösklar, ringordning och avstängt/nollställt läge.
`PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/frameintervaltest.cjs BASE OUT` kontrollerar
riktig produktionsloop utan testläge: avsiktliga 300/1000 ms-blockeringar, synlig meny,
nativ flikbakgrund och spårankare. Bilden är den vanliga appen, inga grafikändringar.

`diagnosticMs` summerar bara intervallloggens callback/complete-arbete. Det inkluderar inte
HitchLogs GL-wrappers/fastidtagning, tillståndsläsning, konsolutskrifter, Chrome-inspelning
eller export/sortering. Browserverktyget mäter därför också fem CPU-jämförelser med/utan
hela HitchLog + intervallinsamlingen (10000 callbacks, 50 syntetiska GL-anrop/callback).
Resultatet är ett avgränsat mått på instrumenteringens CPU-kostnad i testmiljön, inte
ett påstående om användarens GPU/FPS. Jämför vid behov samma rutt med/utan `perf` och
med/utan Performance-inspelning på den drabbade datorn. Export/sortering sker på begäran,
inte i spel-loopens normala arbete. Råresultat och lokal mätkostnad redovisas på #1507.
