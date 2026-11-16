# #1994 – lättare avatarval vid spegeln

Fem kategorier ersätter den långa knapplistan. Hårlängd ligger vid frisyren;
tillbehör har märkta vallistor. Miniatyren ritar samma `Avatar` som spegelbilden,
med Hela/Närbild och vridning. Alla 125 tidigare knappval finns kvar, liksom
ansiktsreglagen, längd, kroppsbyggnad, koder, Slumpa, Återställ och profilsparande.

Utgångsrevision: `b9973faab2f376983f37707390855ee8fc09612e`.
Kontrollerna kördes 2026-11-16 i Chrome for Testing 156.0.8078.4/SwiftShader, lokal server port 8794.
Den egna förhandsvisningen har alltid antialiasering och sin egen 220×310-yta;
huvudappens testläge ändrar inte denna rendering.

## Kontroller och avgränsning

- `node --test tools/avatarcustomizertest.mjs`: **24/24**. Paletter, gamla/nya
  koder, alla utseendefält, Slumpa och sparandets befintliga kontrakt.
  [Rålogg](node.txt).
- `CHROME_PATH=… tools/browsertest.sh node tools/avatarcustomizer1994browser.cjs
  http://localhost:8794 docs/verification/1994`: **27/27**. En riktig huvudapp
  i `test=lazy`, `cloud=` med spegelns `mirrorChoice` och huvudappens ordinarie
  callbacks. Riktiga bildpunkter ändras vid rak/lockig hårlängd (även från sidan),
  näsform, tröjmodell och kroppslängd. Nio tillbehörsval når den riktiga modellen;
  komplett kod sparas genom spelarprofilen, återkommer vid öppning och previewn
  frigörs vid stängning. Inbyggda klick/tangenttryck/CDP-pekrörelser kontrollerar
  kategorier, stående/liggande layout, roteringsskydd och Escape.
  [Resultat och första fasens källhash](app-browser.json), [rålogg](app-browser.txt).
- Bildgranskning upptäckte en egen felgruppering av byxor, som rättades.
  `tools/avatarcustomizer1994correct.cjs` gjorde därefter **14/14** avgränsade
  kontroller utan att starta en ny värld: produktens oförändrade HTML/JS-moduler,
  riktiga Avatar-renderingen och enkla get/set-look-callbacks. Alla kategorier
  har rätt val, byxmodell/färg ändrar riktiga bildpunkter, tillbehörslistorna har
  giltiga val, vridreglaget ryms i liggande läge, Slumpa bevarar tillbehör,
  Återställ återställer hela utseendet och pekskärmens Klar stänger dialogen.
  Slutbilderna nedan kommer från denna korrigerade komponentfas.
  [Slutliga källhashar/resultat](correction-browser.json), [rålogg](correction-browser.txt).

Den gamla handskrivna DOM-mocken i Node-testet ersätts av ovanstående kontroller
av produktens riktiga DOM, modell och profilsparande. Inga andra äldre
webbläsartester kördes; porträttens delade 2D-hjälpare är oförändrad.
Den första före-bildtagningen dolde inte laddningsskärmen; bilderna korrigerades
inom samma webbläsartur med den gamla produktens HTML/customizer och dolt
laddningsskydd. Ingen extra värld laddades för detta.

Alla slutbilder har granskats direkt. `git diff --check` passerar.
Ingen fysisk telefon, WebGL-fel/återställning, generell prestandamätning,
ny nätverkssynk eller kommande materialförändring i #1995 påstås vara verifierad.
Öppningen använder spegelns riktiga valfunktion; testet gör ingen ny
strålplockningskontroll av själva spegelglaset. Ingen A/B/C/L-geometri ändras.
Personligt avatarinnehåll/gameplay: ingen tillämplig publik överföring.

## Bilder

- `before/desktop.png`, `before/hair.png`: gamla knapplistan och 2D-miniatyren,
  tillgängliga tills root har publicerat beständiga bildlänkar och löst ärendet.
- [Kropp](desktop-body.png), [kläder](desktop-clothes.png),
  [tillbehör](desktop-accessories.png): separata lättare kategorier.
- [Kortaste långa håret](hair-short.png), [längsta långa håret](hair-long.png):
  samma avatar/frisyr, faktisk skillnad i 3D utan ändrad kameraposition.
- [Stående pekläge](touch-portrait.png), [liggande pekläge](touch-landscape.png):
  kvarvarande förhandsvisning, kategorier och Klar.

Root ansvarar för slutlig integration/publicering, nytt changelog-id,
inbäddade bilder på ärendet och stängning. Före-bilderna tas bort först därefter.
