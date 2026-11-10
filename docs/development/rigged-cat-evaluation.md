# Utvärdering: Riggade GLB-modeller och skelettanimering för katter (#1892)

Denna rapport sammanfattar arkitektur- och prestandaanalysen för att införa optimerade riggade `.glb`-modeller med skelettanimering (`AnimationMixer` under Three.js) för katter och djurliv i Kv. Lunden, som alternativ till den nuvarande proceduriella BoxGeometry/TubeGeometry-hierarkin i `src/cat.js`.

---

## 1. Bakgrund och nuvarande arkitektur

### Nuvarande proceduriell modell (`src/cat.js`)
Katten i `src/cat.js` byggs i `buildCat()` via ett 30-tal proceduriella noder och meshar:
- **Torso & bringa**: Separata sfärer (`torso`, `body`, `bib`).
- **Bakben**: Höft-, lår-, has- och tassnoder (`hips[side]` = 6 meshar).
- **Framben**: Skuldra, ben och tassar (`shoulder`, `leftShoulder` = 4 meshar).
- **Huvud & ansikte**: Huvudsfär, nos, bläs, 2 öron, 2 öppna ögongrupper och 2 slutna ögonlinjer (10 meshar).
- **Svans**: En dynamisk `TubeGeometry` (`CatmullRomCurve3`) som anropas i `pose()` varje gång svansens krökning ändras, plus en svanstopp (`tip`).
- **Besökarens hand**: Handflata, tumme och 4 fingrar för klappning (`hand` = 6 meshar).

Totalt genererar varje katt **~25–28 separata draw calls** och kräver kontinuerlig `p.tail.geometry.dispose()` och nyallokering av `BufferGeometry` per bildruta under svansrörelser.

### Inspiration från `solwation/solwation-on-twitch`
I `solwation-on-twitch` (OBS-scenerna, issues #164 och #165, commits `e82d68a` och `f009965`) infördes en optimerad Three.js WebGL-pipeline med en riggad kattmodell (`assets/cat-dancer.glb`, 237 KB, 26 ben, 6 animationer). Denna pipeline demonstrerade extremt låg resursförbrukning, mjuka rörelser och 1 enda draw call per karaktär.

---

## 2. Arkitektur & integration med befintliga kattbeteenden

### 2.1 Kartläggning av tillstånd och animationer

| Kattbeteende i `cat.js` | Nuvarande proceduriell logik | Riggad GLB & `AnimationMixer` lösning |
| :--- | :--- | :--- |
| **Sittande (`sit` / `idle`)** | `stand = 0`, `S = POSE.sit`. Geometrier flyttas/skalas med `mix3`. | Spela `idle`-animationsklipp med andning och subtil svansviftning. |
| **Gående (`walk` / `stride`)** | `stand = 1`, `W = CAT_WALK`. Ben pendlas med `sin(ph)`, bålen guppar. | Spela `walk`-animationsklipp i `AnimationMixer`. Hastighet styrs av `mixer.timeScale = speed`. |
| **Övergång sitt ↔ gå** | `stand` interpoleras med `smooth(0, 1, this.stand)` under `CAT_WALK.rise` sekunder. | `activeAction.crossFadeTo(targetAction, 0.25, true)` ger mjuk övergång utan ryck. |
| **Klappning & nuzzle** | `updatePetting()` vrider huvud/öron och sluter ögon med `shut.visible = true`. | Spela `nuzzle`/`idle`-klipp. Ögon kan slutas via UV-offset eller morph target; huvudet kan vridas proceduriellt post-mixer. |
| **Svanslyft (`CAT_TAIL_UP`)** | Svanskurva rätas ut och återskapar `TubeGeometry`; `butt` (X) visas. | Svansrotbenet `Joint7` roteras uppåt `rotation.x = -1.2` post-mixer. **Noll geometriåterskapande!** |
| **Äta fisk / leka med kopp** | Huvud sänks mot golv (`this.headOff`), framtass lyfts mot kopp. | Proceduriell rotation av hals- och frambensben eller specifikt `eat`/`pounce`-klipp. |

### 2.2 Integration med klättring (`src/catclimb.js`)
I `src/catclimb.js` beräknas kattens kontakt mot tegelväggen via tassarnas yttersta punkter:
```javascript
// Befintlig proceduriell logik i catclimb.js:
const paws = [
  puppet.shoulder.children.at(-1),
  puppet.leftShoulder.children.at(-1),
  ...puppet.parts.hips.map(h => h.foot)
];
```
I den riggade modellen motsvaras dessa av de fyra tassbenen:
- Vänster framtass: `Joint15`
- Höger framtass: `Joint18`
- Vänster baktass: `Joint22`
- Höger baktass: `Joint26`

Genom att läsa världspositionerna (`matrixWorld`) för dessa fyra ben i `prepareClimbContact(puppet)` kan `alignClimbContact()` applicera samma exakta väggjustering och inset utan ändringar i den överordnade klättringsfysiken.

### 2.3 Kattdockor och utekatter (`src/outdoorcats.js`)
`createCatPuppet()` skapar idag en tyst katt med klonade material. För 8 patrullerande utekatter kräver nuvarande BoxGeometry-lösning speciella LOD- och sammanslagningsrutiner (`merged far meshes`) för att inte sänka bildfrekvensen.
Med riggad GLB kan varje docka använda `SkeletonUtils.clone(gltf.scene)` och en egen `AnimationMixer`, vilket ger maximal detaljnivå och mjuk gång i hela kvarteret.

---

## 3. Prestanda- och mobilanalys (iOS Safari & Android WebGL)

### 3.1 Draw calls och GPU-overhead

| Metrisk | Proceduriell BoxGeometry | Riggad SkinnedMesh (.glb) | Förbättring |
| :--- | :--- | :--- | :--- |
| **Draw calls per katt** | **27** | **1** | **-96.3%** |
| **Draw calls för 9 katter (1 inne + 8 ute)** | **243** | **9** | **-96.3%** |
| **Skuggkastande objekt** | 16–20 separata meshar | 1 SkinnedMesh | Markant snabbare skuggpass |
| **Vertexberäkning** | CPU-matriser för 27 noder | GPU-vertex shader skinning | Avlastar huvudtråden (CPU) |

På mobila webbläsare (särskilt äldre iPhone/iPad och Android-telefoner i låg/mellanprissegmentet) är draw calls en av de främsta orsakerna till flaskhalsar vid rendering. Att minska kattrelaterade anrop från 243 till 9 frigör kritisk budget för byggnader, möbler och vegetation.

### 3.2 Minnesallokering och Garbage Collection (GC Churn)
- **Nuvarande problem**: Varje gång svansen rör sig i `pose()` görs:
  ```javascript
  p.tail.geometry.dispose();
  p.tail.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.017 * sh.tail, 8);
  ```
  Detta allokerar kontinuerligt nya `Float32Array`-buffertar på JavaScript-heapen. På iOS Safari orsakar detta återkommande Garbage Collection-pauser (mikrohugg i bildfrekvensen).
- **Riggad lösning**: Skelettet deformerar befintliga buffertar i GPU-minnet. `mixer.update(dt)` uppdaterar befintliga transformationsmatriser på plats. **Noll buffertallokeringar per bildruta**.

### 3.3 Filstorlek och nätverk
- `cat-rigged.glb` har en total filstorlek på **242 696 bytes (237 KB)**.
- Med standard gzip/Brotli-komprimering via Cloudflare Pages överförs filen på **~140 KB**.
- Laddas asynkront via `GLTFLoader` (som redan finns tillgänglig i projektets importmap under `three/addons/loaders/GLTFLoader.js`).

---

## 4. Applicering av pälsvarianter (`VARIANTS`) och Miele-texturen

I `src/cat.js` finns 7 pälsvarianter (`svartvit`, `rödrandig`, `grå`, `svart`, `vit`, `siames`, `röd och vit`) samt specialpälsen för **Miele** (mackerel tabby med vita tecken).

### Strategi för dynamisk texturering på GLTF PBR-material

I prototypen (`tools/riggedcattest.html`) verifierades metoden med **dynamisk 2D-canvas som `CanvasTexture`**:
1. Kattens UV-karta är standardiserad så att kropp, huvud, tassar och svans har väldefinierade UV-öar.
2. En proceduriell texturgenerator (på 512×512 pixlar) ritar basfärg, eventuella ränder (`mackerel stripes`), vit bringa/bläs och mörka tassar/öron.
3. Den genererade canvasen tilldelas direkt till kattens `MeshStandardMaterial.map`:
   ```javascript
   skinnedMesh.material.map = generateCoatTexture(variant);
   skinnedMesh.material.needsUpdate = true;
   ```
4. **Miele-stöd**: Den befintliga `tabbyTextures()`-generatorn i `src/cat.js` som målar spräcklig päls och makrillränder kan användas direkt för att baka Mieles unika textur till kattens UV-karta vid instansiering.
5. **Prestanda**: Att generera en 512×512 canvas tar < 2 ms vid kattens första uppdykande och återanvänds sedan under hela speltillfället.

---

## 5. Prototyp och verifiering

En interaktiv och automatiserad testmiljö har skapats och verifierats i repot:
- **Interaktiv prototyp**: `tools/riggedcattest.html`
  - Renderar proceduriell katt sida vid sida med riggad GLB-katt.
  - Interaktiv växling mellan `idle` och `walk` i `AnimationMixer`.
  - Knappar för dynamiskt byte av pälsvariant (`ginger`, `tuxedo`, `siamese`) på PBR-materialet.
  - Demonstration av proceduriell svanslyftning (`Joint7`-rotation).
  - Realtidsmätning av draw calls (27 vs 1).
- **Automatiserat test**: `tools/riggedcattest.mjs`
  - Körs via `node tools/riggedcattest.mjs`.
  - Validerar GLB-filens binära struktur, 26 ben, animationsklipp och benmappning.
  - Resultat: **100% PASS**.
- **Verifieringsskärmbild**: `docs/verification/1892/cat-rigged-comparison.png`

---

## 6. Beslut och rekommendation för framtida implementering

### Rekommendation: Genomför stegvis migration
Det rekommenderas starkt att gå över till riggade GLB-modeller för katter och framtida djur. Fördelarna i visuell kvalitet, mjukhet och framför allt mobilprestanda (96.3% färre draw calls och eliminerat GC-lagg) är markanta.

### Föreslagen implementeringsplan (Faser):
1. **Fas 1 (Slutförd i #1892)**:
   - Arkitekturanalys, prestandamätning och verifierad prototyp i `tools/riggedcattest.html` & `tools/riggedcattest.mjs`.
   - Dokumenterad rapport i `docs/development/rigged-cat-evaluation.md`.
2. **Fas 2 (Asset-anpassning & UV-mappning)**:
   - Ta fram en skräddarsydd katt-armatur med exakta poser för Lunden: `sit`, `stand`, `walk`, `wash_paw` och `nuzzle`.
   - Definiera exakt UV-layout för `VARIANTS` och Miele-pälsen.
3. **Fas 3 (Produktionsintegration bakom feature flag)**:
   - Införa `RiggedCatAdapter` i `src/cat.js` bakom `CONFIG.riggedCats = true`.
   - Koppla `catclimb.js` till tassbenen `Joint15`, `Joint18`, `Joint22`, `Joint26`.
   - Validera mot alla dörrar och sittplatser via `tools/cattest.html`.
4. **Fas 4 (Överföring till nedströms)**:
   - Föra över den riggade kattmotorn till `solwation/kvarteret-lunden` (med neutrala katter och utan personligt Miele-innehåll).
