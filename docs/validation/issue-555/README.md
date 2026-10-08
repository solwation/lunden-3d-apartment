# Bed making (#555)

Real Chromium/SwiftShader, actual rest touch and make choice menu. All 22 bedcaretest checks pass: exact original arrays/normals, only marked cloth altered, lie vs sit, distinct bunk berths, interruption/double press, repeated cycles, real saved reload and reset.

Made/rumpled images show the same Sovrum 1 bed from the same camera (3/4.87/2.55). Rumpling uses assumed BED_CARE height/pull/time, no new inventory. The same merged geometry is modified; analytic normal deformation preserves smooth cloth, and making restores exact original positions/normals. Frames, mattresses, pillows and collision footprints stay unchanged.

perfcount matches #554 at all spots, including upstairs 296 draws / 379111 triangles. resttest selects the explicit Lie choice on a rumpled bed so its rest/reading-lamp/standing checks still exercise actual touch rather than mistakenly pressing Make.

The updated full resttest passes: 31 seats/beds, every bunk reading lamp, TV sitting, eye clearance/surface-ray checks and all 540 get-ups onto free floor.
