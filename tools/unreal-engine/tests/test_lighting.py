"""#2283: the world's lighting, sky and weather against the #2245 export and the web's own sun, in Play In Editor.

1. Lamps: every measurements.json `lights` id is a BP_LundenLamp in /Game/Lunden/Generated/Lighting/Level_lighting
   tagged `lamp:<id>` (and no lamp actor has an id the export lacks); TurnOn / TurnOff / Toggle switch its light.
2. Sun and moon: a BP_LundenSky with UseClock off is set to each date and clock time of CASES and UpdateSky runs; its
   SunDirection / MoonDirection and the Sun light's own rotation are written to Saved/lighting-result.json for
   `node tools/unreal-engine/check-sun.mjs`, which computes the web's src/daycycle.js / src/moon.js values (the 1°
   acceptance check). Here the Sun light must point along -SunDirection within 0.01°.
3. Weather: ToggleRain / ToggleSnow switch Rain and Snow on and off (one at a time) and the weather collection
   MPC_LundenWeather follows.
4. Clock: in PIE, BeginPlay with UseClock reads the PC's local date and time (within 2 minutes of Python's), and Tick
   advances it.

Run like the other tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_lighting
Logs LUNDEN_LIGHTING_TEST lines, then LUNDEN_LIGHTING_TEST_OK.
"""
import datetime
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
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
LEVEL = "/Game/Lunden/Generated/Lighting/Level_lighting"
SKY = "/Game/Lunden/Lighting/BP_LundenSky"
MPC = "/Game/Lunden/Lighting/MPC_LundenWeather"
# The acceptance date is the shared camera list's (views.json, 21 June 2026): morning, 14:00 and 22:00. The others cover
# winter, an equinox and the web's summer-time switch days (day of year 87 and 300).
CASES = [(2026, 6, 21, 7.0), (2026, 6, 21, 14.0), (2026, 6, 21, 22.0),
         (2026, 12, 21, 9.0), (2026, 12, 21, 12.0), (2026, 12, 21, 15.5),
         (2026, 3, 20, 10.25), (2026, 3, 28, 12.0), (2026, 10, 27, 12.0), (2027, 1, 10, 23.5)]

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
result = {"engine": u.SystemLibrary.get_engine_version(), "sun": [], "lamps": {}, "weather": [], "clock": {}}


def log(msg):
    u.log("LUNDEN_LIGHTING_TEST " + msg)


def vec(v):
    return [v.x, v.y, v.z]


def angle(a, b):
    dot = sum(x * y for x, y in zip(a, b)) / (math.hypot(*a) * math.hypot(*b))
    return math.degrees(math.acos(max(-1.0, min(1.0, dot))))


# 1. Lamps ---------------------------------------------------------------------------------------------------------
if not u.EditorLoadingAndSavingUtils.load_map(LEVEL):
    raise RuntimeError(f"Cannot load {LEVEL}: run build_lighting.py")
want = {l["id"]: l for l in M["lights"]}
found = {}
for a in actors.get_all_level_actors():
    for t in (str(t) for t in a.tags):
        if t.startswith("lamp:"):
            found.setdefault(t[5:], []).append(a)
missing = sorted(set(want) - set(found))
extra = sorted(set(found) - set(want))
doubled = sorted(k for k, v in found.items() if len(v) > 1)
far = []
for lamp_id, (actor,) in ((k, v) for k, v in found.items() if k in want and len(v) == 1):
    if math.dist(vec(actor.get_actor_location()), want[lamp_id]["position"]["unreal"]) > 0.5:
        far.append(lamp_id)
result["lamps"] = {"export": len(want), "unreal": len(found), "missing": missing, "extra": extra, "doubled": doubled, "misplaced": far,
                   "byKind": {k: sum(1 for l in want.values() if l["kind"] == k) for k in ("lamp", "room")}}
log(f"lamps export {len(want)}, unreal {len(found)}, missing {missing}, extra {extra}, doubled {doubled}, misplaced {far}")
if missing or extra or doubled or far:
    raise RuntimeError(f"Lamp ids differ from the export: {result['lamps']}")
probe = found[next(iter(sorted(want)))][0]
light = probe.get_component_by_class(u.PointLightComponent)
states = []
for event in ("TurnOn", "Toggle", "Toggle", "TurnOff"):
    probe.call_method(event)
    states.append((probe.get_editor_property("IsOn"), light.is_visible()))
log(f"lamp events TurnOn/Toggle/Toggle/TurnOff -> {states}")
if states != [(True, True), (False, False), (True, True), (False, False)]:
    raise RuntimeError(f"Lamp events did not switch the light: {states}")
result["lamps"]["events"] = states


def sun_and_weather(game, sky):
    """2./3. in the game world (in an editor world a property change re-runs the construction script and resets the
    light components, so the lights are read where the game runs them)."""
    sky.set_editor_property("UseClock", False)
    sky.set_editor_property("TimeScale", 0.0)
    sun_light = [c for c in sky.get_components_by_class(u.DirectionalLightComponent) if c.get_name() == "Sun"][0]
    for (y, mo, d, h) in CASES:
        for k, v in (("Year", y), ("Month", mo), ("Day", d), ("Hour", h)):
            sky.set_editor_property(k, v)
        sky.call_method("UpdateSky")
        s, m = vec(sky.get_editor_property("SunDirection")), vec(sky.get_editor_property("MoonDirection"))
        light_dir = vec(u.MathLibrary.get_forward_vector(sun_light.get_world_rotation()))
        off = angle([-x for x in s], light_dir)
        row = {"year": y, "month": mo, "day": d, "hour": h, "sun": s, "moon": m, "sunLightForward": light_dir,
               "lightVsDirectionDeg": round(off, 5), "sunElevation": sky.get_editor_property("SunElevation"),
               "daylight": sky.get_editor_property("Daylight"), "moonIllumination": sky.get_editor_property("MoonIllumination"),
               "sunIntensity": sun_light.intensity}
        result["sun"].append(row)
        log("sun " + json.dumps(row))
        if off > 0.01:
            raise RuntimeError(f"The Sun light points {off:.4f}° away from SunDirection at {row}")
    mpc = u.load_asset(MPC)
    for event, rain, snow in (("ToggleRain", 1, 0), ("ToggleSnow", 0, 1), ("ToggleRain", 1, 0), ("ToggleRain", 0, 0)):
        sky.call_method(event)
        got = (sky.get_editor_property("Rain"), sky.get_editor_property("Snow"),
               u.MaterialLibrary.get_scalar_parameter_value(game, mpc, "Rain"), u.MaterialLibrary.get_scalar_parameter_value(game, mpc, "Snow"))
        result["weather"].append({"event": event, "rain": got[0], "snow": got[1], "mpcRain": got[2], "mpcSnow": got[3]})
        log(f"weather {event}: {got}")
        if got != (rain, snow, rain, snow):
            raise RuntimeError(f"{event}: Rain/Snow/MPC {got}, expected {(rain, snow, rain, snow)}")


# 4. The clock in PIE (then 2./3.) ---------------------------------------------------------------------------------------------
u.EditorLoadingAndSavingUtils.new_blank_map(False)
clock_sky = actors.spawn_actor_from_class(u.load_class(None, SKY + ".BP_LundenSky_C"), u.Vector(0, 0, 0))
clock_sky.set_editor_property("TimeScale", 600.0)  # ten game minutes per real second, so Tick's advance is measurable
started = datetime.datetime.now()
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def clock_test():
    try:
        deadline = time.monotonic() + 30
        live = None
        while not live:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not start the sky")
            game = editor.get_game_world()
            found = u.GameplayStatics.get_all_actors_of_class(game, u.load_class(None, SKY + ".BP_LundenSky_C")) if game else []
            live = found[0] if found else None
            yield
        first = [live.get_editor_property(k) for k in ("Year", "Month", "Day", "Hour")]
        now = started.hour + started.minute / 60 + started.second / 3600
        delta = abs((first[3] - now + 12) % 24 - 12) * 60
        same_day = (first[0], first[1], first[2]) in {(started.year, started.month, started.day),
                                                      ((started + datetime.timedelta(minutes=5)).year, (started + datetime.timedelta(minutes=5)).month,
                                                       (started + datetime.timedelta(minutes=5)).day)}
        t0 = time.monotonic()
        while time.monotonic() - t0 < 2.0:
            yield
        later = live.get_editor_property("Hour")
        advanced = ((later - first[3]) % 24) * 60
        result["clock"] = {"pc": started.isoformat(timespec="seconds"), "unreal": first, "minutesOff": round(delta, 3),
                           "advancedGameMinutesIn2s": round(advanced, 2)}
        log("clock " + json.dumps(result["clock"]))
        if not same_day or delta > 2 + 10 * 5:  # TimeScale 600: up to 5 real seconds of PIE start-up are 50 game minutes
            raise RuntimeError(f"BeginPlay did not take the PC's local time: {result['clock']}")
        if advanced < 5:
            raise RuntimeError(f"Tick did not advance the clock: {result['clock']}")
        sun_and_weather(game, live)
        (Path(u.Paths.project_saved_dir()) / "lighting-result.json").write_text(json.dumps(result, indent=2) + "\n")
        log("result " + str(Path(u.Paths.project_saved_dir()) / "lighting-result.json"))
        u.log("LUNDEN_LIGHTING_TEST_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
