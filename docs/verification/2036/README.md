# #2036 hit flinch — verification

- `node --test tools/avatarhittest.mjs`: 4/4 pass (spring peak/overshoot/exact zero; distinct front/side/back kicks for head and body;
  the real `Avatar` returns bone-exactly to the unhit pose; `rifleBoxHeadContact` head boxes and the skeleton root unchanged during the flinch).
- `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhittest.cjs http://127.0.0.1:8236 docs/verification/2036`: PASS, 527 MiB peak.
  Crown offset against an unhit twin: head hits 0.12 / 0.10 / 0.12 m (front / side / back), body hits 0.21 / 0.15 / 0.10 m, all 0.000 m at 1.1 s.
- `hit-head.png`, `hit-body.png`: rows front / side / back on another player's `Ghost`, last row our own mirror image (`flinchSelf`);
  columns 0, 60, 100, 160, 260, 420, 1100 ms after the hit (the red cone in the first frame: where the shot came from). `hit.json`: the numbers.
