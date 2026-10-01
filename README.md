# Kv. Lunden L1007 i 3D

Gå runt i lägenheten L1007 (Kv. Lunden, Peab) i webbläsaren som i ett FPS-spel: entréplan och
övre plan med trappan emellan, byggt direkt från den måttsatta planritningen
(`L1007_mattsatt_planritning.pdf`).

## Styrning

| Tangent | |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / piltangenter | gå |
| Mus | titta |
| <kbd>Shift</kbd> | spring |
| <kbd>E</kbd> | öppna/stäng dörren du tittar på |
| <kbd>Esc</kbd> | släpp musen |

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

Mått på ritningen är ungefärliga (≈, avrundade till 5 cm). Kontrollera kritiska mått mot Peabs
byggritning.

Mer om lägenheten: https://peabbostad.se/projekt/skane/kv.-lunden/l1007/
