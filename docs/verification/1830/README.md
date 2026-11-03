# #1830 – Kattmatare och utekatten

Kattmatare använder befintliga `catFishFeeds`, första nivån vid 25 fiskar (spelgissning). Worker godtar samma räknare, med 30/minut och 3000 historiska matningar som generösa gissade gränser. Befintliga fem baspoäng per rå fisk ligger kvar; medaljnivåns vanliga bonus betalas separat och en gång.

Hittat och rättat: `OutdoorCats.promote()` satte `on:'sit'`, vilket betyder möbel i CatSpawner och blockerar fiskflödet. Markkatten får nu `on:null`. `leave()` känner igen `outdoorCat` och behåller toningen på plats. Möbel-/bärspärrar i fiskflödet är kvar. `cat.onPet` var redan korrekt kopplad och behövde ingen ändring.

## Kontroller

- `node --test tools/catmedaltest.mjs cloudflare/boards.test.mjs cloudflare/medals.test.mjs`: 24/24 gröna. Nytt test vid 24/25, historik, bonus en gång, klient/Worker överens och Worker-gränser/ingen återställning bakåt.
- `tools/browsertest.sh node tools/catmedaltest.cjs http://localhost:8911 docs/verification/1830`: 7/7 gröna i faktisk app. Hållen rå fisk till roaming Smulan +1/fem poäng; tomhandsklapp till promoted Sotis ger `petted` +1, pågående klapp ger ingen extra; hållen rå fisk till promoted Sotis +1/fem poäng, sedan fade med d 0/förflyttning 0; vanlig innekatts placerade fisk +1/fem poäng; synlig Kattmatare 3/25 och Kattklappare 1/100; inga sidfel. `result.json` innehåller mätvärden.
- `--capture-only` upprepar endast promoted råfiskmåltid för lägre kameravinkel, utan att skriva över acceptansresultatet. `capture-result.json` beskriver ögonblicket.

`diagnostic-before-fix.json` är den första misslyckade körningen: promoted katt ignorerade fisk. Dess innefixture hade dessutom felaktigt möbelmarkör; den rättades till normal golvkatt före gröna körningen. Diagnostiken är inte godkänd verifiering.

## Bilder och gränser

- `outdoor-pet.png`: Sotis på innergårdens gräsmatta efter klapp (åtgärdsmenyns verkliga pet-callback, tom hand).
- `outdoor-held-fish.png`: promoted Sotis under måltid med hållen rå fisk; kameran flyttad efter att måltiden börjat för att visa katten.
- `medal-progress.png`: Kattmatare 3/25 och Kattklappare 1/100 efter verkliga callbacks.

Fångstobjekten skapades med befintliga `Fishing.addFish`/`take`/`placeAt`, precis som tidigare råfisktester. Själva fiskeminispelet och fysisk telefon har inte spelats. Kattklappen körs genom verkliga åtgärdsmenyns callback i webbläsaren, inte en fysisk musgest. Headless-fonten saknar vissa emoji; namn och räknare syns. Inga geometri-/layoutändringar: A/B/C/L-varianter och draw-budgetkontroll är inte tillämpliga. Detta är spelprogression och porteras inte till publikprojektet; ambienta katter hanteras separat i publik #236.

Integration: the catfish and dance catalogue rows were merged together. The scoped dance/cat/gym/duck suites pass 16/16 on the combined source (integration-statistics.txt in #1829 evidence); existing counters and daily ledgers are preserved. Individual browser captures preceded the sibling catalogue merge, which only adds another independent medal card; the tested feeding/dancing progress is unchanged. No duplicate browser run was needed.


Levererat i `79228f12235c0a6e99330e16ec61c0b093f27ce2`. [Pages](https://github.com/solwation/lunden-3d-apartment/actions/runs/41614231300) och [Worker](https://github.com/solwation/lunden-3d-apartment/actions/runs/41614231195) lyckades; Worker-loggen bekräftar faktisk Wrangler-deploy och den publika sidans version.json visar `79228f1`. Dirigentens kombinerade diff-/bildgranskning är klar. Verifieringslänkarna ovan är permanenta; eventuella resultatbilder är granskade och bytekontrollerade. Ingen rutinmässig omkörning av gröna kontroller efter orelaterad integration. Ärendet stängs genom efterföljande verifieringscommit och aktiva etiketter tas bort.
