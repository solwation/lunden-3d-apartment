"""#2467: render a small fixture at 640x360; this is not the generated Lunden world.

run-linux.py --render python tools/unreal-engine/python/smoke_render_linux.py OUTPUT_DIRECTORY
"""
import os
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_linux  # Verify the effective low profile inside this same process.
from screenshot_level import render_view, spawn


def main(output):
    directory = Path(output).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    image = directory / "linux-fixture.png"
    image.unlink(missing_ok=True)  # A failed void-returning export must not reuse old evidence.
    world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
    cube = u.load_asset("/Engine/BasicShapes/Cube.Cube")
    material = u.load_asset("/Game/Lunden/Fixtures/M_LundenFixture")
    plane = u.load_asset("/Engine/BasicShapes/Plane.Plane")
    control = u.load_asset("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")
    if not cube or not plane or not control or not isinstance(material, u.Material):
        raise RuntimeError("Missing cube or real LFS fixture material")
    # The committed fixture's default base colour is black. Put it beside a
    # bright built-in control and floor, so a successful render is reviewable.
    actor = spawn(u.StaticMeshActor, u.Vector(-80, 0, 50))
    actor.static_mesh_component.set_static_mesh(cube)
    actor.static_mesh_component.set_material(0, material)
    bright = spawn(u.StaticMeshActor, u.Vector(80, 0, 50))
    bright.static_mesh_component.set_static_mesh(cube)
    bright.static_mesh_component.set_material(0, control)
    floor = spawn(u.StaticMeshActor, u.Vector(0, 0, -1))
    floor.static_mesh_component.set_static_mesh(plane)
    floor.static_mesh_component.set_material(0, control)
    floor.set_actor_scale3d(u.Vector(6, 6, 1))
    sun = spawn(u.DirectionalLight, u.Vector(0, 0, 500), u.Rotator(pitch=-40, yaw=-45))
    sun.light_component.set_intensity(800.0)  # Test lighting, not an apartment/daylight match.
    position = u.Vector(350, 450, 300)
    rotation = u.MathLibrary.find_look_at_rotation(position, u.Vector(0, 0, 50))
    render_view(world, str(directory), "linux-fixture", position, rotation, 640, 360, 60, 0, [])
    if not image.is_file() or image.stat().st_size < 100:
        raise RuntimeError("Capture produced no PNG")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)
    u.log(f"LUNDEN_LINUX_RENDER_OK {image}")


main(sys.argv[1])
