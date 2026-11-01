# #1757 Gangnam Style i discot

Ritade bilder (`tools/flosstest.cjs … --render`): observatörssidan renderar dansarens spökavatar som den kommer via
Workern (`node cloudflare/dev.mjs`), alltså så som en annan spelare ser dansen. Posen är fryst vid en bestämd tidpunkt.

| Bild | Visar |
|---|---|
| `gangnam-reins.png` | Tömmarna: korsade handleder framför kroppen, böjda knän (höfterna 0,10 m lägre än stående) |
| `gangnam-galopp.png` | Snett från sidan mitt i ett slag: vänster fot lyft och fram, knäna böjda, lätt framåtlutning |
| `gangnam-lasso-vanster.png` | Andra avsnittet: vänster hand svingar lassot över huvudet, höger håller tömmarna |
| `gangnam-lasso-hoger.png` | Fjärde avsnittet, snett framifrån: höger hand tar lassot |

Dansvalet (`tools/dancebuttontest.cjs`): produktionens DOM/CSS och main.js egen dansknappskod med en riktig
`PlayroomMusic` (musik spelar lokalt). Bakgrunden är en platt lila yta, inte rummet (ingen WebGL i den här fixturen).

| Bild | Visar |
|---|---|
| `dansval-dator-1-floss.png` | Dator: musiken spelar, knappen erbjuder "Dansa floss" (G) |
| `dansval-dator-2-gangnam.png` | Dator: under flossen erbjuder knappen "Gangnam Style" (G) |
| `dansval-dator-3-sluta.png` | Dator: under Gangnam erbjuder knappen "Sluta dansa" (G) |
| `dansval-telefon-2-gangnam.png` | Telefon 844×390: pekknappen "Gangnam Style" ovanför de andra knapparna |
| `dansval-telefon-portratt-2-gangnam.png` | Telefon 390×844: samma pekknapp i stående läge |

Kontroller som gick igenom:

- `node --test tools/playroommusictest.mjs cloudflare/players.test.mjs`: 86/86 (nya fall: `dn: 2` vidarebefordras och
  finns i välkomstmeddelandet till sena spelare, ogiltiga värden tas bort, växlingen floss → Gangnam → stopp,
  högtalarmenyns två val, samma slutregler, DJ-båsets knapp som förut).
- `tools/flosstest.cjs`: ALL PASS (23), med dansare och observatör via Workern, spegeln och renderade bilder.
- `tools/dancebuttontest.cjs`: ALL PASS (33) på dator, 844×390 och 390×844.

Inte testat: en riktig telefon och hela appen med båda spelarna i discot.
