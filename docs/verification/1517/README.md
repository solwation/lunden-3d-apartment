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

Publicerade bilder: [issue-kommentaren](https://github.com/solwation/lunden-3d-apartment/issues/1517#issuecomment-6347792009), låsta till `e624345721976b95b03a0c434050d9ac912ab91b`.
[Pages](https://github.com/solwation/lunden-3d-apartment/actions/runs/39828577873)
och [Worker inklusive wrangler-deploy](https://github.com/solwation/lunden-3d-apartment/actions/runs/39828577818)
passerade.
