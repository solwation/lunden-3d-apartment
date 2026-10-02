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
| <kbd>Shift</kbd> | spring (bara utomhus) |
| <kbd>Ctrl</kbd> | håll inne för att huka dig |
| <kbd>←</kbd> <kbd>→</kbd> | vrid |
| <kbd>E</kbd> | öppna/stäng dörren du tittar på, klappa katten, läsa lappen |
| <kbd>F</kbd> | möbler av/på |
| <kbd>Q</kbd> | mät: punkt 1, punkt 2 (tredje trycket rensar) |
| <kbd>M</kbd> | ljud av/på |
| <kbd>Tab</kbd> | håll inne för att se statistiken (<kbd>T</kbd> låter den ligga kvar) |
| <kbd>K</kbd> | visa/dölj bara minikartan (den syns annars ihop med statistiken) |
| <kbd>Esc</kbd> | släpp musen |

**Touch (mobil, surfplatta, Surface):** välj *Touch* på startskärmen (på telefon och surfplatta finns
bara en *Börja*-knapp). Vänster tumme är en joystick
(tryck ut den helt för att springa utomhus), dra med höger tumme för att titta, och tryck på knappen som
dyker upp för att öppna och stänga dörrar. 📊 visar statistiken.

**iPhone:** sidan blir bara helskärm som app, så den ber dig först lägga till den på hemskärmen
(Dela → *Lägg till på hemskärmen*). Appen har egen statistik, skild från webbläsarens.

Öppna dörrar och garderober — ibland sitter det en katt där och tvättar sig. Gå fram och tryck
<kbd>E</kbd> så får du klappa den. 🐈 Statistiken (katter, dörrar, steg …) sparas i webbläsaren; varje
sak du gör visas som en liten bricka ("✋ Klappat katt +1").

Ett dygn går på 60 minuter och varje besök börjar på din egen klocka och dagens datum — de små lamporna tänds själva när det skymmer, taklamporna tänder du med knapparna vid dörrarna. Solen går som i Lund. Med klockan på köksväggen (E) kan du spola tiden fram och tillbaka och pausa, och på kattalmanackan bredvid (E) väljer du datum, för att se hur ljuset faller en junimorgon eller en decembermorgon.

Vad som är nytt står på lappen på frysen i köket (gå fram och tryck <kbd>E</kbd>). Det som
tillkommit sedan ditt senaste besök är markerat *Nytt*.

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

Huset (Hus L, Parklängan), Å-husen A, B och C, vägarna och nivåskillnaden ner mot S:t Lars park
och gården med pergola, grill, lekplats och boulebana är uppmätta på Peabs situationsplan och översiktsplaner (sidor ur planritningsbroschyren ligger i
`docs/peab/`). Solen går efter verkliga väderstreck: entrén vetter mot östnordost.

Inredningen följer våra materialval i Peabs tillvalsportal: köket med grågröna Form Tall-luckor,
överskåp och kyl/frys enligt vår köksritning, Ek Chalk-parkett, klinker i hall och våtrum, kakel i
badrum och WC/dusch, samt tillvalsdörren till Allrum (fyra sovrum på övre plan).

Mått på ritningen är ungefärliga (≈, avrundade till 5 cm). Kontrollera kritiska mått mot Peabs
byggritning.

Teckningar som tejpas upp och teckningen på skrivbordet kan delas mellan alla besökare via en
Cloudflare Worker (kattfotona är personliga och stannar i webbläsaren) – slå på det med `./cloudflare/setup.sh` (se `cloudflare/README.md`).

Mer om lägenheten: https://peabbostad.se/projekt/skane/kv.-lunden/l1007/
