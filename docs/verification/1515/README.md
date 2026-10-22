# Lokala spelare och avatarer (#1515)

`players.png` visar den verkliga spelarväljaren med Olof och Sarah, olika sparade
avatarer, ny namninmatning och Ta bort per profil. `after-delete.png` visar att
Olof är kvar efter bekräftad radering av Sarah. Bilderna är från spelets riktiga
startmeny i Chromium, med test=lazy (ingen onödig 3D-ritning bakom menyn).

Verifierat:

- Fem fokuserade lagringsprov: befintlig spelare, UUID-isolering även mellan
  öppna flikar, avatar/sessionsdata, reset, borttagning, skrivfel och den tidiga
  omladdningsskärmens val av rätt spelares session.
- Tretton befintliga avgränsade avatarprov: kodning, reglage och återställning,
  höjd, ansiktsfält och tillbehör. Inga avatarers 3D-modeller har ändrats.
- Nio kontroller på den verkliga spelarsidan, se `result.json`: skapa ny spelare,
  två miniatyrer, återval med exakt UUID/avatarkod/poäng/smuts/dörr/foto,
  omladdning, bekräftelsens innehåll, avbryt, radera annan spelare och radera
  sista aktiva spelaren. Noll webbläsarfel.

Kommandon:

```sh
node --test --test-isolation=none tools/playerprofilestest.mjs
node --test --test-isolation=none --test-name-pattern='avatar customization|#1136 avatar height|#1138 face fields|#1165|#1191|#132' tools/avatarcustomizertest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome node tools/playerprofilesbrowser.cjs http://127.0.0.1:8137 /tmp/playerprofiles1515-verified
```

Lokala sparningar och IndexedDB används; provet ändrar ingen produktionsserver.
Testdata för kattfoton är avsiktligt ett lagringskvitto, inte ett kamerafoto.
Ingen prestanda-, fysisk telefon- eller bred spelregression hävdas. Spelets
lagringshjälpares befintliga hantering av tomma get-resultat spåras separat i
#1516; proven söker i getAll-resultat. Gameplay överförs inte till det publika
kvarteret-lunden.

Resultatbilderna publicerades före stängning i
[issue-kommentaren](https://github.com/solwation/lunden-3d-apartment/issues/1515#issuecomment-6347231414),
med bildadresser låsta till implementationens commit
`802ef6268b7a662f81c7f179e3f5ed31c63fee30`. [Pages-publiceringen](https://github.com/solwation/lunden-3d-apartment/actions/runs/39824566391)
passerade efter implementationen.
