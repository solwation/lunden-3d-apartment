# Slutgranskning av all ny GLB-grafik, #1905

Första granskade bas: `8ef8f8e466436a7ff8ea29e78e1659e368af6658`.
Alla **12 nya modellfiler** inventerades, deras ursprungsärenden #1894–#1903,
resultatbilder, exporter och riktiga konsumenter granskades. Fyra hela modellvyer
med deformerade bounds användes som formdiagnostik; gröna ladd-/storlekspaneler
var inget visuellt godkännande. Den ursprungliga granskningen finns pinnad i
`ebbf466b8b8dbfd463691ed9ad14805d6a853c31`, även efter att före-PNG rensas.
[Ursprungliga mätdata](before/models.json) sparas som historik.

| Modell | Fynd och slutresultat |
| --- | --- |
| pony-rigged.glb | Fel bindspace och lös cylinder-/lådform. Återställd sammanhängande originalanatomi, korrekt bindning, fem poser och individuella färger/täcken; [#1906](../1906/README.md). |
| avatar-rigged.glb | Fel bindspace, förlorade utseenden/accessoarer. Originalrecept och IK-/material-/delreferenser bevarade, sammanhängande poser och val; [#1907](../1907/README.md). |
| squirrel-rigged.glb | Kubkropp och blocksvans. Rundade originaldelar, buskig sammanhängande svans, tio utseenden och fungerande poser; [#1908](../1908/README.md). |
| duck-rigged.glb | Lådformade kropp/huvud/vingar/upprätt svans. Rundade ankor, båda könens fjäderdräkt, vingar/halsring/mindre ögon och riktiga poser; [#1909](../1909/README.md). |
| cat-rigged.glb | Främmande generisk katt, förlorade raser/päls/poser; även OutdoorCats-startkrasch. Återställd artikulerad originalkatt, 37 former, tass-/ögon-/materialreferenser och pärmbilder; [#1910](../1910/README.md). |
| fish-generic.glb | Detaljlös ellipsoid och dubbel normaliseringsskalning. Neutral fen-/ögon-/gäl-/munform i enhetsmått, per-artmått en gång. Befintliga sex detaljerade fångst-/bestiarieformer bevaras; ingen ny undervattensarttopologi hävdas; [#1911](../1911/README.md). |
| shark.glb | Ellipsoid/koner och förenklat pinnskelett. Återanvänd detaljerad originalkropp/fena/skelett, riktiga konsumentfaser. Fångstkroppens avsiktligt avtagna ryggfena bevaras; hel inspektionsvariant separat; [#1911](../1911/README.md). |
| bicycle.glb | Främre ramrör når inte styrhuvudet. Sammanhängande låg instegsram i båda LOD, riktiga gårdsinstanser/placering/proxy; [#1912](../1912/README.md). |
| car-megane.glb | Ingen belagd formregression; igenkännbar bil med tidigare profil/mått. Ny hel bild från riktiga buildCar med fyra dörrpivotar/hjul och ordinarie material; after/cars.png och doors.png. |
| car-parked.glb | Ingen belagd formregression. Ny hel bild från riktiga carGeometry i fyra instansmaterial, med produktionsmått; after/cars.png. |
| santa.glb | Igenkännbar tomte; gamla bilder var beskurna. Hela sitt-/sovvyer med riktig soffa, även flyttad/vriden. Borttagna fallbackhjälpare gav startkrasch och återställs; [#1914](../1914/README.md). |
| pingping.glb | Stämmer med långtidsreferensen docs/pingping-pingvinkudde.jpg. Ansiktsmasken tillförs av riktig konsument och är inte blank som rå-GLB. Ny hel pingpingModel-bild med ordinarie ansiktskarta och samma sammanpressade kramutseende; after/pingping.png. |

## Samlad faktisk leverans

Alla nio originalbarn #1906–#1914 är accepterade och avslutade i
`1ea4a2f46c1fef02bdf8801d57692bf875809060`. Modellerna följer nu med Pages och
modellfiler ingår i innehållshashen; alla tolv laddare får uttrycklig cacheversion.
[Paketering och exakt faktisk 12-filers leverans](../1913/README.md):
`f124511c18d707db9a087e721dfca01c502e70f8`, lyckad Pages43033851235,
BUILD f124511 / CONTENT2d013f8cd9ae, alla versionerade HTTPS-resurser200 och
exakta byte/SHA-256. Dokumentbeviset är pinnat i `00e57653`.

[Hela riktiga Pages-appen](../1914/pages-startup.json) startar med samtliga12 GLB,
utan sid-/konsolfel: två laddade ponnyer, återställd katt och sittande GLB-tomte.
Den tidigare OutdoorCats.bakePose-kraschen är borta efter kattfixen.
Varje barn har egna representativa hela bilder och berörda faktiska konsumentprov;
bilderna är öppnade/granskade och permanent inbäddade före stängning.
Ingen fysisktelefon, global FPS-/minnesvinst, full nätspelsrunda eller automatiskt
bildgodkännande hävdas. Modellerna är avsiktligt stiliserade lågpolymodeller.

De tre nya after-bilderna är en kontrollerad komponent med faktiska buildCar,
carGeometry/instansmaterial och pingpingModel, riktiga GLB/material och hel kamera.
Fyra befintliga carglbtest-fall passerade; alla fyra dörr-/hjulnoder och ansiktskartor
finns, noll sidfel. Bilderna öppnades och granskades. Pingpingbilden visar modellens
kramform, inte en genomförd full Thing/input-interaktion. Poser/mått finns i
[retained-consumers.json](after/retained-consumers.json).

## Publik överföring

Generella ankdetaljer överfördes selektivt i public #266 (`6e557479`), verklig
Pages43033915814 och publicerad scen verifierade. Den neutrala fiskformens relevanta
förbättring spåras i public #267 och måste vara levererad före förälderns slutavslut.
Public behöll redan procedurala häst-/ekorr-/kattformer och har ingen motsvarande
GLB-migration eller cykelfabrik; dessa återställningar/leveransfixar gäller inte där.
Avatar, personlig kattpäls, Pingping, tomte, haj-/fångstspel och tjänster överförs inte.
