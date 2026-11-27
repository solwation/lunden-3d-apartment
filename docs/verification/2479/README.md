# Offline Lighting checker dependency regression (#2479)

The #2394 sky specification added pure window validation and hashes of two window helpers.
The offline AST loader now supplies the pure module and an editor-builder file reference,
without importing Unreal or changing any versioned asset.

Source: `aa5f87fb`. The actual hydrated BP_LundenSky signature matches
`3315df7afc5a3f4c9f61254f43e9d89da0e784a9293eebbb136b52652c73dc4b`.
The existing freshness suite accepts unrelated data and rejects modified cloud/window colours,
lamp position, metadata tag and Blueprint owner. Both commands passed locally against the
real #2394 export/committed package and in [Unreal export CI46004991696](https://github.com/solwation/lunden-3d-apartment/actions/runs/46004991696).
No new RHI run or meaningful result screenshot: this only fixes a Python verification tool.
Original Unreal tooling; no public downstream or web-rendering change.
