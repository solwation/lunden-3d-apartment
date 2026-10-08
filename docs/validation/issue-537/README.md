# Wardrobe seam verification (#537)

The hall G wardrobe faces east (front x 0.8015, z 1.7648–3.0348). Previously its outer track's leaf back was 3 cm beyond the end panel: looking south-west from the entrance exposed coats through that side gap. The 2 cm meeting overlap also left an unbacked 5 mm gap between tracks. Materials are opaque closed box geometry; missing/back-facing surfaces were not the cause.

The shared G/L builder now extends its ends/top/plinth to the outer track, with rebated jambs and upper/lower track lips behind the running gaps. Leaves fit inside the opening and overlap 4 cm; the inner leaf has a moving meeting stile. Tracks retain 1 mm clearance. Joinery dimensions are assumptions in WARDROBE, not measured Peab details. This affects the hall and Sovrum 2/3 wardrobes; SMÅSTAD uses a separate hinged builder.

Browser screenshots before/after were taken at camera positions (x,y,z) (1.3,1.55,0.55) at the entrance, (1.2,1.4,1.7) at the near end, and (1.2,1.4,3.2) at the far end, looking at (0.8,1.2,2.4). Both leaves were closed; after views also show the outer leaf halfway and fully slid across. The entrance's visible clothes slit is covered; the opening exposes coats and shoes normally. Screenshots remain in the session scratch directory as required by verification.md.

Verification in Chromium/SwiftShader:

- wardrobetest: 315 rays through side/meeting/top/bottom seams, angles −80° through +80°, all three wardrobes; both tracks at 25%, 50%, 100%; clear openings; side switching — pass.
- walktest: existing indoor/outdoor/garage routes — pass.
- Browser action buttons: all six sliding leaves can be aimed at and opened; outer leaves close with the button, inner leaves retain their existing close/switch mechanism — pass.
- toystest: open hall wardrobe, take/use/replace its flashlight — pass.
- perfcount: quality scaling/adaptation — pass; no new final draw meshes/materials (stiles merged with leaves, rebates with carcasses).
- opentest: geometry, neighbouring fronts and stocked/hidden contents pass. Existing button failures reproduce unchanged on main f88c00d (#545).
- cattest: all six wardrobe cat locations/reopens pass. Existing missing room-door cat reproduces on main f88c00d (#542).
- detailtest: hall wardrobes drawn from doorstep and doorway pass. Its broad all-ground-door check incorrectly includes the distant portik door (#544).
