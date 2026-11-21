"""#2295: seasonal pieces in Play In Editor on L_Lunden follow the web's date rule (src/christmas.js inChristmas).

1. Editor world: the imported Christmas tree and all its parts carry the season tags import_world.py writes
   (seasonal, season:christmas, seasonFrom/seasonTo = the export's window as month * 100 + day).
2. PIE with the world's GameMode: BP_LundenPlayerController carries BPC_LundenSeasons (player-extensions.json), and its
   BeginPlay left the tree as the rule says for the PC's local date today.
3. For every row of tools/unreal-engine/tests/season-dates.json (checked against the web's own function by
   season-rule.test.mjs) the test hook ApplySeason(year, month, day) shows the tree with collision on the Christmas
   dates and hides it without collision on the others (summer, the days around the window, the new-year wrap);
   InSeason gives the same answer, and furniture without the tag is never touched.

Run like the other PIE tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_seasons
Writes Saved/seasons-result.json and logs LUNDEN_SEASONS_TEST lines, then LUNDEN_SEASONS_TEST_OK.
"""
import datetime
import json
from pathlib import Path
import time
import sys
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TESTS = PROJECT.parents[1] / "tools/unreal-engine/tests"
DATES = json.loads((TESTS / "season-dates.json").read_text(encoding="utf-8"))["dates"]
MAP = "/Game/Lunden/Maps/L_Lunden"
COMPONENT = "/Game/Lunden/Seasons/BPC_LundenSeasons.BPC_LundenSeasons_C"


def tags(actor):
    return [str(t) for t in actor.tags]


def tag_value(actor, prefix):
    found = [t[len(prefix):] for t in tags(actor) if t.startswith(prefix)]
    return int(found[0]) if found else None


# 1. Editor world ---------------------------------------------------------------------------------------------------
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError(f"Cannot load {MAP}: run compose_world.py first")
editor_actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
roots = [a for a in editor_actors if "kind:furniture" in tags(a) and "seasonal" in tags(a)]
if not roots:
    raise RuntimeError("No seasonal furniture in L_Lunden: re-import l1007 with import_world.py (importer version 3)")
windows = {}
for root in roots:
    rid = tags(root)[0]
    parts = [a for a in editor_actors if f"parent:{rid}" in tags(a)]
    untagged = [tags(p)[0] for p in parts if "seasonal" not in tags(p)]
    window = (tag_value(root, "seasonFrom:"), tag_value(root, "seasonTo:"))
    if untagged or None in window or "season:christmas" not in tags(root):
        raise RuntimeError(f"{rid}: window {window}, tags {tags(root)}, untagged parts {untagged[:5]}")
    windows[rid] = window
    u.log(f"LUNDEN_SEASONS_TEST {rid}: window {window[0]}..{window[1]}, {len(parts)} parts tagged")
FROM, TO = next(iter(windows.values()))
untouched_ids = [tags(a)[0] for a in editor_actors if "kind:furniture" in tags(a) and "seasonal" not in tags(a)][:5]


def web_rule(year, month, day, start, end):
    """For the BeginPlay check only: src/christmas.js inChristmas with the window from the tags."""
    days = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    key = month * 100 + min(day, days[month - 1])
    return start <= key <= end if start <= end else key >= start or key <= end


saved_slot = save_isolation.isolate()
u.get_editor_subsystem(u.LevelEditorSubsystem).editor_request_begin_play()
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)


@u.AutomationScheduler.add_latent_command
def seasons_test():
    levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
    result = {"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "window": [FROM, TO], "dates": []}
    try:
        deadline = time.monotonic() + 60
        pc = None
        while not pc:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not start a player controller")
            game = editor.get_game_world()
            pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
            yield
        for _ in range(10):  # let BeginPlay run on every component
            yield
        cls = u.load_class(None, COMPONENT)
        comps = pc.get_components_by_class(cls)
        if pc.get_class().get_name() != "BP_LundenPlayerController_C" or len(comps) != 1:
            raise RuntimeError(f"{pc.get_class().get_name()} carries {len(comps)} BPC_LundenSeasons (want 1): "
                               "add the player-extensions.json row and run build_player.py")
        seasons = comps[0]
        seasonal = list(u.GameplayStatics.get_all_actors_with_tag(game, "seasonal"))
        all_actors = u.GameplayStatics.get_all_actors_of_class(game, u.Actor)
        untouched = [a for a in all_actors if a.tags and str(a.tags[0]) in untouched_ids]
        if len(seasonal) < 2 or len(untouched) != len(untouched_ids):
            raise RuntimeError(f"PIE world has {len(seasonal)} seasonal actors and {len(untouched)} of {untouched_ids}")

        def state():
            hidden = {a.get_editor_property("hidden") for a in seasonal}
            solid = {a.get_actor_enable_collision() for a in seasonal}
            if len(hidden) != 1 or len(solid) != 1:
                raise RuntimeError(f"Seasonal actors disagree: hidden {hidden}, collision {solid}")
            return hidden.pop(), solid.pop()

        today = datetime.date.today()
        want = web_rule(today.year, today.month, today.day, FROM, TO)
        hidden, solid = state()
        u.log(f"LUNDEN_SEASONS_TEST today {today} (BeginPlay, local date): hidden {hidden}, collision {solid}, web {want}")
        result["today"] = {"date": str(today), "hidden": hidden, "collision": solid, "web": want}
        if hidden == want or solid != want:
            raise RuntimeError(f"BeginPlay on {today}: hidden {hidden}, collision {solid}; the web shows it: {want}")

        for row in DATES:
            y, m, d = (int(v) for v in row["date"].split("-"))
            seasons.call_method("ApplySeason", (y, m, d))
            yield
            hidden, solid = state()
            rule = seasons.call_method("InSeason", (y, m, d, FROM, TO))
            others = sorted({a.get_editor_property("hidden") for a in untouched})
            entry = {**row, "hidden": hidden, "collision": solid, "inSeason": rule, "untouchedHidden": others}
            result["dates"].append(entry)
            u.log(f"LUNDEN_SEASONS_TEST {json.dumps(entry)}")
            if hidden == row["christmas"] or solid != row["christmas"] or rule != row["christmas"] or others != [False]:
                raise RuntimeError(f"{row['date']}: {entry}, the web: christmas {row['christmas']}")
        (Path(u.Paths.project_saved_dir()) / "seasons-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log(f"LUNDEN_SEASONS_TEST {len(seasonal)} seasonal actors, {len(DATES)} dates agree with the web")
        u.log("LUNDEN_SEASONS_TEST_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
