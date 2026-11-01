# #1763 — ekorr-ledarens tillstånd får en egen lucka

Ingen meningsfull bild: ändringen syns som att en annan spelares rörelse inte längre hackar nära ekorrarna. Bevisen är siffror
från `tools/squirrelratetest.cjs` (två riktiga klienter mot den lokala Workern `cloudflare/dev.mjs`). A leder ekorrarna och
går i en cirkel (r = 4 m, 1,4 m/s) bredvid träden i 30 s, B följer bredvid. "Före" är samma kod med `GHOSTS.stateEvery = Infinity`
(läget `before`), alltså den gamla sändordningen där kön alltid gick före tillståndet.

| A (ledare, går) | Före | Efter |
|---|---|---|
| Totalt, meddelanden/s | 4,20 | 4,17 |
| Tillstånd (`state`)/s | 1,48 | 2,09 |
| Ekorrdjur (`sq.s`)/s | 1,51 | 1,18 |
| Ekorrnötter (`sq.n`)/s | 0,37 | 0,07 |
| Ponnyhagen (`pk`)/s | 0,84 | 0,84 |
| Lucka mellan A:s tillstånd hos B, p50 / p95 / max (ms) | 504 / 983 / 2410 | 484 / 504 / 509 |
| Gånger rummets gräns (6/s) skulle passeras | 0 | 0 |

Bildrutan tog cirka 58 ms (p50) i testet, så 5 Hz-budgeten blir i praktiken cirka 4,2/s (nästa lucka kommer först med nästa
bildruta efter 200 ms). Tillståndet får nu varannan lucka, cirka 480 ms, i stället för de luckor kön lämnade över (upp till 2,4 s).
Den totala trafiken är oförändrad och under rummets gräns. Rådata: [traffic-fore.json](traffic-fore.json),
[traffic-efter.json](traffic-efter.json).

Övriga kontroller med ändringen: `tools/squirrelsynctest.cjs` ALL PASSED (10/10), `tools/resendtest.cjs` ALL PASSED,
`node --test cloudflare/players.test.mjs cloudflare/squirrels.test.mjs` 81/81.

Begränsningar: mätt lokalt med simulerade bildrutor (SwiftShader), inte på ett riktigt mobilnät. Skott (`a`) och fall/konsumtion
går fortfarande före tillståndet som tidigare, så en spelare som skjuter nära ekorrarna kan fortfarande få längre luckor.
