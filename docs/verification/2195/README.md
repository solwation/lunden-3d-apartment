# #2195 verification: hoar frost and snow on parked cars

Run: `tools/browsertest.sh node tools/frost2195browser.cjs http://localhost:8462 OUT before|after` (before = BASE_REV 30002987 modules).
Frost morning: `&month=11&day=21&time=8&weather=clear&temp=-4` (natural: cover 0.8). Melt: same at `&time=8.6` (cover 0.21). Snow: `&month=1&day=14&time=12&weather=clear&temp=-3&snow=0.9`.

- `frost-bilar.jpg` / `before/frost-bilar.jpg`: the car park, frost morning: roofs, bonnets, windscreens and rear glass white, lawn strip frosted.
- `frost-bank.jpg` / `before/frost-bank.jpg`: the courtyard from above: lawns, benches and roofs frosted.
- `melt-bilar.jpg`: 8.6, the sun has risen, frost almost gone (traces on the lawn).
- `snow-bilar.jpg` / `before/snow-bilar.jpg`: snow lying (cover 0.9): snow on the parked cars' roofs, bonnets and windscreens.
- `browser-*.json`: draw calls / triangles / programs per view: calls and triangles identical before and after, programs +1.
