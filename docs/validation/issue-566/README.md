# Living-room IKEA curtain print (#566)

Reference: [the user's IMG_0571 photo](../../gardiner-vardagsrum-ikea-img-0571.jpg). The photo was taken in warm light; dark green on white follows the user's description. Product name and measured pattern repeat were not supplied.

The living-room fabric now has broad, densely packed organic leaf/flower lobes instead of the kitchen's small herb sprigs. A seamless 1024 px canvas repeat with fine crossed threads supplies both colour and emissive maps. This is a procedural interpretation of the photo, not an identified manufacturer print. The 0.90 m repeat and exact green shade are visual estimates.

The three panels, ceiling track, parking positions, length, fold geometry and saved state IDs are unchanged. Fabric UVs stay fixed as the panels gather. The kitchen valance keeps its original fabric. #499's opacity, diffuse transmission, roughness, backlighting and solid sun shadows remain; no new draw calls, lights or render passes.

## Verification

- `tools/curtaintest.html`: **98 checks passed** for texture coverage/colour, unchanged UVs at open/half/closed, kitchen independence, existing rail/panel clearance, keyboard/touch controls, all six saved positions after reload and daylight/room-light properties.
- Final texture recheck after filling the larger motif gaps: 69.2% dark-green ink, 30.3% white (within the regression bounds).
- Visual comparison in Chromium with SwiftShader at desktop 1100 × 800 and touch 844 × 390, noon and 23:00 with lamps lit, open and closed.
- No physical phone was available; device-specific Safari/Chrome appearance still needs a physical-device check.

Screenshots are kept in the session scratchpad (`/tmp/lunden-566-*.png`), per repository verification rules.
