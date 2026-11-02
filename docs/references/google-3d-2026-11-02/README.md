# Google Maps 3D reference set, Sankt Lars (2026-11-02)

36 Google Maps 3D screenshots (satellite imagery, labels off; imagery ©2026 Google, Airbus, Maxar Technologies)
collected on 2026-11-02 by the user's Chrome session as reference for the surroundings review of the whole
Sankt Lars area. It complements the nine paired views in [google-3d-2026-10-29](../google-3d-2026-10-29/README.md)
with a systematic sweep: one overview target and seven area targets, each photographed from four (the main
building: eight) compass headings at the same height and tilt.

Kvarteret Lunden itself is still a building site in the imagery (area `04_nybygge`); it is not a reference for
our own houses, only for the plot's surroundings.

## Files

- `bilder/<area>_h<heading>.jpg`: 1456x831 px; `heading` is the camera compass direction in degrees
  (0 = looking north, 90 = east, 180 = south, 270 = west). The Google UI (search box, side menu, controls) and the
  attribution strip are still in the frame: mask or crop them before any image analysis.
- `shots.csv` / `shots.json`: camera data per image (same content); `url` reopens the exact view in Google Maps.
- `oversikt_kontaktark.jpg`: all 36 images as thumbnails.

## Areas (target = image centre, WGS84) and model coordinates

Model `x, z` from `geoToPlan(lon, lat)` in `src/sitegeo.js` (anchor and 58° plan north in `SITE.geo` / `DAY.planNorth`).

| Prefix | Area | Target lat, lng | Model x, z | Height | Tilt | Headings |
|---|---|---|---|---|---|---|
| 00_oversikt | Whole Sankt Lars area | 55.6845, 13.1795 | 26, 108 | 700 m | 50° | 0/90/180/270 |
| 01_huvudbyggnad | Hospital main buildings (Byggnad 1 and 2, Restaurang 41 side) | 55.6837, 13.1774 | 31, 267 | 160 m | 60° | every 45° |
| 02_vastra_kvarteret | Western hospital quarter (Thermo Fisher, large flat-roofed hall, car parks) | 55.6841, 13.1748 | -93, 381 | 160 m | 60° | 0/90/180/270 |
| 03_sodra_bebyggelse | Southern villas and terraced houses (Nattvardsgatan / Säwalwägen) | 55.6827, 13.1794 | 192, 219 | 160 m | 60° | 0/90/180/270 |
| 04_nybygge | The Lunden building site by Sankt Lars väg and the pavilions around it | 55.6853, 13.1801 | -30, 29 | 160 m | 60° | 0/90/180/270 |
| 05_norra_skolor | Northern school quarter (Realgymnasiet, Montessori, white pavilions) | 55.6857, 13.1821 | -1, -101 | 160 m | 60° | 0/90/180/270 |
| 06_kunskapsskolan | Eastern quarter (Kunskapsskolan, Klockhuset, HepCat side) | 55.6845, 13.1817 | 99, -9 | 160 m | 60° | 0/90/180/270 |
| 07_bostader_norr | Housing north (Kallby ängar, slab blocks, white office) | 55.6866, 13.1791 | -186, 5 | 160 m | 60° | 0/90/180/270 |

Google places "Sankt Lars sjukhus" at 55.6836538, 13.1771219.

## Matching a view in the game

Same recipe as the 2026-10-29 set: Google URL camera `@lat,lon,<alt>a,35y,<heading>h,<tilt>t`, game URL
`?at=x,z,yaw,pitch,feetY&shot&time=13&month=9&day=20&freeze&weather=clear` with `x,z = geoToPlan(lon,lat)`,
`yaw = 58 − heading`, `pitch = −(90 − tilt)`, `feetY ≈ alt`, and a 35° vertical field of view set in the page.
The `camera_lat/lng` columns are computed (target − height·tan(tilt) along the heading) and ignore the ~50 m ground
level, so expect the game camera to need a small manual adjustment.

| Image | Google camera | Game `at` (x,z,yaw,pitch,feetY) |
|---|---|---|
| 00_oversikt_h000 | 55.677006,13.1795,700a,0h,50t | 733.3,549.8,58,-40,700 |
| 00_oversikt_h090 | 55.6845,13.1662069,700a,90h,50t | -416.3,815.2,-32,-40,700 |
| 00_oversikt_h180 | 55.691994,13.1795,700a,180h,50t | -681.7,-334.4,-122,-40,700 |
| 00_oversikt_h270 | 55.6845,13.1927931,700a,270h,50t | 467.9,-599.7,148,-40,700 |
| 01_huvudbyggnad_h000 | 55.6812105,13.1774,160a,0h,60t | 266.5,413.5,58,-30,160 |
| 01_huvudbyggnad_h045 | 55.6819397,13.1742775,160a,45h,60t | 93.8,536.7,13,-30,160 |
| 01_huvudbyggnad_h090 | 55.6837,13.1729842,160a,90h,60t | -115.4,501.7,-32,-30,160 |
| 01_huvudbyggnad_h135 | 55.6854603,13.1742775,160a,135h,60t | -238.5,329.0,-77,-30,160 |
| 01_huvudbyggnad_h180 | 55.6861895,13.1774,160a,180h,60t | -203.5,119.8,-122,-30,160 |
| 01_huvudbyggnad_h225 | 55.6854603,13.1805225,160a,225h,60t | -30.9,-3.4,-167,-30,160 |
| 01_huvudbyggnad_h270 | 55.6837,13.1818158,160a,270h,60t | 178.3,31.7,148,-30,160 |
| 01_huvudbyggnad_h315 | 55.6819397,13.1805225,160a,315h,60t | 301.5,204.3,103,-30,160 |
| 02_vastra_kvarteret_h000 | 55.6816105,13.1748,160a,0h,60t | 142.3,528.3,58,-30,160 |
| 02_vastra_kvarteret_h090 | 55.6841,13.1703841,160a,90h,60t | -239.6,616.4,-32,-30,160 |
| 02_vastra_kvarteret_h180 | 55.6865895,13.1748,160a,180h,60t | -327.8,234.6,-122,-30,160 |
| 02_vastra_kvarteret_h270 | 55.6841,13.1792159,160a,270h,60t | 54.1,146.4,148,-30,160 |
| 03_sodra_bebyggelse_h000 | 55.6802105,13.1794,160a,0h,60t | 427.4,366.1,58,-30,160 |
| 03_sodra_bebyggelse_h090 | 55.6827,13.1749843,160a,90h,60t | 45.6,454.2,-32,-30,160 |
| 03_sodra_bebyggelse_h180 | 55.6851895,13.1794,160a,180h,60t | -42.6,72.4,-122,-30,160 |
| 03_sodra_bebyggelse_h270 | 55.6827,13.1838157,160a,270h,60t | 339.2,-15.8,148,-30,160 |
| 04_nybygge_h000 | 55.6828105,13.1801,160a,0h,60t | 205.2,175.4,58,-30,160 |
| 04_nybygge_h090 | 55.6853,13.175684,160a,90h,60t | -176.6,263.6,-32,-30,160 |
| 04_nybygge_h180 | 55.6877895,13.1801,160a,180h,60t | -264.8,-118.3,-122,-30,160 |
| 04_nybygge_h270 | 55.6853,13.184516,160a,270h,60t | 117.1,-206.4,148,-30,160 |
| 05_norra_skolor_h000 | 55.6832105,13.1821,160a,0h,60t | 234.0,45.4,58,-30,160 |
| 05_norra_skolor_h090 | 55.6857,13.1776839,160a,90h,60t | -147.9,133.6,-32,-30,160 |
| 05_norra_skolor_h180 | 55.6881895,13.1821,160a,180h,60t | -236.0,-248.3,-122,-30,160 |
| 05_norra_skolor_h270 | 55.6857,13.1865161,160a,270h,60t | 145.8,-336.5,148,-30,160 |
| 06_kunskapsskolan_h000 | 55.6820105,13.1817,160a,0h,60t | 334.0,137.5,58,-30,160 |
| 06_kunskapsskolan_h090 | 55.6845,13.1772841,160a,90h,60t | -47.9,225.6,-32,-30,160 |
| 06_kunskapsskolan_h180 | 55.6869895,13.1817,160a,180h,60t | -136.1,-156.2,-122,-30,160 |
| 06_kunskapsskolan_h270 | 55.6845,13.1861159,160a,270h,60t | 245.8,-244.4,148,-30,160 |
| 07_bostader_norr_h000 | 55.6841105,13.1791,160a,0h,60t | 49.3,152.0,58,-30,160 |
| 07_bostader_norr_h090 | 55.6866,13.1746838,160a,90h,60t | -332.6,240.1,-32,-30,160 |
| 07_bostader_norr_h180 | 55.6890895,13.1791,160a,180h,60t | -420.8,-141.7,-122,-30,160 |
| 07_bostader_norr_h270 | 55.6866,13.1835162,160a,270h,60t | -38.9,-229.9,148,-30,160 |

## Accuracy and use

- Target points were read off a ~1 m/px aerial image: ±10–20 m. Use them for orientation, not as measurements.
- The images are visual references for footprints, proportions, storey counts, roof forms, facade colours and
  vegetation. Heights, storeys and colours read from them remain *guess* values unless another source (OSM, Peab,
  photos in `docs/foton/`) confirms them. Do not photogrammetrically reconstruct the images or republish them.
- Review focus (the user, 2026-11-02): the near-rectangle bounded by väg 108, Malmövägen, Skånevägen and
  Höjeådalen is where the surroundings should become realistic; the review issues are listed in
  [the environment topic](../../development/environment.md#google-3d-review-2026-11-02).
