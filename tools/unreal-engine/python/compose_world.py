"""#2278: compose the persistent world map /Game/Lunden/Maps/L_Lunden from tools/unreal-engine/world-levels.json.

    run-python.ps1 tools/unreal-engine/python/compose_world.py [--check]

The text list is the only input other issues change: each adds its own sub-level line (package, owner, builder,
streaming) and never opens the map. This script, owned by #2278, makes the map match the list exactly: the sub-levels
in list order (missing ones added, unlisted ones removed), the GameMode named in the list and one PlayerStart at
START from the #2245 export (unreal/Lunden/Import/measurements.json). A run that finds the map already matching saves
nothing, so a second run leaves the .umap byte-identical. --check reports differences without saving and fails on any.

Take `git lfs lock unreal/Lunden/Content/Lunden/Maps/L_Lunden.umap` before a run that may save it.
Ends with LUNDEN_WORLD_LEVELS <json list> and LUNDEN_COMPOSE_OK.
"""
import hashlib
import json
from pathlib import Path
import sys

import unreal as u

FORMAT_VERSION = 1
STREAMING = {"always": u.LevelStreamingAlwaysLoaded}
START_LABEL = "Lunden START"
REPO = Path(__file__).resolve().parents[3]


def load_list():
    data = json.loads((REPO / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
    if data.get("formatVersion") != FORMAT_VERSION:
        raise RuntimeError(f"world-levels.json formatVersion {data.get('formatVersion')} is not {FORMAT_VERSION}")
    seen = set()
    for entry in data["levels"]:
        missing = {"package", "owner", "builder", "streaming"} - entry.keys()
        if missing:
            raise RuntimeError(f"world-levels.json entry {entry} lacks {sorted(missing)}")
        if entry["streaming"] not in STREAMING:
            raise RuntimeError(f"{entry['package']}: unknown streaming {entry['streaming']!r}, use one of {sorted(STREAMING)}")
        if entry["package"].lower() in seen:
            raise RuntimeError(f"{entry['package']} is listed twice")
        seen.add(entry["package"].lower())
    return data


def player_start():
    measurements = REPO / "unreal/Lunden/Import/measurements.json"
    spawn = json.loads(measurements.read_text(encoding="utf-8"))["spawn"]
    start, player = spawn["start"], spawn["player"]
    x, y, z = start["unreal"]
    # The PlayerStart marks the capsule centre: feet at START plus half the web's standing headroom (cm), as the pilot.
    return u.Vector(x, y, z + 50 * player["headroom"]), u.Rotator(roll=0, pitch=0, yaw=start["unrealYaw"])


def map_file(path):
    return Path(u.Paths.project_content_dir()) / (path.removeprefix("/Game/") + ".umap")


def compose(check_only):
    data = load_list()
    path = data["map"]
    wanted = [entry["package"] for entry in data["levels"]]
    for entry in data["levels"]:
        if not u.EditorAssetLibrary.does_asset_exist(entry["package"]):
            raise RuntimeError(f"Sub-level {entry['package']} does not exist: run {entry['builder']} first")
    tools = u.EditorLoadingAndSavingUtils
    changes = []
    if u.EditorAssetLibrary.does_asset_exist(path):
        world = tools.load_map(path)
        if not world:
            raise RuntimeError("Cannot load " + path)
    else:
        if check_only:
            raise RuntimeError(f"{path} does not exist")
        world = tools.new_blank_map(False)
        changes.append("created")

    # Before any sub-level is added: adding one makes it the current level, and START belongs to the map itself.
    location, rotation = player_start()
    starts = [a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
              if isinstance(a, u.PlayerStart)]
    own = [a for a in starts if a.get_outermost().get_name() == world.get_outermost().get_name()]
    if len(own) != 1 or own[0].get_actor_label() != START_LABEL:
        changes.append(f"PlayerStart ({len(own)} in the persistent level)")
        if not check_only:
            for a in own:
                a.destroy_actor()
            own = [u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.PlayerStart, location, rotation)]
            own[0].set_actor_label(START_LABEL)
            own[0].tags = [u.Name("id:START"), u.Name("source:measurements.json#/spawn/start")]
    start = own[0] if own else None
    if start and ((start.get_actor_location() - location).length() > 0.01
                  or abs(start.get_actor_rotation().yaw - rotation.yaw) > 0.01):
        changes.append("PlayerStart moved to START")
        if not check_only:
            start.set_actor_location_and_rotation(location, rotation, False, False)

    settings = world.get_world_settings()
    mode = u.load_class(None, data["gameMode"])
    if not mode:
        raise RuntimeError("Cannot load the GameMode " + data["gameMode"])
    if settings.get_editor_property("default_game_mode") != mode:
        changes.append("GameMode -> " + data["gameMode"])
        if not check_only:
            settings.set_editor_property("default_game_mode", mode)

    def sub_levels():
        """Loaded sub-level packages of the map (AlwaysLoaded levels are loaded with it), in the world's order."""
        own = world.get_outermost().get_name()
        return {lvl.get_outermost().get_name(): lvl for lvl in u.EditorLevelUtils.get_levels(world)
                if lvl.get_outermost().get_name() != own}

    def streaming(package):
        stream = (u.GameplayStatics.get_streaming_level(world, package)
                  or u.GameplayStatics.get_streaming_level(world, package.rsplit("/", 1)[-1]))
        return stream if stream and str(stream.get_world_asset_package_f_name()) == package else None

    current = sub_levels()
    wrong = [e["package"] for e in data["levels"]
             if e["package"] in current and not isinstance(streaming(e["package"]), STREAMING[e["streaming"]])]
    if set(current) != set(wanted) or wrong:
        changes.append(f"sub-levels {sorted(current)} -> {wanted}" + (f", streaming class of {wrong}" if wrong else ""))
        if not check_only:
            for package, level in current.items():
                if (package not in wanted or package in wrong) and not u.EditorLevelUtils.remove_level_from_world(level):
                    raise RuntimeError("Cannot remove " + package)
            present = sub_levels()
            for entry in data["levels"]:
                if entry["package"] not in present and not u.EditorLevelUtils.add_level_to_world(
                        world, entry["package"], STREAMING[entry["streaming"]]):
                    raise RuntimeError("Cannot add " + entry["package"])

    starts = [a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
              if isinstance(a, u.PlayerStart)]
    if len(starts) != 1 or starts[0].get_outermost().get_name() != world.get_outermost().get_name():
        raise RuntimeError(f"Expected one PlayerStart, in {path} itself; found {[a.get_outermost().get_name() for a in starts]}")

    if changes and check_only:
        raise RuntimeError(f"{path} differs from world-levels.json: {changes}")
    if changes and not tools.save_map(world, path):
        raise RuntimeError("Cannot save " + path)
    final = [package for package in wanted if package in sub_levels() and streaming(package)]
    if final != wanted or len(sub_levels()) != len(wanted):
        raise RuntimeError(f"Composition mismatch: {final} != {wanted}")
    digest = hashlib.sha256(map_file(path).read_bytes()).hexdigest()
    u.log(f"LUNDEN_WORLD_LEVELS {json.dumps(final)}")
    u.log(f"LUNDEN_COMPOSE {path}: {'saved: ' + '; '.join(changes) if changes else 'unchanged, nothing saved'}; "
          f"sha256 {digest[:16]}")
    u.log("LUNDEN_COMPOSE_OK")


compose("--check" in sys.argv[1:])
