# #2237 – NES-adaptern på datorerna

Kört med `tools/nestest.cjs` (desktop 1100×800 på Speldatorn, telefon 844×390 touch på Lime-datorn), lokal Worker,
Chromium headless med mjukvaru-WebGL. Bilderna är tagna på slutkoden.

- `meny.png` – datorns app-väljare med det nya valet "Spel · NES" bredvid Ormstriden, Klossar och Meteoriter.
- `spel.png` / `spel-textur.png` – Fånga ljuset kör på monitorns befintliga canvastextur (256×240, pixelskarpt,
  bevarad proportion); verktygsraden med NES-knappar, hjälptext och "Om NES och licenser".
- `pekknappar.png` – telefonvy med NES-pekprofilen (◀ ▲ ▼ ▶ Select Start B A, 44 px höga) medan ▶ hålls.
- `result-desktop.json` – uppmätt bildkostnad i spelet (`NesGame.stats()`): emulering median 0,8 ms, p95 1,6 ms,
  max 7,4 ms per NES-bild (241 prover); omritning av monitorn median 0,1 ms, p95 0,2 ms (111 prover).

Kontrollerat: ingen begäran av jsnes eller ROM före Starta (inte heller när NES väljs), därefter bara
`src/vendor/jsnes/jsnes.js` och `data/nes/lightcatch/lightcatch.nes` från samma origin; tangentbord och pekknappar
flyttar spriten (ROM-RAM $00); blur och P pausar och släpper hållna knappar, mellanslag fortsätter; Esc frigör
instansen och inga bilder emuleras efteråt; dold flik lämnar datorn (CinemaPlayer) och frigör instansen.
