"""The composed editor world and its date for static captures of L_Lunden (#2326)."""
import json
from pathlib import Path

import unreal as u

MANIFEST = json.loads((Path(__file__).resolve().parents[1] / "world-levels.json").read_text(encoding="utf-8"))
COMPONENT = "/Game/Lunden/Seasons/BPC_LundenSeasons.BPC_LundenSeasons_C"


def loaded_capture_levels(world):
    """Require visible ULevels in this world. A package on disk or a streaming descriptor alone is insufficient."""
    if world.get_outermost().get_name().casefold() != MANIFEST["map"].casefold():
        raise RuntimeError(f"Expected capture world {MANIFEST['map']}, got {world.get_path_name()}")
    members = list(u.EditorLevelUtils.get_levels(world))
    loaded, problems = [], []
    for entry in MANIFEST["levels"]:
        package = entry["package"]
        stream = u.GameplayStatics.get_streaming_level(world, package)
        if not stream or str(stream.get_world_asset_package_f_name()).casefold() != package.casefold():
            reason = "missing streaming level"
        else:
            level = stream.get_loaded_level()
            if not level or level not in members or level.get_outermost().get_name().casefold() != package.casefold():
                reason = "level is not loaded in this world"
            elif not stream.is_level_visible():
                reason = "level is hidden"
            else:
                loaded.append(package)
                continue
        problems.append(f"{package}: {reason} (builder: {entry['builder']})")
    if problems:
        raise RuntimeError("Capture requires the composed world. Build the missing levels and run compose_world.py:\n"
                           + "\n".join(problems))
    return loaded


class CaptureSeasons:
    def __init__(self, world):
        self.loaded_levels = loaded_capture_levels(world)
        cls = u.load_class(None, COMPONENT)
        if not cls:
            raise RuntimeError("Cannot load the season component " + COMPONENT)
        self.holder = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.Actor, u.Vector())
        self.component = u.new_object(cls, outer=self.holder)
        self.actors = list(u.GameplayStatics.get_all_actors_with_tag(world, "seasonal"))
        self.editor_lamps = [(a, a.is_temporarily_hidden_in_editor()) for a in self.actors
                             if a.get_component_by_class(u.LightComponent)]

    def apply(self, date, hour=None):
        """ApplySeason, or with `hour` ApplySeasonAt (#2406: actors with clock hours, the patio beers, follow it)."""
        if hour is None:
            self.component.call_method("ApplySeason", tuple(date))
        else:
            self.component.call_method("ApplySeasonAt", (*date, int(hour)))
        hidden = [a for a in self.actors if a.get_editor_property("hidden")]
        # SceneCapture2D's hidden-actors list handles meshes; lights contribute independently to the editor view.
        # Preserve preexisting editor visibility and the lamp preset's component state when switching dates.
        for actor, originally_hidden in self.editor_lamps:
            actor.set_is_temporarily_hidden_in_editor(originally_hidden or actor.get_editor_property("hidden"))
        return hidden

    def hidden_at(self, hidden, date, hour):
        """#2406: `hidden` (from one apply for every view) with the actors that keep clock hours (seasonHourFrom/To tags,
        the patio beers) left out or kept for this view's `hour` by BPC_LundenSeasons' own InSeason and InHours. Their
        hidden flag follows too (a hidden actor stays out of the capture), but not their collision, which apply set once."""
        def tag(actor, prefix):
            found = [str(t)[len(prefix):] for t in actor.tags if str(t).startswith(prefix)]
            return int(found[0]) if found else None
        timed = [a for a in self.actors if tag(a, "seasonHourFrom:") is not None and tag(a, "seasonHourTo:") is not None]
        out = [a for a in hidden if a not in timed]
        for a in timed:
            shown = (self.component.call_method("InSeason", (*date, tag(a, "seasonFrom:"), tag(a, "seasonTo:")))
                     and self.component.call_method("InHours", (int(hour), tag(a, "seasonHourFrom:"), tag(a, "seasonHourTo:"))))
            a.set_actor_hidden_in_game(not shown)
            if not shown:
                out.append(a)
        return out
