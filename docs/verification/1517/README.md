# Avatarer på startmenyn (#1517)

`tools/menuportraitstest.cjs BASE LOCAL_WORKER OUT` passerar sex kontroller på den
verkliga startmenyn: egen avatar till vänster om namnet, namngivna/anonyma/äldre
besökare med poäng, omritning vid utseendebyte, uppdaterad online-avatar vid nästa
befintliga heartbeat, smal liggande vy och noll webbläsarfel. Sju Worker-prov i
`cloudflare/scores.test.mjs` passerar, inklusive validering och korrekt avatar
när befintlig aggregering väljer högst poäng för ett återanvänt namn.

Bilderna visar riktiga Canvas2D-avatarer på spelets startmeny. Lokal Worker med
minneslagring och `test=lazy`; inga produktionsdata ändras och ingen prestanda
eller fysisk telefon hävdas. Endast kompakt avatarkod tillkommer i befintlig
närvarouppdatering; inga nya pollningsloopar. Gameplay/Cloudflare överförs inte
till det publika kvarteret-lunden.
