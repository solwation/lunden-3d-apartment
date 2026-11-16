# #1997 – välkommen till Lunden

Välkomstbilden visas från HTML innan världen är klar. Den har en lätt dekorativ
husillustration, välkomsttext, aktuell laddningsstatus, topplista och en länk till
inställningar/kontroller. Samma layout finns kvar när de vanliga startknapparna
blir tillgängliga. Inget nytt obligatoriskt väntesteg införs.

Källa: originalets `54515194296242ad46e1982f7fbda0b67df2e9db`.
Publik förlaga jämförd efter read-only fetch av origin/main:
`e9b4e7f88ecc7359bea6c3e89473605438d7e456`; `index.html` och `style.css` är oförändrade
från `8be9d8dd`. Varm färgskala, serifrubrik och luftig startvy är inspirationen;
ingen publik historik eller fullständig sida kopieras. Illustrationen är schematisk,
inte uppmätt husgeometri.

## Genomförda kontroller

- `node --test tools/welcometest.mjs`: **5/5**, [rålogg](node.txt). Begränsning och
  validering av topplista, avstängt läge utan anrop, skrivskyddad GET, tomt svar,
  HTTP-/JSON-/nätfel och avbruten väntande svarskropp.
- **En egen hållen webbläsartur**, Chrome for Testing 156.0.8078.4/SwiftShader via
  `tools/browsertest.sh`, port8797. **52 passerande kontroller** i
  [resultatet/källhasharna](browser.json), [hela körloggen](browser.txt).
  En faktisk desktopvärld och en faktisk telefonvärld laddades, i tur och ordning,
  utan `test`, `shot` eller ändrad varmkörning. Kvalitet0 var låst genom URL för
  rimlig SwiftShader-kostnad. Telefonen använde iPhone-UA,390×844/844×390,
  pekskärm/DPR1 och den riktiga low-memory-/förstabildsvarmkörningen.
- Modulförfrågan började utan Start-gest medan den valfria topplistan fortfarande
  väntade. Kontrollerna öppnades innan main tilläts fortsätta, och samma
  inställningsruta hölls öppen genom riktig plan-/världs-/grafikinitialisering.
  Namnfråga, inbyggda mus-/pekval, pointer lock/ordinarie arm-fallback och start av
  AudioContext genom användargest bevarades. Telefonens befintliga
  installationsruta avfärdades med dess riktiga knapp.
- De berörda äldre inställningskontrakten återanvändes i samma Page: Tab-wrap,
  bevarat chattval, instruktioner utan dubbla lyssnare, återställningsfråga och
  integritetsdialog ovanpå inställningar, fokus efter stängning, samt åtkomst till
  sista valet och stängknappen i liggande läge. Ingen separat äldre helsvit/värld
  startades.
- Slutliga små skalprov, utan värld, kontrollerade den rättade välkomstmodulens
  `cloud=`-avstängning, tidiga inställningar, inline-guardens nätfel/återförsök samt
  att en publicerad lazy config-URL faktiskt bär BUILD.320×568-bilden visar den
  minsta kontrollerade vyn. Hela distributionspaketet/produktionstjänsten kördes
  inte; detta är ett riktat URL-/startprov.

Topplistans fem namn/poäng är syntetiska fixturesvar, inte en kopia av verkliga
besökares resultat. Övriga lokala serverändpunkter var avsiktligt otillgängliga.
Ingen poängöverföring, live Worker, fysisk telefon, WebKit, hörbar ljudkvalitet,
allmän prestanda eller mobil minnesförbättring påstås vara verifierad.
Inga A/B/C/L-byggnader eller geometrivariationer ändras.

## Korrigeringar inom samma tur

Första desktopkontrollen upptäckte att layoutens `display:grid` övertrumfade
`[hidden]` på laddnings-/menylagret. Det rättades med explicita scoped hidden-regler,
injicerades exakt på den hållna desktop-Page:n och hela återstående flödet
fortsatte utan omladdning av dess värld. Telefonen laddade den rättade HTML-källan.
Det ursprungliga misslyckandet är kvar i [browser-initial.json](browser-initial.json).

Telefonens första fortsättning stannade på den befintliga iPhone-installationsrutan;
fixturen kompletterades med dess naturliga ”Spela i webbläsaren ändå”. Samma
telefon-Page fortsatte, utan ny värld. Spårbarhet finns i
[desktopåterupptagningen](../../../tools/welcome1997recover.cjs),
[telefonens kommandogenerator](recovery/phone-generator.cjs) och
[ursprungligt återupptagningsfel](recovery/initial-resume.txt).
Den ursprungliga runnerns cleanup väntade tills den aktiva återupptagningen var klar.
Slutresultatet skrevs med alla52 gröna kontroller och den ägda webbläsaren stängdes;
körningen avslutades med kod0. Inga browser-/serverprocesser lämnas kvar.

Laddnings-/inställningsbilderna från första fasen binder samma produktkod utom den
redovisade hidden-CSS-rättningen och lazy config-URL:ens BUILD/dev-fix; de slutliga
skalproven kontrollerar den senare. Slutkällans hashar finns i `browser.json`.
Bilderna är direkt granskade, och `git diff --check` passerar.

## Bilder

- [Före](before/loading.png): tidigare tomma laddningskortet; behåll tills root
  publicerat den beständiga bildlänken, ta sedan bort i lösningscommiten.
- [Laddning på dator](desktop-loading.png), [redo på dator](desktop-ready.png).
- [Tidiga inställningar](desktop-early-settings.png).
- [Laddning på telefon](phone-loading.png), [redo på telefon](phone-ready.png).
- [Tidiga telefoninställningar](phone-early-settings.png),
  [liggande inställningar](phone-landscape-settings.png),
  [liten telefon](small-phone-loading.png).

Publicen har redan den välkomnande startsida som är förlaga och en egen hjälpvy.
Topplista, spelarflöde, spelets inställningar och molnläsning är originalspecifika;
ingen tillämplig publik överföring behövs.

Separat upptäckt avatar-cachebindning är registrerad som
[original #1998](https://github.com/solwation/lunden-3d-apartment/issues/1998) och har
inte rättats på sidan av. Root äger integration, slutligt changelog-id, bildpublicering
med den delade kommentarskontrollen och stängning av #1997.

## Root integration

Rebase onto `ad20d347` preserves all welcome HTML, scripts, styles and illustration byte-for-byte. Only unrelated vehicle/avatar settings were merged into config.js, and the deployment document keeps #1998 as well. STARTUP and the score configuration are unchanged. Root reviewed the complete diff and all nine evidence images; existing source-bound green checks are reused without another World/browser run. The changelog entry is1538 after final renumbering.
