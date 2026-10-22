# #1507 — funktionell diagnostik, 2026-10-22

Bas: `227b243e23601f8e4e16893d83020479a92d5d3d`. Endast diagnostik under `perf`;
ingen kvalitets-/spel-/geometriändring. [Insamlingsprotokoll](../../development/frame-intervals.md).

- `node --test tools/frameintervalstest.mjs`: 2/2 PASS; 500/1000/2000 ms råa intervall,
  föregående callback-faser, startup/warmup, övergångar, trösklar och begränsad ring.
- `tools/frameintervaltest.cjs`: CLI0, inga browserfel. Chromium 1248 / SwiftShader,
  normal produktionsloop, `testMode=null`, 480×300, explicit quality0, fast `life`-scenario.
  Avsiktliga 300/1000 ms JS-blockeringar: active max 1034,4 ms, 3 intervall >250 ms.
  Meny: 2 >250 ms; verklig bakgrundsflik: 1 intervall 895,5 ms. Spåret innehåller
  både `lunden-perf-start` och `lunden-perf-gap`. Köksbilden öppnad och granskad.
- Fem syntetiska CPU-jämförelser, 10000 callbacks vardera, 50 fake-GL-anrop:
  extra HitchLog + interval-logg 0,01596–0,03323 ms/callback. Ingen GPU-prestanda
  eller produktions-FPS härleds från denna syntetiska kontroll. Det inbyggda
  `diagnosticMs` mäter bara interval-loggens mindre callback/complete-del.

Första browserförsöket hade korrekt långa aktiva intervall/menypaus/spår men misslyckades
på bakgrundskravet: Playwrights fokus-emulering höll fliken synlig. Det var ett
fixturfel, inte en observerad produktbugg eller godkänd visibility-kontroll. Den färdiga
fixturen återanvänder `nativefixturebrowser.cjs` med noDefaults och verifierar faktiskt
`document.hidden=true` före återgång. Inga krav har tagits bort.

Rådata utanför git: `/tmp/lunden-1507-evidence-final/{result.json,functional-trace.json,normal-app.png}`.
Det tidigare misslyckade försöket ligger separat i `/tmp/lunden-1507-evidence/`.
Browserkontrollen använder touchstart/meny i desktop-viewport; den gör inget anspråk på
fysisk telefon eller full fast-rutt/quality3-benchmark. Alla A/B/C/L behåller identisk
geometri; ingen huslayout berörs. Uppstart/warmup klassificeras i deterministiska testet.

Kvar i #1506: GPU/acceleration/Hz och verkligt Chrome-spår från den drabbade datorn med
matchande första/upprepade varv. Ingen orsak eller löst användarproblem påstås.
Neutral lågprioriterad överföring: solwation/kvarteret-lunden#140.
