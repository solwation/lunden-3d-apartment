# #2212 skylayertest ground check (test-only)

Cause: the check compared ground views of the frozen pre-change source (`e6f5ce4e:src/daycycle.js`) with the current
DayCycle at ground level in clear/partial/overcast weather. Since #2100 (c54c3b6e, denser haze under rain clouds) and
#2102 (70131cb8, cloud shadows) the weather intentionally changes the ground view (fog/haze), so partial (max 13) and
overcast (max 44) differ from the old source. The cloud deck is not involved (it is culled at ground, `deck.visible=false`).

Fix: the check now compares the current DayCycle with its deck shown vs hidden in the same weather (must be pixel-identical
and the deck must be culled at ground) and keeps the old-source comparison only for clear weather (max <= 1).

Result: `ALL PASSED` (19 checks). Before: `FAIL ground views unchanged across clear/partial/overcast` (1 FAILED).
before.png / after.png are the test's own fixture screenshots (old vs new clear-weather source above the deck).
