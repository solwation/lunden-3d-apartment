# Kv. Lunden L1007 i 3D

Gå runt i lägenheten L1007 (Kv. Lunden, Peab) i webbläsaren som i ett FPS-spel: entréplan och
övre plan med trappan emellan, byggt direkt från den måttsatta planritningen
(`L1007_mattsatt_planritning.pdf`).

**▶ Öppna: https://solwation.github.io/lunden-3d-apartment/**

## Styrning

| Tangent | |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / piltangenter | gå |
| Mus | titta |
| <kbd>Shift</kbd> | spring |
| <kbd>←</kbd> <kbd>→</kbd> | vrid |
| <kbd>E</kbd> | öppna/stäng dörren du tittar på, klappa katten, läsa lappen |
| <kbd>F</kbd> | möbler av/på |
| <kbd>Q</kbd> | mät: punkt 1, punkt 2 (tredje trycket rensar) |
| <kbd>M</kbd> | ljud av/på |
| <kbd>T</kbd> / <kbd>K</kbd> | visa/dölj statistiken / minikartan |
| <kbd>Esc</kbd> | släpp musen |

**Touch (mobil, surfplatta, Surface):** välj *Touch* på startskärmen. Vänster tumme är en joystick
(tryck ut den helt för att springa), dra med höger tumme för att titta, och tryck på knappen som
dyker upp för att öppna och stänga dörrar.

Öppna dörrar och garderober — ibland sitter det en katt där och tvättar sig. Gå fram och tryck
<kbd>E</kbd> så får du klappa den. 🐈 Statistiken (katter, dörrar, steg …) sparas i webbläsaren.

Vad som är nytt står på startskärmen och på lappen på frysen i köket (gå fram och tryck
<kbd>E</kbd>). Det som tillkommit sedan ditt senaste besök är markerat *Nytt*.

## Köra lokalt

```
python3 -m http.server 8137
```

Öppna sedan http://localhost:8137/ i Chrome.

## Hur det funkar

`tools/extract_plan.py` läser väggar, fönster, dörrar, trappa och fast inredning direkt ur
PDF:ens vektordata och skriver `data/plan.json`. Sidan (`index.html` + `src/`) bygger 3D-modellen
med three.js. Mått som inte finns i ritningen (bröstningshöjd, bjälklag, nedsänkt tak i sovrummen
m.m.) ligger samlade i `src/config.js`.

Inredningen följer våra materialval i Peabs tillvalsportal: köket med grågröna Form Tall-luckor,
överskåp och kyl/frys enligt vår köksritning, Ek Chalk-parkett, klinker i hall och våtrum, kakel i
badrum och WC/dusch, samt tillvalsdörren till Allrum (fyra sovrum på övre plan).

Mått på ritningen är ungefärliga (≈, avrundade till 5 cm). Kontrollera kritiska mått mot Peabs
byggritning.

Mer om lägenheten: https://peabbostad.se/projekt/skane/kv.-lunden/l1007/
