# #2438 — architectural sun shadows, 2026-11-28

Implements the chosen option2 from issue comment7233101448: modern Hus A/B/C body, structural slab/white,
roof and loggia-rail batches cast sun shadows in Unreal, while unmarked objects retain the web flag.
Hus L already casts and keeps its existing policy. This architectural shadow difference is intentional;
web rendering and the source castShadow=false evidence are preserved. These are four explicit source-provenance
batches, not a position/size/material-name guess or a blanket override for all buildings.
Existing window frames merged into structural white and vent hoods merged into roofs share their batch's flag;
separate lamps, plants, windows and small meshes keep their source rules. Historic/background buildings are unchanged.

Source worker31c6a8ec, integrated as9da9bb9d, changes export metadata/import policy only. A real ten-zone export
passed normal validation:11files,9402nodes,323sources. Nine GLBs are byteexact to the frozen prior runtime export.
Only kvarteret.glb changes, with precisely four unrealArchitectureShadow=true fields. All ten BIN chunks and
all remaining GLB JSON, including IDs/transforms/geometry/materials/images, are exact. Measurements differs only sourceCommit.
Source-policy JavaScript and two actual-importer-function behaviour checks passed, including oldOFF→ON reapplication,
unmarked small-object controls and malformed marker rejection. The exact checked source was reviewed and reused.

One actual rendered editor invocation took258.488seconds and completed Native/runner/outer0/0/0. It ran normal
import_world only for kvarteret, normal --check, existing Interaction class checks, then the normal build_entrances
method scoped to kvarteret with its existing Blueprint classes. This updated the Interaction level actually streamed
by L_Lunden; changing only the raw imported level would not have changed the game.128 swing doors and one overhead door
remain in that normal copy. No authored class/material was rebuilt, and no new global stamp is fabricated.

After actual saved Interaction-map reload,4architecture components were ON despite sourceOFF,430unmarked sourceOFF
components remained OFF and42sourceON/default components remained ON. In the final composed world the same4overrides,
573sourceOFF and1094sourceON/default components passed their exact per-source checks across kvarteret and Hus L.
The imported raw level also passed normal ID/collision/double-sided/material/override/fingerprint/shadow checks.
Only467kvarteret files and its one Interaction map changed; all other Generated outputs were byteexact.
Independent disk postflight verified all247public authored assets exact/read-only, source/export unchanged after staging,
the post-import Generated baseline unchanged through capture, and clock/weather/lamps/visibility/calendar/RTC/CVars restored.
No authored assets were saved and no own LFS lock was required. Three unrelated pre-existing TileStandard locks remain untouched.

Raw640×360 images use originalVFOV72/cameras: entrance-a and courtyard on21June2026 at14:00clear/lampsOFF;
facade-c-day on16November2026 at14:00clear/lampsOFF. Source references are existing1440×810 images with pinned hashes
and historical camera contracts in native-control-plan.json. Cumulative cloud/time offsets were not fully snapshotted
in those older references, so these are architecture comparisons, not byteidentical complete-frame claims.
The entrance/courtyard views visibly show the new house shadow on the walk/lawn; C confirms the separate facade/rail view.

Whole frames were reviewed. The darker large-house/rail shadows are the intended #2438 difference. Existing colour/lighting
limits remain open: grass/crowns#2437, hedge/sign#2411, distant facade/grout#2428, low-winter sun colour#2398,
environment response#2424 and transparent lighting#2459. Railing raster#2483, walk stipple#2497 and distant window edge#2498
remain open. C's softer diagonal shadow contours are tracked in open #2502 rather than silently accepted here.
No older failed colour criterion is changed or counted as passed. Future colour comparisons must distinguish sunlit/shaded
receivers under this intentional architecture policy.

CPU VulkanSM5 is the actual rendered profile; physical Windows/GPU/Lumen quality and performance were not tested.
No fresh canonical20, global sync stamp, release gate or Shipping/release recook is claimed. Existing Linuxbeta0.3 is unchanged.
This is an original-only Unreal change: its source metadata changes no web pixels and has no downstream web implementation
that should be transferred. No gameplay, personal content or Cloudflare integration is added downstream.
