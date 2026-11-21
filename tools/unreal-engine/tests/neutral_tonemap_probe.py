"""#2396: M_LundenNeutralTonemap's curve, for tests/check-neutral-tonemap.cjs.

    UnrealEditor-Cmd.exe <uproject> -run=pythonscript "-script=<this file> <out dir>" -AllowCommandletRendering -RenderOffScreen -unattended -nosplash -nosound

On a blank map, 50 unlit emissive patches (25 greys from 0 to 10, 25 colours up to 6) are captured from above through
the built M_LundenNeutralTonemap (build_lighting.py), with render_view's settings (screenshot_level.py: final LDR colour
into an 8-bit target at display gamma 2.2, a view state, manual exposure, no bloom or vignette) at bias 0 and at bias -2
(the exposure must reach the curve: a quarter of the light): <out dir>/neutral-b0.png and neutral-b2.png. For comparison
the same patches through Unreal's own tonemapper: default-b0.png. probe.json lists the inputs.
Nothing is saved (the patch material lives only in memory). Logs LUNDEN_TONEMAP_PROBE_OK.
"""
import json
from pathlib import Path
import sys

import unreal as u

REPO = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
sys.path.insert(0, str(REPO / "tools/unreal-engine/python"))
import neutral_tonemap  # noqa: E402

GREYS = [0, 0.005, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.76, 0.8, 0.9, 1.0, 1.2, 1.5, 2,
         3, 5, 10]
COLOURS = [(1, .5, .2), (2, 1, .4), (.3, .6, .9), (4, .2, .1), (.05, .1, .02), (.8, .8, .3), (1.5, 1.2, 1.0), (.6, .2, .9),
           (.9, .7, .5), (.2, .25, .3), (3, 2.5, 1.8), (.02, .06, .12), (.7, .05, .05), (.1, .9, .2), (1.1, .95, .8),
           (.35, .3, .22), (6, 4, 2), (.45, .5, .55), (.15, .1, .06), (.95, .9, .85), (2.5, .5, 1.5), (.03, .03, .2),
           (.5, .4, .1), (1.3, 1.3, 1.3), (.25, .2, .9)]
VALUES = [(g, g, g) for g in GREYS] + COLOURS
COLS, SIZE, CELL = 10, 100.0, 40


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    assets, mel = u.EditorAssetLibrary, u.MaterialEditingLibrary
    if not assets.does_asset_exist(neutral_tonemap.MATERIAL):
        raise RuntimeError(neutral_tonemap.MATERIAL + " is missing: run build_lighting.py")
    tonemap = assets.load_asset(neutral_tonemap.MATERIAL)
    patch = u.AssetToolsHelpers.get_asset_tools().create_asset("M_TonemapProbePatch", "/Game/Lunden/Tests/Transient", u.Material,
                                                               u.MaterialFactoryNew())
    patch.set_editor_property("shading_model", u.MaterialShadingModel.MSM_UNLIT)
    param = mel.create_material_expression(patch, u.MaterialExpressionVectorParameter, -400, 0)
    param.set_editor_property("parameter_name", "E")
    mel.connect_material_property(param, "", u.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.recompile_material(patch)

    u.EditorLoadingAndSavingUtils.new_blank_map(False)
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    plane = assets.load_asset("/Engine/BasicShapes/Plane")
    rows = (len(VALUES) + COLS - 1) // COLS
    for i, rgb in enumerate(VALUES):
        col, row = i % COLS, i // COLS
        # seen from above with the capture's up = +X: rows run down the picture along -X, columns along +Y
        a = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(((rows - 1) / 2 - row) * SIZE, (col - (COLS - 1) / 2) * SIZE, 0))
        a.static_mesh_component.set_static_mesh(plane)
        a.set_actor_scale3d(u.Vector(0.95, 0.95, 1))
        a.static_mesh_component.create_dynamic_material_instance(0, patch).set_vector_parameter_value("E", u.LinearColor(*rgb, 1))
    u.AutomationLibrary.finish_loading_before_screenshot()
    for name, blendables, bias in (("neutral-b0", [tonemap], 0.0), ("neutral-b2", [tonemap], -2.0), ("default-b0", [], 0.0)):
        cam = actors.spawn_actor_from_class(u.SceneCapture2D, u.Vector(0, 0, 1000), u.Rotator(roll=0, pitch=-90, yaw=0))
        comp = cam.capture_component2d
        rt = u.RenderingLibrary.create_render_target2d(world, COLS * CELL, rows * CELL, u.TextureRenderTargetFormat.RTF_RGBA8)
        rt.set_editor_property("target_gamma", 2.2)  # as render_view: display-encoded like the viewport
        comp.set_editor_property("texture_target", rt)
        comp.set_editor_property("capture_source", u.SceneCaptureSource.SCS_FINAL_COLOR_LDR)
        comp.set_editor_property("projection_type", u.CameraProjectionMode.ORTHOGRAPHIC)
        comp.set_editor_property("ortho_width", COLS * SIZE)
        comp.set_editor_property("capture_every_frame", False)
        comp.set_editor_property("always_persist_rendering_state", True)
        pp = comp.get_editor_property("post_process_settings")
        pp.set_editor_property("weighted_blendables", u.WeightedBlendables(array=[u.WeightedBlendable(weight=1.0, object=b) for b in blendables]))
        for key, value in (("auto_exposure_method", u.AutoExposureMethod.AEM_MANUAL), ("auto_exposure_apply_physical_camera_exposure", False),
                           ("auto_exposure_bias", bias), ("bloom_intensity", 0.0), ("vignette_intensity", 0.0), ("film_grain_intensity", 0.0)):
            pp.set_editor_property("override_" + key, True)
            pp.set_editor_property(key, value)
        comp.set_editor_property("post_process_settings", pp)
        comp.set_editor_property("post_process_blend_weight", 1.0)
        u.AutomationLibrary.finish_loading_before_screenshot()
        for _ in range(4):
            comp.capture_scene()
        u.RenderingLibrary.export_render_target(world, rt, str(out), name + ".png")
        actors.destroy_actor(cam)
    (out / "probe.json").write_text(json.dumps({"values": VALUES, "cols": COLS, "rows": rows, "cell": CELL}) + "\n", encoding="utf-8")
    u.log("LUNDEN_TONEMAP_PROBE_OK")


main(*[a for a in sys.argv[1:] if a])
