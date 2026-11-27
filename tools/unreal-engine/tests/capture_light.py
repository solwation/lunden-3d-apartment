"""#2306: the light of an editor-world capture, one rule for every capture script.

A map with its own lighting (L_Lunden since #2283: one BP_LundenSky tagged lunden:sky, composed from
Generated/Lighting/Level_lighting, and the lamps tagged lamp:*) is lit by it: the sky is set to views.json's date and the
preset's hour (UseClock off, clear weather), the lamps follow the preset's lampsOn, and the capture takes the game's
locked exposure (game_bias, #2313). Pilot_L1007 keeps the rig already saved on the pilot map, including its room lamps.
The helper never adds lighting or saves the world. Each capture records which actors supplied its light.
"""
import json
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
import capture_pilot  # noqa: E402
from capture_world import CaptureSeasons  # noqa: E402

VIEWS = json.loads((Path(__file__).resolve().parents[3] / "unreal/Lunden/Tests/views.json").read_text(encoding="utf-8"))


def tags(actor):
    return [str(t) for t in actor.tags]


def game_bias(sky):
    """#2313: the exposure the game shows now: BP_LundenSky's Weather post process is manual at its bias and its Exposure
    component, blended in by the weight UpdateSky gave it, overrides that bias; the engine lerps the two by the weight.
    (A scene capture does not take the world's exposure, so captures set it themselves.)"""
    pps = {c.get_name(): c for c in sky.get_components_by_class(u.PostProcessComponent)}
    base = pps["Weather"].get_editor_property("settings").get_editor_property("auto_exposure_bias")
    top = pps["Exposure"].get_editor_property("settings").get_editor_property("auto_exposure_bias")
    return base + pps["Exposure"].get_editor_property("blend_weight") * (top - base)


def update_sky_for_capture(world, sky):
    sky.call_method("UpdateSky")
    # A commandlet editor world never ticks the facade controller's fade.
    for facade in u.GameplayStatics.get_all_actors_with_tag(world, "lunden:facade-controller"):
        facade.call_method("SettleFacade")


def settle_furnishing_lights(world):
    # A commandlet has no actor tick. Refresh after room switches and seasonal visibility were applied.
    for curtain in u.GameplayStatics.get_all_actors_with_tag(world, "lunden:curtain-light"):
        curtain.call_method("UpdateCurtainLight")
    for cabinet in u.GameplayStatics.get_all_actors_with_tag(world, "lunden:cabinet-washes"):
        cabinet.call_method("UpdateWashes")
    for rug in u.GameplayStatics.get_all_actors_with_tag(world, "lunden:rug-floor-pool"):
        rug.call_method("UpdateRugPool")
    for pool in u.GameplayStatics.get_all_actors_with_tag(world, "lunden:display-pool-driver"):
        pool.call_method("UpdateDisplayPool")


class MapLight:
    """The map's own BP_LundenSky and lamps."""
    kind = "map"

    def __init__(self, world, sky, lamps):
        self.world, self.sky, self.lamps = world, sky, lamps
        self.seasons = CaptureSeasons(world)
        self.skylight = sky.get_component_by_class(u.SkyLightComponent)
        # A real-time sky capture is refreshed by the main view, which a commandlet capture does not render: capture the
        # sky once per view instead (in memory, never saved; the game keeps the real-time capture).
        self.skylight.set_editor_property("real_time_capture", False, u.PropertyAccessChangeNotifyMode.NEVER)

    def use(self, name, preset, date=None, *, applied_season=None):
        if date is None:
            date = [VIEWS["date"][k] for k in ("year", "month", "day")]
        hour = float(VIEWS["lighting"][name]["hour"])
        for k, v in (("UseClock", False), ("TimeScale", 0.0), ("Year", date[0]), ("Month", date[1]), ("Day", date[2]),
                     ("Hour", hour), ("Rain", 0.0), ("Snow", 0.0), ("Wet", 0.0)):
            # NEVER notify: a property change in the editor world re-runs the construction script, which resets the lights
            self.sky.set_editor_property(k, v, u.PropertyAccessChangeNotifyMode.NEVER)
        update_sky_for_capture(self.world, self.sky)
        for lamp in self.lamps:
            lamp.call_method("TurnOn" if preset["lampsOn"] else "TurnOff")
        hidden = self.seasons.apply(date, hour) if applied_season is None else applied_season
        settle_furnishing_lights(self.world)
        self.skylight.recapture_sky()
        return hidden

    def bias(self, preset):
        return game_bias(self.sky)


class PilotRig:
    """Use the named rig authored by capture_pilot.level and its original presets."""
    kind = "pilot"

    def __init__(self, actors):
        self.rig = {a.get_actor_label().removeprefix(capture_pilot.LABEL): a for a in actors
                    if a.get_actor_label().startswith(capture_pilot.LABEL)}
        missing = {"Sun", "Sky", "Ambient"} - self.rig.keys()
        if missing:
            raise RuntimeError(f"Pilot lighting is incomplete: {sorted(missing)}")

    def use(self, name, preset):
        capture_pilot.set_time(self.rig, preset)

    def bias(self, preset):
        return -0.7 if preset["lampsOn"] else 0


def light_for(world):
    actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    skies = [a for a in actors if "lunden:sky" in tags(a)]
    if world.get_name() == "Pilot_L1007" and not skies:
        return PilotRig(actors)
    if len(skies) != 1:
        raise RuntimeError(f"{world.get_name()} has {len(skies)} lunden:sky actors; load its composed lighting level")
    return MapLight(world, skies[0], [a for a in actors if any(t.startswith("lamp:") for t in tags(a))])


def count_lights(world, light):
    """Count visible, emitting components and verify each one's owner, even when actors share a label."""
    counts = {"directional": 0, "sky": 0, "owners": []}
    allowed = [light.sky] if isinstance(light, MapLight) else [light.rig["Sun"], light.rig["Sky"]]
    stray = []
    for actor in u.GameplayStatics.get_all_actors_of_class(world, u.Actor):
        for key, cls in (("directional", u.DirectionalLightComponent), ("sky", u.SkyLightComponent)):
            for comp in actor.get_components_by_class(cls):
                if comp.is_visible() and comp.intensity > 0:
                    counts[key] += 1
                    name = f"{actor.get_actor_label()}.{comp.get_name()}"
                    counts["owners"].append(name)
                    if actor not in allowed:
                        stray.append(name)
    # The composed sky has a sun and a moon. The pilot rig has only its sun.
    max_directional = 2 if isinstance(light, MapLight) else 1
    if stray or counts["sky"] != 1 or not 1 <= counts["directional"] <= max_directional:
        raise RuntimeError(f"{world.get_name()} has unexpected lighting: {counts}, extra components {stray}")
    return counts
