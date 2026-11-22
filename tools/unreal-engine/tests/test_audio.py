"""#2287: footsteps, wind, the outdoor bed and the room zone of /Game/Lunden/Audio against the web, in Play In Editor.

1. Assets: the step MetaSound per FOOTSTEPS profile in SC_LundenEffects, the wind and bed loops in SC_LundenAmbience,
   the class tree SC_LundenMaster > Effects > Ambience and Master > Music, ui-extensions.json's volume rows on those
   classes, and BPC_LundenAudio on BP_LundenPlayer.
2. The Blueprint's transcribed formulas against the web's own answers in tools/unreal-engine/audio-params.json
   (export-audio.mjs): footsteps.js pickStep (every surface class and weather case), windsim.js windPower,
   windsound.js windStrength / gustAt / windSoundParams, ambientbed.js riverBabbleParams / trafficLevel / cityHumParams
   and distToPolyline.
3. Walking in a temporary level with the world's GameMode: the player stands on the #2300 surface control points
   (measurements.json spawn.surface.control: parquet, tile, upstairs parquet, patio slabs, a Hus L stair tread, courtyard
   gravel, grass, the road at START, the garage floor) and moves; a step must sound every PLAYER.strideWalk of ground
   (strideRun while sprinting), with the MetaSound that pickStep gives for the web's class there, also for the weather
   variants (wet paving, autumn leaves) and the stair. The room zone there must be roomreverb.js's.
4. Wind and bed: outdoors on the grass and indoors on the parquet at the same wind, the indoor values must be the web's
   indoor model of the outdoor ones (quieter, duller), and the tree nearness and river distance must be the web's.
5. Hail and thunder (#2402): hail must give the rain loop weather.js's hail level and cut-off outdoors and indoors; the
   strike clock must follow weather.js (no strike without a storm or with only `thunder.strike.minRain` of rain, the
   countdown while it storms, and each strike's distance, nearness, delay after the light and next draw in the web's
   ranges, muffled indoors).

The run has no audio device (run-tests.ps1 starts the editor with -nosound): nothing is played aloud, so the test checks
which MetaSound is started and with which parameters, not the sound itself.

Run like the other PIE tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_audio
Writes Saved/audio-result.json and logs LUNDEN_AUDIO_TEST lines, then LUNDEN_AUDIO_TEST_OK.
"""
import json
import math
from pathlib import Path
import time
import sys
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TOOLS = PROJECT.parents[1] / "tools/unreal-engine"
WORLD = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))
UI = json.loads((TOOLS / "ui-extensions.json").read_text(encoding="utf-8"))
A = json.loads((TOOLS / "audio-params.json").read_text(encoding="utf-8"))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
F = A["footsteps"]
CONTROL = M["spawn"]["surface"]["control"]
DIR = "/Game/Lunden/Audio"
AUDIO_CLASS = DIR + "/BPC_LundenAudio.BPC_LundenAudio_C"
TOL = 1e-4  # relative; the Blueprint computes in doubles, the web in doubles, audio-params.json keeps 6 decimals


def close(got, want, tol=TOL):
    return abs(got - want) <= tol * max(1.0, abs(want))


# 1. Assets ------------------------------------------------------------------------------------------------------------------
def load(path):
    """Not an alias `load = u.EditorAssetLibrary.load_asset`: a bound Unreal method kept in this file's globals crashed
    the next test's garbage collection (#2401, closure_alias_test.py)."""
    return u.EditorAssetLibrary.load_asset(path)


classes = {n: load(f"{DIR}/{n}") for n in ("SC_LundenMaster", "SC_LundenEffects", "SC_LundenAmbience", "SC_LundenMusic")}
tree = {n: (c.get_editor_property("parent_class").get_name() if c.get_editor_property("parent_class") else None)
        for n, c in classes.items()}
if tree != {"SC_LundenMaster": None, "SC_LundenEffects": "SC_LundenMaster", "SC_LundenAmbience": "SC_LundenEffects",
            "SC_LundenMusic": "SC_LundenMaster"}:
    raise RuntimeError(f"Sound class tree {tree}")
children = {n: sorted(x.get_name() for x in c.get_editor_property("child_classes")) for n, c in classes.items()}
if children["SC_LundenMaster"] != ["SC_LundenEffects", "SC_LundenMusic"] or children["SC_LundenEffects"] != ["SC_LundenAmbience"]:
    raise RuntimeError(f"Sound class children {children}")
for profile in F["profiles"]:
    ms = load(f"{DIR}/MS_LundenStep_{profile}")
    if not isinstance(ms, u.MetaSoundSource) or ms.get_editor_property("sound_class_object") != classes["SC_LundenEffects"]:
        raise RuntimeError(f"MS_LundenStep_{profile} is missing or not in SC_LundenEffects")
for name in ("MS_LundenWind", "MS_LundenAmbience"):
    if load(f"{DIR}/{name}").get_editor_property("sound_class_object") != classes["SC_LundenAmbience"]:
        raise RuntimeError(name + " is not in SC_LundenAmbience")
thunder = load(f"{DIR}/MS_LundenThunder")
if not isinstance(thunder, u.MetaSoundSource) or thunder.get_editor_property("sound_class_object") != classes["SC_LundenEffects"]:
    raise RuntimeError("MS_LundenThunder is missing or not in SC_LundenEffects")
rows = {r["key"]: r["soundClass"] for r in UI["volumes"]}
want_rows = {"audio.master": "SC_LundenMaster", "audio.effects": "SC_LundenEffects", "audio.music": "SC_LundenMusic"}
for key, name in want_rows.items():
    if rows.get(key) != f"{DIR}/{name}.{name}":
        raise RuntimeError(f"ui-extensions.json {key} -> {rows.get(key)}, expected {name}")

# 3. Temporary level: one slab under each control point ----------------------------------------------------------------------
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, WORLD["gameMode"]))
cube = load("/Engine/BasicShapes/Cube")


def box(x, y, top, sx, sy, height):
    actor = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(x, y, top - height / 2))
    actor.static_mesh_component.set_static_mesh(cube)
    actor.static_mesh_component.set_collision_profile_name("BlockAll")
    actor.set_actor_scale3d(u.Vector(sx / 100, sy / 100, height / 100))


for c in CONTROL:
    x, y, z = c["unreal"]
    box(x, y, z, 160, 160, 20)
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(CONTROL[0]["unreal"][0], CONTROL[0]["unreal"][1], 120))
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


def put(obj, name, value):
    """Set a variable on the running component without the editor's change notification (which would rebuild the
    owning PIE actor's components and leave `obj` a stale copy)."""
    obj.set_editor_property(name, value, u.PropertyAccessChangeNotifyMode.NEVER)


def call(comp, name, *args):
    r = comp.call_method(name, tuple(args))
    return r if isinstance(r, tuple) else (r,)


def pure_checks(comp, result):
    """2. The transcribed formulas against the web's answers."""
    bad = []
    put(comp, "UseSky", False)
    by_env = {}
    for case in A["pickStep"]["cases"]:
        by_env.setdefault(tuple(case[4:8]), []).append(case)
    for (wet, month, snow, temp), cases in by_env.items():
        put(comp, "Wet", wet)
        put(comp, "Month", int(month))
        put(comp, "SnowCover", snow)
        put(comp, "Temperature", temp)
        for surface, where, road, stairs, *_, want in cases:
            got = str(call(comp, "PickStep", u.Name(surface), u.Name(where), road, stairs)[0])
            if got != want:
                bad.append(f"pickStep {surface}/{where}/road {road}/stairs {stairs} wet {wet} month {month} snow {snow} "
                           f"temp {temp}: {got}, web {want}")
    W = A["wind"]
    for speed, want in W["powerCases"]:
        got = call(comp, "WindPower", float(speed))[0]
        if not close(got, want):
            bad.append(f"windPower({speed}) {got}, web {want}")
    for speed, gust, want in W["strengthCases"]:
        got = call(comp, "WindStrength", float(speed), float(gust))[0]
        if not close(got, want):
            bad.append(f"windStrength({speed}, {gust}) {got}, web {want}")
    for t, power, want in W["gustCases"]:
        got = call(comp, "GustAt", float(t), float(power))[0]
        if not close(got, want, 5e-4):  # the web's own 6.2832 for 2 pi, same in both; float time in the sine
            bad.append(f"gustAt({t}, {power}) {got}, web {want}")
    worst = 0.0
    for speed, gust, leaves, near, indoors, *want in W["cases"]:
        got = call(comp, "WindParams", float(speed), float(gust), float(leaves), float(near), bool(indoors))
        for name, g, w in zip(W["columns"][5:], got, want):
            worst = max(worst, abs(g - w) / max(1.0, abs(w)))
            if not close(g, w):
                bad.append(f"windSoundParams speed {speed} gust {gust} leaves {leaves} near {near} indoors {indoors}: "
                           f"{name} {g}, web {w}")
    for row in A["rain"]["cases"]:
        values = row["input"]
        got = call(comp, "RainMix", values.get("indoors", False), values.get("underRoof", False),
                   float(values.get("trees", 0)), float(values.get("leaves", 1)), float(values.get("riverDist", 1e6)),
                   float(values.get("metal", 0)), float(values.get("grass", 0)))
        want = [row["mix"][n] for n in ("base", "baseHz", "roof", "metal", "leaf", "water")]
        if len(got) != len(want) or not all(close(g, w) for g, w in zip(got, want)):
            bad.append(f"rainSurfaceMix({values}) {got}, web {want}")
    B = A["ambient"]
    for dist, indoors, *want in B["riverCases"]:
        got = call(comp, "RiverParams", float(dist), bool(indoors))
        if not all(close(g, w) for g, w in zip(got, want)):
            bad.append(f"riverBabbleParams({dist}, {indoors}) {got}, web {want}")
    for hour, want in B["trafficCases"]:
        got = call(comp, "TrafficLevel", float(hour))[0]
        if not close(got, want):
            bad.append(f"trafficLevel({hour}) {got}, web {want}")
    for hour, indoors, *want in B["cityCases"]:
        got = call(comp, "CityParams", float(hour), bool(indoors))
        if not all(close(g, w) for g, w in zip(got, want)):
            bad.append(f"cityHumParams({hour}, {indoors}) {got}, web {want}")
    for x, z, want in B["distCases"]:
        got = call(comp, "RiverDistance", u.Vector(100 * x, 100 * z, 0))[0]
        if not close(got, want, 1e-3):
            bad.append(f"distToPolyline({x}, {z}) {got}, web {want}")
    result["pure"] = {"pickStep": len(A["pickStep"]["cases"]), "windParams": len(W["cases"]),
                      "windWorstRelative": worst, "river": len(B["riverCases"]), "traffic": len(B["trafficCases"]),
                      "city": len(B["cityCases"]), "riverDistance": len(B["distCases"]), "failures": bad[:20]}
    u.log(f"LUNDEN_AUDIO_TEST pure functions: {len(bad)} differences; wind worst relative {worst:.2e}")
    if bad:
        raise RuntimeError(f"{len(bad)} formula differences, first: {bad[:5]}")


def zone_of(c):
    """roomreverb.js reverbZone for a control point: indoorRoomClass from the same class, else the courtyard rectangle."""
    if c["where"] == "core":
        return "concrete"
    if c["where"] == "indoor":
        return "bright" if c["surface"] == "hard" else "soft"
    r, (x, y, z) = A["reverb"]["courtyard"], c["unreal"]
    q = r["unreal"]
    inside = q["x0"] <= x <= q["x1"] and q["y0"] <= y <= q["y1"] and z < r["maxYUnreal"]
    return "courtyard" if inside else "open"


def pick(c, wet, month):
    key = [c["surface"], c["where"], c["road"], c["stairs"], wet, month, 0, 10]
    for case in A["pickStep"]["cases"]:
        if case[:8] == key:
            return case[8]
    raise RuntimeError(f"No pickStep case for {key}")


@u.AutomationScheduler.add_latent_command
def audio_test():
    result = {"engine": u.SystemLibrary.get_engine_version(), "strides": [F["strideWalk"], F["strideRun"]], "steps": []}
    try:
        deadline = time.monotonic() + 30
        pawn = None
        while not pawn:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not possess a pawn")
            game = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(game, 0) if game else None
            yield
        comp = pawn.get_component_by_class(u.load_class(None, AUDIO_CLASS))
        if not comp:
            raise RuntimeError("BP_LundenPlayer has no BPC_LundenAudio (player-extensions.json row Audio)")
        movement = pawn.character_movement
        pc = pawn.get_controller()

        def key(name, down):
            u.SystemLibrary.execute_console_command(game, "Input." + ("+key " if down else "-key ") + name + (" 1" if down else ""), pc)

        def seconds(t):
            start = u.GameplayStatics.get_time_seconds(game)
            while u.GameplayStatics.get_time_seconds(game) - start < t:
                if time.monotonic() > deadline + 300:
                    raise RuntimeError("Audio test timed out")
                yield

        pure_checks(comp, result)

        def stand(c):
            x, y, z = c["unreal"]
            pawn.set_actor_location(u.Vector(x, y, z + 100), False, True)
            yield from seconds(0.4)
            if movement.is_falling():
                raise RuntimeError(f"Still falling at {c['name']}")

        def walk(c, centimetres, step=5.0):
            """Move along X round the point in `step` cm frames (never more than 10 cm away) for `centimetres` of ground."""
            x, y, _ = c["unreal"]
            frames, offset, sign = int(round(centimetres / step)), 0.0, 1
            for _ in range(frames):
                if abs(offset + sign * step) > 10.0 + 1e-6:
                    sign = -sign
                offset += sign * step
                at = pawn.get_actor_location()
                pawn.set_actor_location(u.Vector(x + offset, y, at.z), False, False)
                yield

        def steps_on(c, wet=0.0, month=6, running=False, label=None):
            put(comp, "Wet", wet)
            put(comp, "Month", month)
            key("LeftShift", running)
            yield from stand(c)
            yield  # one tick to settle LastPos
            put(comp, "Stride", 0.0)
            put(comp, "StepCount", 0)
            stride = 100 * (F["strideRun"] if running else F["strideWalk"])
            distance = 2.5 * stride
            yield from walk(c, distance)
            yield
            if pawn.get_editor_property("Running") != running:
                raise RuntimeError(f"Shift did not set Running = {running}")
            count = comp.get_editor_property("StepCount")
            profile = str(comp.get_editor_property("LastProfile"))
            sound = comp.get_editor_property("LastStepSound")
            want = pick(c, wet, month)
            row = {"point": label or c["name"], "surface": c["surface"], "where": c["where"], "wet": wet, "month": month,
                   "running": running, "walkedCm": distance, "steps": count, "wantSteps": 2, "profile": profile,
                   "webProfile": want, "sound": sound.get_name() if sound else None,
                   "zone": str(comp.get_editor_property("ReverbZone")), "webZone": zone_of(c),
                   "updates": comp.get_editor_property("Updates"), "stride": round(comp.get_editor_property("Stride"), 2),
                   "grounded": movement.is_moving_on_ground(), "haveLast": comp.get_editor_property("HaveLast"),
                   "lastPos": str(comp.get_editor_property("LastPos")), "teleport": comp.get_editor_property("Teleport"),
                   "stepsOn": comp.get_editor_property("StepsOn"), "strideWalk": comp.get_editor_property("StrideWalk")}
            result["steps"].append(row)
            u.log(f"LUNDEN_AUDIO_TEST step {json.dumps(row)}")
            if count != 2 or profile != want or row["sound"] != f"MS_LundenStep_{want}":
                raise RuntimeError(f"Footsteps at {row['point']} differ from the web: {row}")
            yield from seconds(comp.get_editor_property("Every") + 0.1)
            row["zone"] = str(comp.get_editor_property("ReverbZone"))
            if row["zone"] != row["webZone"]:
                raise RuntimeError(f"Room zone at {row['point']}: {row['zone']}, web {row['webZone']}")

        put(comp, "UseSky", False)
        put(comp, "SnowCover", 0.0)
        put(comp, "Temperature", 10.0)
        for c in CONTROL:
            yield from steps_on(c)
        byname = {c["name"]: c for c in CONTROL}
        road = next(c for c in CONTROL if c["road"])
        grass = next(c for c in CONTROL if c["surface"] == "grass")
        gravel = next(c for c in CONTROL if c["surface"] == "gravel")
        parquet = next(c for c in CONTROL if c["surface"] == "wood" and c["where"] == "indoor")
        yield from steps_on(parquet, running=True, label=parquet["name"] + ", sprinting")
        yield from steps_on(road, wet=F["wetMin"], label=road["name"] + ", wet")
        yield from steps_on(grass, month=F["leafMonths"][0], label=grass["name"] + ", autumn")
        yield from steps_on(gravel, month=F["leafMonths"][0], label=gravel["name"] + ", autumn")
        heard = {r["profile"] for r in result["steps"]}
        if not {"wood", "hard", "grass", "gravel", "stair", "wet", "leaves"} <= heard:
            raise RuntimeError(f"Not every profile was heard: {sorted(heard)}")

        # 4. Wind and bed outdoors and indoors at the same weather
        put(comp, "WindSpeed", 9.0)
        put(comp, "Month", 6)
        put(comp, "Hour", 8.0)
        if abs(comp.get_editor_property("RainGain")) > 1e-6:
            raise RuntimeError("Clear weather produced rain audio")
        put(comp, "Rain", 1.0)
        beds = {}
        for label, c in (("outdoors", grass), ("indoors", parquet)):
            yield from stand(c)
            yield from seconds(comp.get_editor_property("Every") + 0.1)
            v = {n: comp.get_editor_property(n) for n in ("Indoors", "Near", "GustNow", "RiverDist", "Traffic", "WindGain",
                                                          "WindLpHz", "WindLpQ", "WindBandGain", "WindBandHz", "WindBandQ",
                                                          "RiverGain", "RiverHz", "RiverQ", "CityGain", "CityHz", "RainGain", "RainCutoff", "Roof")}
            x, y, _ = c["unreal"]
            feet = [(t["foot"]["unreal"][0], t["foot"]["unreal"][1]) for t in M["vegetation"]["trees"]]
            near_cm = 100 * A["wind"]["sound"]["near"]
            v["webNear"] = 1 - min([near_cm] + [math.hypot(fx - x, fy - y) for fx, fy in feet]) / near_cm
            same = call(comp, "WindParams", 9.0, v["GustNow"], 1.0, v["Near"], False)
            v["outdoorModel"] = dict(zip(["Gain", "LpHz", "LpQ", "BandGain", "BandHz", "BandQ"], same))
            beds[label] = v
            u.log(f"LUNDEN_AUDIO_TEST bed {label} {json.dumps(v)}")
        result["beds"] = beds
        out, ins = beds["outdoors"], beds["indoors"]
        I, AI = A["wind"]["sound"]["indoor"], A["ambient"]["bed"]["indoor"]
        problems = []
        if out["Indoors"] or not ins["Indoors"]:
            problems.append("indoors/outdoors flags")
        expected_rain = A["rain"]["sound"] * A["masterGain"]
        for v, scale, hz in ((out, 1.0, 6500.0), (ins, 0.3, 900.0)):
            if not close(v["RainGain"], scale * expected_rain) or not close(v["RainCutoff"], hz):
                problems.append(f"rain at {v['Indoors']=}: {v['RainGain']} / {v['RainCutoff']} Hz")
        put(comp, "Rain", 0.0)
        yield from seconds(comp.get_editor_property("Every") + 0.1)
        if abs(comp.get_editor_property("RainGain")) > 1e-6:
            problems.append("rain gain stayed on after clearing the weather")
        for v in (out, ins):
            if abs(v["Near"] - v["webNear"]) > 1e-4:
                problems.append(f"tree nearness {v['Near']} != {v['webNear']}")
        if not close(out["WindGain"], out["outdoorModel"]["Gain"]):
            problems.append("outdoor wind gain is not the outdoor model")
        if not close(ins["WindGain"], ins["outdoorModel"]["Gain"] * I["gain"]):
            problems.append(f"indoor wind gain {ins['WindGain']} != outdoor model x {I['gain']}")
        if not close(ins["WindLpHz"], min(ins["outdoorModel"]["LpHz"], I["hz"])):
            problems.append("indoor wind low-pass")
        river_out = call(comp, "RiverParams", ins["RiverDist"], False)[0]
        city_out = call(comp, "CityParams", 8.0, False)[0]
        if not close(ins["RiverGain"], river_out * AI["river"]) or not close(ins["CityGain"], city_out * AI["city"]):
            problems.append("indoor bed gains")
        if not (ins["WindGain"] < out["WindGain"] and ins["CityGain"] < out["CityGain"]):
            problems.append("indoors is not quieter")
        if problems:
            raise RuntimeError("Wind/bed: " + "; ".join(problems))

        # 5. Hail: weather.js's rain sound for kind 'hail' (louder, brighter outdoors; the rain's indoor model)
        H = A["hail"]
        put(comp, "Rain", 1.0)
        put(comp, "Hail", True)
        hail = {}
        for label, c, scale, hz in (("outdoors", grass, H["loud"], H["cutoff"]),
                                    ("indoors", parquet, H["loud"] * H["inside"], H["insideCutoff"])):
            yield from stand(c)
            yield from seconds(comp.get_editor_property("Every") + 0.1)
            hail[label] = {"RainGain": comp.get_editor_property("RainGain"), "RainCutoff": comp.get_editor_property("RainCutoff"),
                           "webGain": scale * expected_rain, "webCutoff": hz}
            if not close(hail[label]["RainGain"], scale * expected_rain) or not close(hail[label]["RainCutoff"], hz):
                problems.append(f"hail {label}: {hail[label]}")
        put(comp, "Hail", False)
        yield from seconds(comp.get_editor_property("Every") + 0.1)
        if not close(comp.get_editor_property("RainCutoff"), H["insideCutoff"]) or \
                not close(comp.get_editor_property("RainGain"), H["inside"] * expected_rain):
            problems.append("rain indoors after the hail stopped")
        result["hail"] = hail
        u.log(f"LUNDEN_AUDIO_TEST hail {json.dumps(hail)}")

        # 5. Thunder: weather.js update/strike
        S = A["thunder"]["strike"]
        lo, hi, speed = 100 * S["dist"][0], 100 * S["dist"][1], 100 * S["soundSpeed"]
        for name, want in (("StormRain", S["minRain"]), ("SoundSpeed", speed), ("StrikeEveryMin", S["every"][0]),
                           ("StrikeEveryMax", S["every"][1]), ("StrikeDistMin", lo), ("StrikeDistMax", hi)):
            if not close(comp.get_editor_property(name), want):
                problems.append(f"{name} {comp.get_editor_property(name)}, web {want}")
        thunder_rows = {"quiet": []}
        for storm, rain in ((False, 1.0), (True, S["minRain"]), (True, 0.0)):  # weather.js: storm && rain > minRain
            put(comp, "Storm", storm)
            put(comp, "Rain", rain)
            put(comp, "ThunderCount", 0)
            put(comp, "NextStrike", 0.05)
            yield from seconds(0.4)
            row = {"storm": storm, "rain": rain, "strikes": comp.get_editor_property("ThunderCount"),
                   "next": comp.get_editor_property("NextStrike")}
            thunder_rows["quiet"].append(row)
            if row["strikes"] or abs(row["next"] - 0.05) > 1e-9:
                problems.append(f"thunder without the web's storm: {row}")
        put(comp, "Storm", True)
        put(comp, "Rain", 1.0)
        put(comp, "NextStrike", 5.0)
        start = u.GameplayStatics.get_time_seconds(game)
        yield from seconds(0.5)
        counted = 5.0 - comp.get_editor_property("NextStrike")
        elapsed = u.GameplayStatics.get_time_seconds(game) - start
        thunder_rows["countdown"] = {"counted": counted, "elapsed": elapsed}
        if abs(counted - elapsed) > 0.15 or comp.get_editor_property("ThunderCount"):  # one frame either way
            problems.append(f"storm countdown {thunder_rows['countdown']}")
        strikes = []
        for label, c in (("outdoors", grass), ("indoors", parquet)):
            yield from stand(c)
            yield from seconds(comp.get_editor_property("Every") + 0.1)
            for _ in range(8):
                before = comp.get_editor_property("ThunderCount")
                put(comp, "NextStrike", 0.01)
                yield
                yield
                v = {n: comp.get_editor_property(n) for n in ("ThunderCount", "StrikeDist", "ThunderNear", "ThunderDelay",
                                                              "ThunderInside", "NextStrike", "Indoors")}
                v["place"], v["voice"] = label, bool(comp.get_editor_property("LastThunder"))
                strikes.append(v)
                web_near = 1 - (v["StrikeDist"] - lo) / (hi - lo)
                bad = (v["ThunderCount"] != before + 1 or not lo <= v["StrikeDist"] <= hi
                       or not close(v["ThunderNear"], web_near) or not close(v["ThunderDelay"], v["StrikeDist"] / speed)
                       or not S["every"][0] - 0.1 <= v["NextStrike"] <= S["every"][1]
                       or v["ThunderInside"] != (label == "indoors") or v["Indoors"] != (label == "indoors"))
                if bad:
                    problems.append(f"strike differs from weather.js: {v}")
        thunder_rows["strikes"] = strikes
        delays = [v["ThunderDelay"] for v in strikes]
        thunder_rows["delayRange"] = [min(delays), max(delays)]
        put(comp, "Storm", False)
        put(comp, "Rain", 0.0)
        result["thunder"] = thunder_rows
        u.log(f"LUNDEN_AUDIO_TEST thunder {json.dumps(thunder_rows)}")
        if problems:
            raise RuntimeError("Hail/thunder: " + "; ".join(problems))
        (Path(u.Paths.project_saved_dir()) / "audio-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log("LUNDEN_AUDIO_TEST_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
