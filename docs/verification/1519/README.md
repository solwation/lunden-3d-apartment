# Dovare fotsteg (#1519)

Lyssna: [före](before-sequence.wav) · [efter](after-sequence.wav).
Ordningen är två steg vardera på **trä, hårt golv, gräs och grus**.
Det gamla gräs-/grusljudet var samma generella utomhusljud.
Enskilda `.wav`-filer finns för varje variant. Provfilerna används enbart här;
spelet laddar fortfarande inga ljudfiler för fotsteg.

13 kontroller passerar i `tools/footstepstest.cjs BASE OUT`:

- Riktig OfflineAudioContext med samma deterministiska brus: hörbara, klippfria
  signaler, lägre relativ högfrekvensenergi och mindre hopp mellan ljudsamplen
  för alla fyra underlag. Trä/hårt golv har även lägre toppnivå än före.
- Fyra olika klanger. Relativ energi efter ett1800Hz-högpass jämfört med hela
  signalen minskar13,2/9,6/32,9/19,1dB för trä/hårt/gräs/grus. Det är ett
  signalmått, inte en uppskattning av upplevd ljudstyrka eller ett lyssningsbetyg.
- Verklig World väljer rätt för hall, trägolv, stenläggning, uteplats, gräs,
  grus och träbron. Faktisk Player-förflyttning genom spelets ordinarie stegloop
  ger trä-, hårt-, gräs- respektive grussteg. Provet driver kontrollerns tangenter
  med touchläget aktiverat; det är inte ett prov av fysisk joystick.
- Produktionscallback för närliggande spelare väljer samma underlag. Mute,
  utom-räckvidd och taket åtta samtidiga röster passerar. Noll webbläsarfel.

Råresultat och faktiska kontaktpositioner finns i `result.json`. Före-källan är
`7d0a0570` i originalets historia. Web Audio körs i Chromium; appdelen har test=lazy
utan extra ritning. Det görs ingen prestanda- eller fysisk enhetsbedömning.

Det finns ingen meningsfull ändrad spelbild för denna ljudändring. Före/efter-
ljud och konkreta signal-/funktionsprov ersätter därför resultatbilder enligt
undantaget för implementation utan visuellt resultat. Ingen geometri, stegtakt,
förflyttningsfysik eller nättrafik har ändrats. Underlagsvalet är en praktisk
akustisk approximation från befintliga data, inte en fullständig materialkarta.

Det publika kvarteret-lunden har inget ljudsystem/fotsteg. Ändringen gäller
originalets befintliga spelljud; ingen relevant förbättring av gemensam geometri,
rendering eller förflyttning behöver porteras och inget nytt publikt ljudsystem
införs som sidoarbete.
