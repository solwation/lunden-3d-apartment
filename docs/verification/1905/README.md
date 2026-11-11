# Granskning av ny GLB-grafik, #1905

Granskad produktionsbas: `8ef8f8e466436a7ff8ea29e78e1659e368af6658`.
Samtliga 12 nya filer under models/ har granskats med källärendenas faktiska
konsumentbilder, exporter/konsumentkod och fyra hela modellvyer från det nya
verktyget [model-review.html](../../../tools/model-review.html). Råa GLB-vyer är
formdiagnostik, inte produktionsgodkännande: runtime-material, instanser, LOD och
alternativa poses/noder behöver respektive verkliga konsument.

| Modell | Fynd och åtgärd |
| --- | --- |
| pony-rigged.glb | Hals/huvud/ben flyter isär; bindning före rotbenets anslutning. Cylinder-/lådformen behöver anatomiska övergångar. #1906 |
| avatar-rigged.glb | Samma bindspacefel; förlorade utseendeval/accessoarer, delad färgbuffert och nollad pumpdata. #1907 |
| squirrel-rigged.glb | Kubkropp och staplad blocksvans; mjuk form och sammanhängande poser saknas. #1908 |
| duck-rigged.glb | Lådformad kropp, huvud, vingar och upprätt lådsvans. #1909 |
| cat-rigged.glb | Långa ben, litet huvud, förlorade rasskillnader och generiska pälsfält; pärmens återgivning granskad. #1910 |
| fish-generic.glb | Generisk ellipsoid utan ansiktsdetaljer, extra normaliseringsskalning och begränsad artform. #1911 |
| shark.glb | Kropp av ellipsoid/två koner saknar normala hajfenor/ögon/gälar; skelettet förenklat till pinne/skalle/käke. #1911 |
| bicycle.glb | Främre ramrör når inte styrhuvudet efter GLB-bytet. #1912 |
| car-megane.glb | Igenkännbar bil; gamla profil/mått behållna. Ingen belagd ny formregression. |
| car-parked.glb | Igenkännbar bil; konsumentens material/instansfärger behållna. Ingen belagd ny formregression. |
| santa.glb | Faktiska poser igenkännbara. De tidigare resultatbilderna beskär ansikte/fötter; nya hela konsumentvyer krävs vid avslut. Råfilens alternativa ben är inga extra kroppsdelar i konsumenten. |
| pingping.glb | Faktiska vanliga/kramade kudden stämmer med långtidsreferensen. Konsumenten skapar ansiktsmasken, så råfilens blanka framsida är inget produktfel. |

## Bild- och provgränser

`before/` innehåller fyra modellvyer per fil (ponnyn dessutom betande, hajen med
separata delar), fångade i Chromium/SwiftShader via lokal server och Three r170.
`before/models.json` anger verkliga poser, tider, deformerade bounds och triangeldata.
Vinklarna anges i verktyget efter modellens axlar; riktningen framåt skiljer mellan
resurser. Ingen generell råvy bevisar verklig storlek, produktionens texturering,
funktion eller prestanda. Modellernas form och bounding box beräknas efter skinning.

Resultatbilderna i de ursprungliga ärendena granskades även direkt: #1894–#1903.
Deras gröna paneler gav inte godkännande åt den synliga modellen. De sju nya barnen
har separata visuella kriterier, bevarandekrav och avgränsad funktionsverifiering.
Befintliga bilar/Pingping omskapas inte utan påvisat fel.

## Fortsatt arbete

Barnen #1906–#1912 implementeras med nya representativa, obeskurna resultatbilder
före avslut. Föräldern stängs först efter barnens acceptans och slutlig kombinerad
modellgranskning. Generiska relevanta publicförbättringar spåras separat med low;
personligt innehåll/gameplay/tjänster förs inte över.
