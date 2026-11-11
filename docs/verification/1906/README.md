# Sammanhängande ponnyer, #1906

Källa före korrigering: `ebbf466b8b8dbfd463691ed9ad14805d6a853c31`.
Referens: befintliga [Zoey/Princess-fotot](../../ingame-reports/b6346949-f99d-4eb9-af70-4603dae2dceb-2.jpg)
och `ponyGeometry()` från #1293. Alla dimensionsvärden är fortsatt modellantaganden.

## Ändring och visuellt resultat

Den fotoanpassade loftformen (rygg/buk/bog/bakdel, hals/huvud/mule, ben/has/hovar,
man/svans/öron) bakas nu offline i GLB med korrekta inverse bind-matriser och
viktade leder. De flytande cylinder-/lådsegmenten är ersatta. Den ursprungliga
1,32 m-klassen/mankramen och hela modellens öronhöjd cirka 1,91 m bevaras.
Fem separata UV-palettytor behåller vit/grå Zoey och brun Princess med svarta
punkter och vitt pannmärke. Vintertäcken följer den avsiktligt rigida bålen.
Grazing counter-roterar huvudet mot den böjda halsen så mulen når gräset.
Huvudvridning adderas en gång per bildruta, utan ackumulerande idle-vridning.

`0-idle.png`, `1-idle.png`, `1-graze.png`, `0-walk.png` visar hela modeller från
fyra axelvinklar med riktiga produktionsmaterial. `paddock-*.png` visar den riktiga
Paddock-komponenten med dess två individer, staket, gräs, rigg och vintertäcken.
Underlaget är avsiktligt plant för jämförbar modellgranskning: ingen full
lägenhets-/terräng-/fysisk-enhets- eller FPS-verifiering påstås.

## Verifiering

- `node --test tools/riggedponytest.mjs tools/ponyblankettest.mjs
  tools/paddocksurfacetest.mjs tools/paddockgeotest.mjs`: 23/23 passerar.
  Ny regression provar varje verkligt skinnad vertex i neutral pose (maximal
  bindavvikelse under 0,00001 m) och 13 tidpunkter i vart och ett av fem klipp:
  ändliga bounds, inga isärfallande dubbla bentranslationer, hovar nära marken
  och betesmule inom 0–20 cm över underlaget. Råa geometribounds räcker inte.
- Chromium/SwiftShader, Three r170: fyra obeskurna modellserier, därefter riktig
  Paddock med idle/graze/walk/pet, två individer, sommar/vinter och 100 upprepade
  blickuppdateringar. Rätt clip, dolda fallback-material, intakta ankare/täcken
  och ingen ackumulerande huvudvridning; noll sidfel.
- Kombinerad diff och bilder granskade mot fotot och respektive pose. Ingen
  ändrad byggnadsgeometri, habitat, nätprotokoll eller fysik; ingen A/B/C/L-fix.

Geometrikostnad: 1 draw och 1 080 trianglar per ponny (tidigare trasig GLB:
698 trianglar), 72 300 bytes GLB mot 95 524 bytes före rättningen. Två befintliga
ponnyer ger två skinnade draws; täckenas befintliga instansbatch kvarstår.
Ingen uppstarts-/minnes-/FPS-vinst härleds från filstorlek eller tidigare gröna paneler.

## Public och leverans

Publicens `src/paddock.js` använder fortfarande den tidigare anatomiska
`ponyGeometry()` med instansshader; ingen GLB-loader/bindningsbugg eller atlas finns
där. Kroppsformen behålls redan och dess huvudvinkel adderas inte i en mixer.
Ingen relevant regression finns att överföra; inga namn/foton eller gameplay kopieras.

Färdig källkorrigering publiceras med Refs #1906. Det separata Pages-felet #1913
innebär att models/ ännu inte publiceras; aktivera inte globala resurser före alla
modellkorrigeringar. Ärendet behåller dokumenterad integrationsägare och väntar
på #1913 samt faktisk resurs-/produktionskontroll före slutligt avslut.

## Final production acceptance

The corrected assets are published by original commit
`f124511c18d707db9a087e721dfca01c502e70f8`, successful Pages run
[43033851235](https://github.com/solwation/lunden-3d-apartment/actions/runs/43033851235).
BUILD f124511 / CONTENT2d013f8cd9ae: all12 live versioned model responses are
HTTP200 with exact source byte/SHA-256 parity (see #1913 pages.json).
Actual Pages full World startup also passes: all12 requested versioned resources200,
zero page/console errors, two loaded rigged ponies, restored cat geometry and
the loaded sitting Santa. [Combined result](../1914/pages-startup.json).
Whole-model and consumer images above remain source-bound form evidence; no new
form, hardware-phone, global frame-rate or network-gameplay claim is added.
