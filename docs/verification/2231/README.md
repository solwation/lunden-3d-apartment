# #2231 – förstudie av retrospel på datorerna

**Rekommendation:** konceptet är tekniskt möjligt. Börja, efter användarens vägval,
med en avgränsad NES-adapter och en verifierat fritt licensierad titel; därefter
Freedoom i en separat licens-/bygggranskad webbport. Behåll Ormstriden, Klossar och
Meteoriter tills ett faktiskt ersättningsval har gjorts. Ormstriden är dessutom ett
serverberäknat flerspelarspel, vilket en ensam NES-/Doom-instans inte ersätter.
Inga nya implementationer eller barnärenden har köats av denna studie.

Bas `6c2e4f65`. Endast denna rapport och fristående `tools/retro2231/`/bevis tillkommer;
`src`, data, Worker, CI och publicering är oförändrade. Ingen spelarnyhet behövs.
Publika kvarteret-lunden: **inte tillämpligt**, eftersom gameplay och topplistor
uttryckligen är uteslutna där. Hus-/geometrimotsvarigheter berörs inte.

## Licenser och distributionsbeslut

Samtliga nedanstående primärkällor lästes **2026-11-20 (UTC)**. Det är en avgränsad
bedömning av dessa versioner/texter, ingen generell klarering av alla emulatorer,
ROM-filer eller tredjepartsportar. Fri nedladdning är inte automatiskt rätt att
återpublicera eller ändra innehållet.

| Kandidat och motor/emulator | Speldata/rättighet | Publikt källrepo och egen Pages-distribution | Slutsats och primärkällor |
| --- | --- | --- | --- |
| Doom; id:s aktuella källutgåva GPL 2.0, konkret undersökt motor Chocolate Doom **3.1.0**, GPLv2-text | Originalets WAD-filer ingår inte i kodlicensen. Ingen exakt återdistributionslicens för en vald `doom1.wad`-utgåva har verifierats här. | GPL-kod kan distribueras med licens/notiser och full motsvarande källkod inklusive egen webbport och bygginstruktioner; kommersiella WAD-filer godkänns inte genom detta. | Välj fria data. Ingen original-/shareware-WAD importerad. [id README](https://github.com/id-Software/DOOM/blob/master/README.TXT), [id GPL](https://github.com/id-Software/DOOM/blob/master/LICENSE.TXT), [Chocolate 3.1.0 GPL](https://github.com/chocolate-doom/chocolate-doom/blob/chocolate-doom-3.1.0/COPYING.md). |
| Freedoom; behöver separat Doom-motor enligt raden ovan | **BSD 3-clause**, bidragsgivarna behåller upphovsrätten; käll-/binärspridning och ändring tillåts med notiser/villkor, ingen namnsponsring. Granskad datalicens vid `e61c4f86722259ba9f410567156d958c712584a2`. | Ja för licensierade data med full notis; motor och webbverktyg måste klareras separat. Välj en aktuell verifierad release med hash, CREDITS och licens, inte ett gammalt godtyckligt WAD-arkiv. | Säkraste Doom-spåret. Inga data laddades ner i studien. Projektet varnar själv för äldre borttagna upphovsrättsproblem. [Exakt datalicens](https://github.com/freedoom/freedoom/blob/e61c4f86722259ba9f410567156d958c712584a2/COPYING.adoc), [officiella utgåvor/motorer](https://freedoom.github.io/download.html). |
| Duke Nukem 3D / EDuke32 | Officiella EDuke32-sidan anger **GPL och BUILD**, inte enbart GPL. BUILD daterad 2000-06-20 begränsar derivat till internet och gratis/icke-kommersiell distribution samt kräver notiser och märkta ändringar. | Build-licensen är inte en fri allmän GPL-grant. Någon uttrycklig grant för att bädda in en viss shareware-GRP i detta repo/webbport har inte verifierats. GPL-delens exakta versions-/filkombination måste låsas för en framtida port. | **Ingen import rekommenderas nu.** Officiell källsajt kunde läsas men versionspinnad Voidpoint-källfil och äldre 3D Realms-licenssida var otillgängliga; detta är kvarstående klarering, inte antagen rättighet. [EDuke32 licenser](https://www.eduke32.com/), [exakt BUILD-text](https://www.eduke32.com/buildlic.txt). |
| Unreal Tournament 1999 / OldUnreal | OldUnreal erbjuder nu fullständiga gratisinstallatörer och förvaltar koden med Epics avtal. Licensfilen hänvisar till Epic-villkor; detta är ingen identifierad öppen motor-/datakodlicens för vår webbport. | Gratisinstallatören visar tillgänglighet, inte en grant för vårt eget publika ROM-/dataarkiv, konvertering eller WASM-port. Ingen sådan grant verifierad. | **Ingen egen distribution/port nu** utan uttryckligt tillstånd. Undvik det äldre antagandet att spelet inte ens går att få gratis. [Officiell installerare](https://www.oldunreal.com/downloads/unrealtournament/full-game-installers/), [OldUnreal avtal/licens](https://github.com/OldUnreal/UnrealTournamentPatches/blob/86c88bc5ab3eec3bb71c7572f25c5f6dbbd1697f/LICENSE.md), [Epic-villkor](https://legal.epicgames.com/epicgames/tos). |
| NES / **jsnes 1.2.1**, tag `9a312c9…` | Emulatorn är **Apache-2.0**, inte MIT. Vald prototyp-ROM är egen originalkod/grafik **MIT**, med komplett generator och notis. Ingen Nintendo-kod, kommersiell ROM, BIOS eller ljuddata. | Ja för exakt denna kombination med respektive notiser. Det säger inget om en kommersiell ROM eller annan homebrew; varje titel behöver sin egen uttryckliga grant. | Lägst uppmätt teknisk startkostnad. [Exakt emulatorlicens](https://github.com/bfirsh/jsnes/blob/9a312c983be1bbb7dea5e6a6e1aafcdb9496e0cb/LICENSE), [paketmetadata](https://registry.npmjs.org/jsnes/1.2.1), egen `tools/retro2231/LICENSE`. |
| EmulatorJS + libretro NES-kärna | Frontend **GPLv3**, granskad `5a65bde…`; exempel FCEUmm har GPLv2-text och `fceu.c` GPLv2-or-later. Kärnorna och varje ROM har egna villkor; ingen universell EmulatorJS-datalicens. | Villkorligt med komplett exakt frontend/kärna/WASM-källkod/bygge/notiser. Standard-CDN i dokumentationen passar inte vår runtimepolicy; självhosta allt och ta bort onödiga system. | Vänta tills flera konsoler behövs. Inga binärer importerade eller prestanda påstådda. [Frontendlicens](https://github.com/EmulatorJS/EmulatorJS/blob/5a65bde5d3b47c75f22e90453c3c14c469411589/LICENSE), [kärnlicens](https://github.com/libretro/libretro-fceumm/blob/77468e568d9fe9c48d684ca911f1a3fe7259fdf7/Copying), [filgrant](https://github.com/libretro/libretro-fceumm/blob/77468e568d9fe9c48d684ca911f1a3fe7259fdf7/src/fceu.c). |
| Annat fritt: **2048** original webbspel | Gabriele Cirullis kod **MIT**, vid `478b6ec…`; behåll notisen och granska eventuella tillagda typsnitt/medier separat. | Kan distribueras enligt MIT för de täckta filerna; ingen emulator eller kommersiell speldata behövs. | Bra enklare alternativ om målet är fler datoraktiviteter. Inte prototypat eller köat. [Exakt licens](https://github.com/gabrielecirulli/2048/blob/478b6ec346e3787f589e4af751378d06ded4cbbc/LICENSE.txt). |

Super Tilt Bro undersöktes kort som verklig homebrew; dess officiella repo har
[WTFPL-text](https://github.com/sgadrat/super-tilt-bro/blob/master/LICENSE), men komplett
byggd ROM-/mapper-/tredjepartsresurskedja verifierades inte inom den begränsade studien.
Därför används en tydligt märkt egen minimal titel som tekniskt bevis. Den ska inte
presenteras som en ersättning för en färdig, rik retrotitel.

**Befintlig repolicens:** `git ls-files '*LICENSE*' '*COPYING*'` visar endast orchestra-
och three.js-licenser; det finns ingen övergripande `LICENSE` eller package.json i
roten. Offentligt läsbar kod är inte automatiskt fritt licensierad. three.js har sin
MIT-notis i `src/vendor/three/LICENSE`; befintliga medier har separata källvillkor.
Studien relicensierar inget befintligt. Den egna nya prototypen har uttrycklig MIT-notis,
jsnes full Apache-text följer med. Innan GPL integreras måste ägaren välja kompatibel
licens för berörda egna integrationsdelar och leverera motsvarande källkod, patchar,
byggskript och notiser tillsammans med exakt WASM. En separat iframe/processgräns kan
minska kopplingen men är ingen automatisk juridisk garanti för ett derivatverk.

## Teknisk väg, bunden till aktuella konsumenter

`src/computerhub.js` äger fyra stationer, menyval, en kontrollerande session,
CanvasTexture/poster samt `stopInput`/`worldMode`/Esc/E. `src/cinemasurface.js` är en
CSS3D-iframe med djupskrivande apertur, **inte en färdig canvas-till-texturadapter**.
En NES-canvas kan i stället följa monitorns befintliga poster/CanvasTexture, med
256×240-bild, bevarad proportion och `texture.needsUpdate` bara vid färdig bild.
Det är 245760 råa RGBA-byte per uppdatering, cirka 14,1 MiB/s vid 60 Hz före drivrutins-
overhead. Ingen sådan GPU-uppladdning eller samtidig värld mättes här. Återanvänd
monitorn; inför inte ett extra WebGL-context för NES. Doom/WASM bör börja på låg
intern upplösning; ett WebGL-renderat spel kan behöva canvas-kopiering eller separat
DOM-yta, med uppmätt kopierings-/occlusionkostnad innan beslut.

En adapter bör ha `load/start/pause/resume/input/dispose`, en enda instans totalt,
explicit spelarägande och inga emulatorsteg före start, efter lämna, vid förlorad
kontroll, dold flik eller avslutad dator. Paus frigör hållna knappar och ljudkö. Prototypen bär kvar bråkdelstid mellan rAF,
begränsar upphämtningen till tre 60 Hz-steg och tömmer klockan vid paus; detta är
pacinglogik, ingen uppmätt live-60-FPS-garanti.
Återuppta genom användarhandling utan snabbspolning efter bakgrund. ComputerHub har
redan en sådan livscykel för arkadspel, men retrospel ska inte läggas till som ny
sträng i ARCADE utan motsvarande adapter/cleanup. Andra åskådare får senare en separat
bild-/tillståndsdesign; prototypen bevisar inte nätmultiplayer.

Tangentbord: avgränsa till aktiv dator; Esc/E ska lämna enligt dagens capturehandler.
NES behöver styrkors, A/B/Start/Select och pointercancel/blur-release; prototypen visar
profilen. Doom/Duke kräver relativ mus och pekarlås med explicit gest; första Esc
kan förbrukas av webbläsarens upplåsning, så testa pointerlockchange och undvik att
låsa igen automatiskt. Pekskärmsprofilen behöver rörelse/vridning/eld/använd separat,
inte åtta NES-knappar. Ingen sådan FPS-styrning verifierades i detta uppdrag.

`src/audio.js` håller AudioContext/master privat, initieras i gest och använder
rums-/occlusionbussar; det finns ingen allmän PCM-ingång. En riktig emulator behöver
en avgränsad PCM-ring/AudioWorklet eller egen kontext med tydligt mute-/pausansvar.
Rikta ljud till datorns position/rum, inte dubbelspelad direktdestination plus master.
Ett eget utgångssteg behöver API-granskning; prototyp-ROM:en är ljudlös och
`emulateSound:false`, så studien gör inget påstående om ljudlatens/rumsklang.

Ladda motor och ROM först vid val, versionslåsta och självhostade; en misslyckad
laddning ska gå att prova igen. jsnes behöver ingen BIOS/WASM. Kandidaternas exakta
Doom-/EmulatorJS-WASM-/datastorlekar är **inte mätta**, eftersom ingen färdig vald port
har byggts eller hämtats. Uppskatta dem inte från emulatornamnet. Använd innehållshash
för framtida HTTP-cache; gör offline/IndexedDB frivilligt, avgränsat och rensbart.
Ingen ROM-cache eller sparfil i befintlig personlig lagring tillkommer här.

`tools/stamp.sh` kopierar uttryckligen inte `tools/` och räknar inte dem i appens
innehållshash: startladdning och publicerat spel är oförändrade. En framtida integration
måste uttryckligen lägga sina godkända egna assets i publiceringsurvalet utan ny CDN.
[GitHub Pages gränser](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
kontrollerade samma datum: publicerad sajt högst 1 GB och mjuk bandbreddsgräns 100 GB/månad;
licenspermission är en separat fråga. WASM/ROM-resurser måste rymmas i hela sajten.

## Topplistor och fuskgränser

`src/gameboards.js` har lokal fallback/timeout, spelar-id och textsäker visning.
`cloudflare/games.js` tillåter bara `GAME_BOARDS.games`, håller en bästa rad per id och
har rimlighetsgränser för Klossar/Meteoriter. **Inte heller dessa klientpoäng är
fullt bevisade**; källan säger uttryckligen detta. Ormstridens POST avvisas: poängen
skrivs från serverarenan. Behåll den skillnaden.

Retroresultat behöver minst spel-id, ROM-/motorhash, spelläge/svårighet/bana, aktiv
tid och resultattyp. NES-poäng måste läsas från verifierade RAM-adresser för exakt
ROM-hash, inte hittas med allmän scan; prototypens egen $02 är bara ett känt exempel.
Doom kan rapportera bantid, fiender och hemligheter per bana med bestämda sorterings-
regler (tid lägst först, antal högst först), inte pressas in i samma scoretolkning.
Ingen klientrapport kan bevisa att spelaren inte ändrat RAM eller skickat egna HTTP-
resultat. En checksumma från klienten bevisar inte äkthet.

Föreslagna **policyantaganden för senare implementation**, inte nya serverregler:
max ett accepterat slutresultat per spelare/spel/30 s; min 5 s och max 2 h aktiv runda;
begränsa kills/secrets till banans kända totaler och svårighetsvillkor; NES-poäng till
ROM:ens representation och en uppmätt titelbunden maximal poängtakt. Fånga dubbla
round-id, replay-/savestate-/turbolägen och fel versionshash. Misstänkta värden kan
läggas i separat omodererad lista/flagga, inte kallas validerade eller ge allmänna
utmärkelser automatiskt. Befintlig IP-limiter kompletterar detta men hindrar inte
identitetsbyte. Rimlighetskontroller bromsar uppenbara fel, inte motiverat fusk.
Verifierad klass kräver exempelvis deterministisk input-replay i isolerad server-
emulator med CPU-/tidsbudget; det är en separat, betydligt större tjänst.

## Egen prototyp och uppmätt kostnad

`tools/retro2231/`: egen **Fånga ljuset**, NROM, 272 byte 6502-kod plus egen grafik,
full ROM **24592 byte**. Den är spelbar (flytta till gult ljus, RAM-poäng ökar), men
avsiktligt mycket enkel. Omodifierad unminifierad jsnes 1.2.1 **200387 byte** och
Apache-licens **10758 byte**. Sida **2186 byte**, driver **3727 byte**. Före Starta
laddas bara sida/driver: **5913 byte**; motor+ROM först vid klick **224979 byte**.
Gzipuppskattning lokalt: motor 36058, ROM 322, sida 1176, driver 1699 byte, inte
uppmätt nätkomprimering. Lokal Python-server skickar okomprimerat.

`provenance.json` innehåller SHA256 för varje testad källfil, exakt npm-SHA512 och
verifierad oförändrad bundle; arkivet hämtades som data utan npm-installation eller
körning av paketskript. UMD-laddare/API/CPU-/PPU-/mappergränser granskades före körning;
scan hittade inga nät-/DOM-/lagrings-/eval-/Function-anrop. Det är ingen full
säkerhetsrevision av en emulator. Ingen befintlig appdependency introduceras.

Chromium **156.0.8078.4**, Linux headless, Canvas2D, SwiftShader-startflaggor, viewport
960×920 DPR1. **240 varma synkrona prover**, `nes.frame` + pixelkonvertering +
`putImageData`: medel **0,835 ms**, median **0,70 ms**, p95 **1,40 ms**, max **5,10 ms**.
Första uppstartsbilderna är långsammare (bl.a. 30,1 ms i loggen). Dessa siffror gäller
en minimal ROM utan ljud/3D-värld. De visar inte att Freedoom, andra NES-mappers,
60 Hz i ett belastat rum, telefon eller Intel Iris 640 klarar samma budget.
Inget FPS-/fysisk-enhetspåstående. Wrappen saknade systemd-scope; hård minnesgräns
kunde inte verifieras.

## Tre avgränsade kontroller och bevis

1. Primärlicenser tabellen ovan; exakt paketintegritet, oförändrad bundle,
   reproducerbar egen ROM och källhashar. Samtliga tio föredragna npm-källmoduler
   och licensen jämfördes byteidentiskt med det pinnade Git-taggets källor
   (`contracts.txt`); inga paketskript kördes. Licensluckor hålls uttryckligen kvar.
2. Syntaxkontroll av driver/browser, ROM återskapad byteidentiskt, diff-/scopekontroll:
   inga produktionsändringar. Ingen full spel-/Workerprofil behövs för fristående verktyg.
3. Verklig fristående browser **8/8**: lazy motor/ROM, tangentbord påverkar ROM-RAM,
   riktig CDP touchStart/touchEnd påverkar samma RAM, ROM-kollision ökar poäng,
   paus fryser frameantal/fortsätt återupptar, blur-handler pausar, Esc frigör NES-
   instansen, endast samma origin/noll lagringsanrop/noll pageerrors. Blur-eventet
   triggas direkt i testet: native dold-flik/BFCache och pagehide är inte verifierade.
   Första navigeringen misslyckades när serverprocessen inte levde; servern startades
   i bestående exec-session och det avgränsade passet blev grönt. En hittad rAF-avrundning i prototypen korrigerades till ackumulator; samma åtta
   browserkontroller kördes om på slutkällan. Ingen bred matris.

`browser.json` och `browser.txt` binder miljö och mätningar. `prototype.png` är en
öppnad och granskad helsidbild **960×948** i native proportion; canvasens riktiga
256×240-bild visas proportionellt med pixelkant. Ingen före-bild är meningsfull för
en helt ny fristående testsida. Resultatbilden är publicerad och inbäddad i [leveranskommentaren](https://github.com/solwation/lunden-3d-apartment/issues/2231#issuecomment-7044460965) före stängning.
Integrerad som `5077429a7be1962cd781524925eefb0045555e5c`; [Pages-bygget är grönt](https://github.com/solwation/lunden-3d-apartment/actions/runs/44770526172).

## Föreslagna barnärenden – bara text, efter vägval

1. **NES-adapter + vald fri titel**: välj en faktisk öppen titel och verifiera komplett
   kod/grafik/ljud/ROM-licens, eller välj uttryckligen den egna prototyptiteln;
   jsnes-pin/notiser, lazy load, monitor-CanvasTexture och komplett cleanup.
2. **Freedoom-webbport**: lås motor/toolchain/WAD-release, full GPL-källleverans och
   BSD-notiser, mät ljud/CPU/GPU i rummet och på målmaskin innan inkludering.
3. **Pekknappsprofiler och FPS-mus**: NES/FPS-profiler, pointerlock/Esc/E,
   cancellation/fokus och fysisk telefonkontroll.
4. **Titelbundna resultat/topplistor**: versionshash/RAM-/banadapter, separata
   sorteringsregler och tydligt klientrapporterad klass; återanvänd befintlig
   identitet/lokal fallback/IP-limiter. Ingen verifieringsstämpel utan serverbevis.
5. **Eventuellt 2048**: separat enklare MIT-licensierat datorval om användaren föredrar det.

Duke, UT och fler konsoler rekommenderas inte som startbara implementationer med
nuvarande licens-/prestandaunderlag. Ta inte bort de egna spelen i dessa barn;
ett eventuellt borttagningsbeslut ska komma efter att användaren provat en ersättare.
