# #1834 – En repetition

Endast `OutdoorGym.status` väljer nu ”repetition” vid exakt 1, annars ”repetitioner”. Den delade gettern används av räckhäv, bänkpress och step-up. Räknare, belöningar, övningstempo och geometri ändras inte.

Verifierat i faktisk app med befintlig station/browser-fixture:

- Läste den verkliga gettern med varje stationsetikett och repetitionsvärden 0, 1 och 2; samtliga nio kombinationer stämmer. Inaktiv status är fortsatt tom. Resultaten finns i `result.json`.
- Gick in i räckhäv med vanlig KeyE, körde en fullbordad cykel och läste ”Räckhäv · 1 repetition”. `one-repetition.png` visar resultatet i spelets statusrad. Endast träningstiden hölls stilla efter den riktiga repetitionen för en läsbar stillbild, enligt befintlig #1828-fixture.
- `git diff --check` godkänd. Ingen ny testsvit behövs för denna reversibla textändring.

Chromium/SwiftShader via `tools/browsertest.sh`, lokal port 8911, `?test=lazy&cloud=&at=-143,33,0,0,5&time=12&month=6&freeze&weather=clear`. Ingen fysisk telefon eller bred spel-/geometriregression testad. A/B/C/L är inte tillämpligt på en gemensam övningsstatus. Ingen publik port: publikgymmet saknar träningsstatus och spelprogression. Ingen ny sakuppgift kräver ändring av utvecklardokumentationen.
