# Grannlägenheternas öppningar (#516)

Kontrollerat i Chromium med verklig WebGL/SwiftShader. Föreversion: `a475cc9`. Alla befintliga öppningspositioner och mått, fönsterspröjsningar, entrédörrar och takterrasser används fortsatt.

`neighboropeningstest.html`: 21 PASS. Både gata/gård på samtliga fyra våningar, exponerat glas i varje ruta, rutor inom originalöppningar, delad reflektionsmiljö och material, nattbelysning, L1007:s verkliga öppningar och inga nya granninteraktioner. `entrancedoortest.html`: 17 PASS, inklusive genomsikt från båda sidor av L1007:s dörr under rörelse. Grannarnas små entrérutor är nu ogenomskinliga; testet bortser från dörrlampans transparenta ljusdekal när det kontrollerar den första fasta ytan. Takterrasstest och gångtest: ALL PASS.

Prestanda: ALL PASS. Kök 330 → 331, vardagsrum 312 → 313 och övervåning 296 → 297 ritningar per bildruta jämfört med föregående kontroll. Karmar, bågar, tätningar och beslag samlas i materialbatcher. En gemensam reflektionskub på 6 × 128² pixlar; inga extra ljus eller löpande spegelrenderingar. Ingen ny kollisionsgeometri. Se loggarna i denna katalog.

Bilder i sessionsfilerna `/tmp/516-before-*.png` och `/tmp/516-after-*.png`: gatufasad, gårdsfasad, entré nära, uteplatsdörr nära, loftgång, takterrass, sned vy och natt. Granskade karmdjup, tätningar, beslag, glasets varierande reflektion och befintliga upplysta rutor. Gårdens träd skymmer delar av översikten; rutkontrollen täcker även dessa öppningar.

Karmar och bågar följer L1007:s befintliga modell; tätning, gångjärn och reflektionsfärger är visuella antaganden i `NEIGHBOR_OPENINGS`. Reflektionerna visar en förenklad utomhusmiljö, inte en inmätt eller direkt renderad spegling av platsens byggnader. Grannarnas insidor modelleras inte; L1007:s genomskinliga glas och interaktioner förblir separata.
