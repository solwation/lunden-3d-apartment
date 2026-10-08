# Uteplatspalmen, #524

Den befintliga solfjäderspalmen (Trachycarpus) och grå fibercement-/fiberlerkrukan behåller sin modelltyp, x=0,45/z=13,25 och Ø60 ×62 cm. Art och detaljdimensioner är visuella modellval, ingen inmätning. `PATIO.palmDetail` samlar antagandena; `FURNITURE.detailedPalm` aktiverar dem endast för uteplatsens stora palm.

Krukan är svarvad med 48 segment: rundad fot, lätt svängd avsmalnande vägg, mjuk kontinuerlig kant och en verklig invändig vägg ner under jordytan. Jord vid 59 cm, utan den gamla cylinderns solida överlock. Ett delat 128px mineralmönster ger diskret bump. Stammen böjer sig svagt och har fler höjd-/radialsegment, ojämn radie, 280 tunna upphöjda fiberränder och en separat delad 128px barkbump. 16 blad med 17 veckade fingrar vardera ersätter de plana cirkelsektorerna; längder, riktningar, veckning och gröna vertexfärger varierar. Fortfarande en solfjäderspalm, ingen pinnatbladig areca.

Fyra mesh-/materialgrupper (kruka, jord, blad, stam); totalt **10 632 trianglar**, inga individuella småbladsmesh, nya ljus eller renderpass. Små entrépalmer använder fortfarande sin enklare mall. GPU-vind och matchande solskuggor från #518 fungerar på blad/stam; kruka/jord är stilla. `keepInside` håller kronan innanför fasad/skärmvägg. Krukans fotavtryck, befintligt möbel-id och sparade transformationer behålls.

## Bilder från riktig Chromium

| Vy | Före (`1c430f9`) | Efter |
|---|---|---|
| Normal uteplatsvy | [bild](normal-before.png) | [bild](normal-after.png) |
| Krukans kant och jord | [bild](pot-before.png) | [bild](pot-after.png) |
| Kronans silhuett | [bild](crown-before.png) | [bild](crown-after.png) |

[Mobilvy](phone-after.png): Chromium med Android-/touchprofil, 844 ×390. Detta verifierar utseende och touchlayout, inte fysisk telefon-GPU eller uppmätt fps på telefon. Samma kameror i före/efter på dator.

## Verifiering

- `patiopalmtest.html`: faktisk ny geometri, öppen jordyta via vertikal ray, läpp/vägg, detaljerad stam/blad, varierade färger, material-/triangelbudget, vindvikter, verkliga möbelns höjd och väggfrigång, oförändrat fotavtryck samt enklare entrémall.
- `plantwindtest.html`: alla 28 kontroller passerar, inklusive verkliga WebGL-pixlar, stilla krukor, animerade solskuggor, växter i alla familjer och bibehållen fokusshader.
- `walktest.html`: alla gångvägar och kollisioner passerar, även passage uteplats→gård.
- `entranceplantstest.html`: alla kontroller passerar, entrémallar och båda gångstråken oförändrade.
- `perfcount.html`: samma draw calls som före; kök 331, vardagsrum 313, övervåning 297, uteplats 78, gård 64. Högst ungefär 10 000 extra synliga trianglar i vyer där palmen ritas; två 128px texturer. Inget material-/ljusantal per småblad. Se faktiska loggar.
