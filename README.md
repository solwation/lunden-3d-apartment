# Kv. Lunden L1007 i 3D

Gå runt i lägenheten L1007 (Kv. Lunden, Peab) i webbläsaren som i ett FPS-spel: entréplan och
övre plan med trappan emellan, byggt direkt från den måttsatta planritningen
(`L1007_mattsatt_planritning.pdf`).

**▶ Öppna: https://solwation.github.io/lunden-3d-apartment/**

På insidan av koppskåpets lucka i köket sitter en **uppdragslapp** med tre frivilliga vardagsuppdrag: gör en macka, återställ köket och städa efter mellanmålet. Delarna kan göras i valfri ordning och framstegen sparas. Tips går att stänga av; ett klart uppdrag ger 30 poäng första gången och 5 poäng när du väljer **Gör igen**. Tomma sopkärl behöver inte tömmas.

Föremålet du siktar på blir diskret ljusare när det går att använda. Markeringen följer den aktuella handlingen och försvinner när du tittar bort.

När du håller ett föremål visar en vit kontur var det kan placeras eller lämnas tillbaka. Markeringen följer aktuella möbler och syns bara vid ett giltigt mål inom räckhåll.

Kranarna i kök, tvätt och båda badrummen styrs med blandarspaken: den lyfts när vattnet sätts på och sänks när det stängs av.

I kylen finns en äggkartong: öppna den, ta ett ägg och knäck det i stekpannan på hällen. Påslagen häll steker ägget, som kan serveras på tallrik eller macka och ätas. Pannan och tallriken behöver sedan diskas vid kökskranen.

Tryck **Enter** (eller **>_** på touch) för att öppna terminalen. Fuskkoderna `olof is the goat` och `sarah is the goat` låser upp **Möblera om**: sikta på en möbel, tavla eller en lös spegel, välj med E/klick, sikta på golvet eller väggen och placera med E igen. **R/⟳** roterar och **X/Avbryt** avbryter. De lösa speglarna kan flyttas separat; badrummens fasta speglar behåller sina platser. TV:n placeras ovanpå bänkytan och följer med TV-bänken vid flytt och rotation. Vinstället och vitrinskåpet flyttas på väggar med innehållet kvar; SYMFONISK-lampan och högtalarna kan placeras på fönsterbrädor och bord. Föremål på möbler följer med; mattor flyttas för sig. Bekräftade placeringar delas via Cloudflare och sparas till nästa besök. Knappen **Återställ originalposition** (eller **Home** på tangentbordet) ber om bekräftelse och återställer sedan den valda möbeln eller tavlan med medföljande saker. **Återställ all möblering** varnar innan alla möbler, tavlor och lösa speglar i alla rum återställs. Båda återställningarna delas med alla besökare; **Avbryt** eller **Esc** ändrar ingenting. **Enter** öppnar en klickbar möbleringsmeny med fri muspekare. **Esc** avslutar möbleringsläget och avbryter en osparad flytt.

En liten kompass överst visar N, S, V och Ö. Den röda pilen pekar mot geografiskt norr när du vänder dig.

Diskreta kantlinjer på väggar, dörrar och fast inredning gör hörn och rumsgeometri lättare att urskilja, även i trapphuset och hissen. Skarvar mellan byggdelar på samma plana väggyta filtreras bort; verkliga hörn och öppningar behåller sina accenter.

## Styrning

| Tangent | |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / piltangenter | gå |
| Mus | titta |
| <kbd>Shift</kbd> | spring (bara utomhus) |
| <kbd>C</kbd> | håll inne för att huka dig (sittande: res dig; <kbd>Ctrl</kbd> fungerar också) |
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

*Avsluta* på Escape-menyn försöker stänga fönstret. Om webbläsaren blockerar det visas hjälp för att stänga manuellt.

*Återställ* på startskärmen ställer tillbaka hela hemmet som vid första besöket (dörrar, lampor, saker,
gardiner, möblerna, klockan) — uppsatta teckningar, poängen, namnet på topplistan och kattfotona finns kvar.

Ett dygn går på 60 minuter och varje besök börjar på din egen klocka och dagens datum — de små lamporna tänds själva när det skymmer, taklamporna tänder du med knapparna vid dörrarna. Solen går som i Lund. Med klockan på köksväggen (E) kan du spola tiden fram och tillbaka och pausa, och på kattalmanackan bredvid (E) väljer du datum, för att se hur ljuset faller en junimorgon eller en decembermorgon.

I alla fönster sitter plisségardiner som dras upp nerifrån: gå fram och tryck <kbd>E</kbd>, dra upp och ner med
<kbd>W</kbd> <kbd>S</kbd> (eller ▲ ▼), <kbd>E</kbd> när du är klar. De mörka i sovrummen gör rummet mörkt mitt på dagen.

Alla gardinskenor i taket går från vägg till vägg. I köket hänger även den korta, ljust botaniskt mönstrade kappan över hela bredden, med fönstret fritt under sig.

Vardagsrummet har tre ljusa gardinlängder med samma botaniska mönster och bottenfärg som kökskappan, på en takskena från vägg till vägg, även över balkongdörren. Dra dem åt sidan med <kbd>A</kbd>/<kbd>D</kbd> eller ◀/▶ så att dörren och fönstret lämnas fria.

Högtalarna och bilradion har sex musikkanaler med två låtar var. Även datorn, laptopen och Kaffeturbo spelar
inspelad musik. Under *Om musiken* i menyn finns musiker och källor; alla inspelningar har CC0-licens.
Musiken laddas först när den spelas, med genererad reservmusik om filerna inte går att hämta.

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

Utvecklingsregler och läsanvisningar finns i [CLAUDE.md](CLAUDE.md). Därifrån når du ämnesfilerna i `docs/development/` för bland annat arkitektur, interaktioner, livssimulering, grafik, sparning, verifiering och drift.
