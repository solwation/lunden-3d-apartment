# Avsluta i desktopmenyn — #1873

22 kontroller passerade med `tools/quitmenutest.cjs`; källa, miljö och råresultat
finns i [result.json](result.json). `node --check` på main och testdriver samt
`git diff --check` passerade. Testet kördes genom `tools/browsertest.sh` med full
Chromium och det gemensamma browserlåset.

- [Desktopapp](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/2eaf0273ce3228c8322a17a14f72869abea00b42/docs/verification/1873/desktop-pwa.png): Avsluta finns i pausmenyn även i simulerat installerat läge.
- [Telefonläge](https://raw.githubusercontent.com/solwation/lunden-3d-apartment/2eaf0273ce3228c8322a17a14f72869abea00b42/docs/verification/1873/phone-pwa.png): Avsluta och den tomma apprubriken är dolda.

Vanlig desktop, installerad desktop och hybrid med touchpunkter/fint muspekdon
kontrollerades. Riktiga knappval Touch → Mus uppdaterar menyn. Ett simulerat
installationserbjudande håller rubriken synlig när Installera finns. Direkt
stängningsförsök sparar sessionen och visar hjälpen vid nekad stängning.

Installeringssignalen och stängningsnekandet är simulerade; ingen fysisk telefon
eller native PWA-stängning verifierades. Bilderna är faktiskt renderade fulla vyer,
men telefonläget visas vid desktopviewport för att hela menyn ska kunna bedömas.
Ett tidigare testförsök klickade felaktigt bakom Inställningar-dialogen och rättades;
22 gröna kontroller gäller den rättade testdrivern, ingen produktfix gjordes för fixturefelet.

Public AGENTS.md, docs/upstream.md och dess meny granskades. Den publika visningen
saknar Avsluta och installationssektionen; ingen kodport är tillämplig. Husjämförelse
är inte relevant för denna menyändring.
