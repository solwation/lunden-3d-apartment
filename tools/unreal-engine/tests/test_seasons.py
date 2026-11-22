"""#2295: seasonal pieces in Play In Editor on L_Lunden follow the web's date rule (src/christmas.js inChristmas).

1. Editor world: the tree and its parts have the Christmas window. The four furnishings covered by the tree in
   the web's default layout and all their parts have the complementary window (#2303). The patio sofa's decorative
   cushions (a part of the all-year sofa) have the window of src/patio.js cushionsOut's months (#2387). The snowman on
   the lawn beyond the patio hedge (one furniture root and its parts) has snowmanOut's window across the new year (#2445).
2. PIE with the world's GameMode: BP_LundenPlayerController carries BPC_LundenSeasons (player-extensions.json), and its
   BeginPlay left the tree as the rule says for the PC's local date today.
3. For every row of tools/unreal-engine/tests/season-dates.json (checked against the web's own function by
   season-rule.test.mjs) the test hook ApplySeason(year, month, day) shows the tree with collision on the Christmas
   dates and hides it without collision on the others (summer, the days around the window, the new-year wrap);
   the covered furniture always has the opposite visibility and collision, and the patio cushions show with
   collision exactly on the rows' `cushions` dates (out 1 April - 30 September, in the cushion box otherwise), and the
   snowman exactly on the rows' `snowman` dates (1 December - end of February, #2445).
   Other furniture retains its state.
4. #2406: the slat table's pints (parts of the all-year table) carry src/patio.js beersOut's date window and clock hours.
   BeginPlay left them as the rule says for the PC's date and hour and left the clock driving (ClockDriven); for every
   `beerTimes` row of season-dates.json the test hook ApplySeasonAt(year, month, day, hour) shows them with collision
   exactly when the web's answer is true, and ApplySeason stops the clock. ClockTick (the 60 s timer's function) puts
   the PC's date and hour back once the clock drives again.

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
TREE, CORNER, SNOWMAN = "season:christmas", "season:outsideChristmas", "season:snowman"
roots = [a for a in editor_actors if "kind:furniture" in tags(a) and "seasonal" in tags(a) and SNOWMAN not in tags(a)]
expected_types = {TREE: ["xmastree"], CORNER: ["armchair", "floorlamp", "ottoman", "randerstable"]}
types = {TREE: [], CORNER: []}
actor_ids = {TREE: set(), CORNER: set()}
windows = {}
for root in roots:
    rid = tags(root)[0]
    labels = set(tags(root)).intersection(expected_types)
    if len(labels) != 1:
        raise RuntimeError(f"{rid}: expected one season group, found {tags(root)}")
    group = labels.pop()
    types[group].append(rid.split("_")[1])
    window = (tag_value(root, "seasonFrom:"), tag_value(root, "seasonTo:"))
    if None in window or windows.setdefault(group, window) != window:
        raise RuntimeError(f"{rid}: inconsistent or missing {group} window {window}")
    parts = [a for a in editor_actors if f"parent:{rid}" in tags(a)]
    if not parts:
        raise RuntimeError(f"{rid}: no imported furniture parts")
    # Level_lighting has its own point-light actor with the furniture's stable id.
    lamps = [a for a in editor_actors if f"lamp:{rid}" in tags(a)]
    if rid.split("_")[1] in ("xmastree", "floorlamp") and len(lamps) != 1:
        raise RuntimeError(f"Missing or duplicate light for {rid}: rebuild Level_lighting and compose L_Lunden")
    for actor in [root, *parts, *lamps]:
        if not {"seasonal", group, f"seasonFrom:{window[0]}", f"seasonTo:{window[1]}"}.issubset(tags(actor)):
            raise RuntimeError(f"{rid}: missing {group} window on {tags(actor)}")
        actor_ids[group].add(tags(actor)[0])
    u.log(f"LUNDEN_SEASONS_TEST {rid}: {group}, window {window[0]}..{window[1]}, {len(parts)} parts tagged")
if {group: sorted(names) for group, names in types.items()} != expected_types:
    raise RuntimeError(f"Seasonal furniture {types}; expected web default {expected_types}. Re-import l1007 and compose L_Lunden.")
FROM, TO = windows[TREE]
# #2387: the patio sofa's decorative cushions, a seasonal part inside the all-year sofa.
CUSHIONS = "season:patioCushions"
cushion_actors = [a for a in editor_actors if CUSHIONS in tags(a)]
if not cushion_actors:
    raise RuntimeError("No patio cushions with a season window: re-export (#2387), re-import l1007-uteplats and compose L_Lunden")
for actor in cushion_actors:
    window = (tag_value(actor, "seasonFrom:"), tag_value(actor, "seasonTo:"))
    if ("kind:part" not in tags(actor) or not any(t.startswith("parent:furn_veronasofa_") for t in tags(actor))
            or None in window or windows.setdefault(CUSHIONS, window) != window):
        raise RuntimeError(f"{tags(actor)[0]}: not a sofa cushion part with one window: {tags(actor)}")
    actor_ids.setdefault(CUSHIONS, set()).add(tags(actor)[0])
u.log(f"LUNDEN_SEASONS_TEST patio cushions {sorted(actor_ids[CUSHIONS])}: window {windows[CUSHIONS][0]}..{windows[CUSHIONS][1]}")
# #2406: the slat table's pints, seasonal parts with an hour window inside the all-year table.
BEERS = "season:patioBeers"
BEER_TIMES = json.loads((TESTS / "season-dates.json").read_text(encoding="utf-8"))["beerTimes"]
beer_actors = [a for a in editor_actors if BEERS in tags(a)]
if not beer_actors:
    raise RuntimeError("No patio beers with a season window: re-export (#2406), re-import l1007-uteplats and compose L_Lunden")
for actor in beer_actors:
    window = (tag_value(actor, "seasonFrom:"), tag_value(actor, "seasonTo:"), tag_value(actor, "seasonHourFrom:"), tag_value(actor, "seasonHourTo:"))
    if ("kind:part" not in tags(actor) or not any(t.startswith("parent:furn_slattable_") for t in tags(actor))
            or None in window or windows.setdefault(BEERS, window) != window):
        raise RuntimeError(f"{tags(actor)[0]}: not a slat-table beer part with one date and hour window: {tags(actor)}")
    actor_ids.setdefault(BEERS, set()).add(tags(actor)[0])
u.log(f"LUNDEN_SEASONS_TEST patio beers {len(actor_ids[BEERS])} actors: window {windows[BEERS]}")
# #2445: the snowman, one seasonal furniture root (with its parts) across the new year.
snowman_roots = [a for a in editor_actors if "kind:furniture" in tags(a) and SNOWMAN in tags(a)]
if len(snowman_roots) != 1 or not tags(snowman_roots[0])[0].startswith("furn_snowman_"):
    raise RuntimeError(f"Want one snowman root with a season window, found {[tags(a)[0] for a in snowman_roots]}: "
                       "re-export (#2445), re-import l1007-uteplats and compose L_Lunden")
sid = tags(snowman_roots[0])[0]
windows[SNOWMAN] = (tag_value(snowman_roots[0], "seasonFrom:"), tag_value(snowman_roots[0], "seasonTo:"))
snowman_parts = [a for a in editor_actors if f"parent:{sid}" in tags(a)]
if not snowman_parts or None in windows[SNOWMAN] or windows[SNOWMAN][0] <= windows[SNOWMAN][1]:
    raise RuntimeError(f"{sid}: {len(snowman_parts)} parts, window {windows[SNOWMAN]} (want parts and a window across the new year)")
for actor in [snowman_roots[0], *snowman_parts]:
    if not {"seasonal", SNOWMAN, f"seasonFrom:{windows[SNOWMAN][0]}", f"seasonTo:{windows[SNOWMAN][1]}"}.issubset(tags(actor)):
        raise RuntimeError(f"{sid}: missing snowman window on {tags(actor)}")
    actor_ids.setdefault(SNOWMAN, set()).add(tags(actor)[0])
u.log(f"LUNDEN_SEASONS_TEST snowman {sid}: window {windows[SNOWMAN][0]}..{windows[SNOWMAN][1]}, {len(snowman_parts)} parts tagged")
untouched_ids = [tags(a)[0] for a in editor_actors if "kind:furniture" in tags(a) and "seasonal" not in tags(a)][:5]


def hour_rule(hour, start, end):
    """For the BeginPlay check only: src/patio.js beersOut's hours, start <= hour < end (or across midnight)."""
    return start <= hour < end if start <= end else hour >= start or hour < end


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
        if not untouched or len(untouched) != len(untouched_ids):
            raise RuntimeError(f"PIE found {len(untouched)} untouched actors of {untouched_ids}")
        initial = [(a.get_editor_property("hidden"), a.get_actor_enable_collision()) for a in untouched]
        groups = {group: [a for a in seasonal if group in tags(a)] for group in actor_ids}
        for group, actors in groups.items():
            if {tags(a)[0] for a in actors} != actor_ids[group]:
                raise RuntimeError(f"Seasonal actor IDs in PIE differ from the imported {group} roots and parts")

        def state(group, should_show):
            states = {(a.get_editor_property("hidden"), a.get_actor_enable_collision()) for a in groups[group]}
            if states != {(not should_show, should_show)}:
                raise RuntimeError(f"{group}: hidden/collision {states}; should show {should_show}")
            return states.pop()

        today = datetime.date.today()
        want = web_rule(today.year, today.month, today.day, FROM, TO)
        hidden, solid = state(TREE, want)
        corner_hidden, corner_solid = state(CORNER, not want)
        cushions_out = web_rule(today.year, today.month, today.day, *windows[CUSHIONS])
        cushions_hidden, _ = state(CUSHIONS, cushions_out)
        snowman_out = web_rule(today.year, today.month, today.day, *windows[SNOWMAN])
        snowman_hidden, _ = state(SNOWMAN, snowman_out)
        # #2406: BeginPlay ran ApplyClock (the PC's date and hour) and left the clock driving. Read the hour again if the
        # clock turned an hour during the check.
        bw = windows[BEERS]
        for _ in range(2):
            now = datetime.datetime.now()
            beers_out = web_rule(now.year, now.month, now.day, bw[0], bw[1]) and hour_rule(now.hour, bw[2], bw[3])
            beer_states = {(a.get_editor_property("hidden"), a.get_actor_enable_collision()) for a in groups[BEERS]}
            if beer_states == {(not beers_out, beers_out)} or datetime.datetime.now().hour == now.hour:
                break
        state(BEERS, beers_out)
        if not seasons.get_editor_property("ClockDriven") or seasons.get_editor_property("Hour") not in (now.hour, (now.hour + 1) % 24):
            raise RuntimeError(f"BeginPlay left ClockDriven {seasons.get_editor_property('ClockDriven')}, "
                               f"Hour {seasons.get_editor_property('Hour')} (PC hour {now.hour})")
        result["todayBeers"] = {"time": now.isoformat(timespec="minutes"), "beersOut": beers_out, "clockDriven": True}
        u.log(f"LUNDEN_SEASONS_TEST BeginPlay beers {json.dumps(result['todayBeers'])}")
        result["today"] = {"date": str(today), "hidden": hidden, "collision": solid, "web": want,
                           "cornerHidden": corner_hidden, "cornerCollision": corner_solid,
                           "cushionsHidden": cushions_hidden, "cushionsOut": cushions_out,
                           "snowmanHidden": snowman_hidden, "snowmanOut": snowman_out}
        u.log(f"LUNDEN_SEASONS_TEST BeginPlay {json.dumps(result['today'])}")

        for row in DATES:
            y, m, d = (int(v) for v in row["date"].split("-"))
            seasons.call_method("ApplySeason", (y, m, d))
            yield
            hidden, solid = state(TREE, row["christmas"])
            corner_hidden, corner_solid = state(CORNER, not row["christmas"])
            cushions_hidden, cushions_solid = state(CUSHIONS, row["cushions"])
            cushion_rule = seasons.call_method("InSeason", (y, m, d, *windows[CUSHIONS]))
            snowman_hidden, snowman_solid = state(SNOWMAN, row["snowman"])
            snowman_rule = seasons.call_method("InSeason", (y, m, d, *windows[SNOWMAN]))
            rule = seasons.call_method("InSeason", (y, m, d, FROM, TO))
            after = [(a.get_editor_property("hidden"), a.get_actor_enable_collision()) for a in untouched]
            others = sorted({hidden for hidden, _ in after})
            entry = {**row, "hidden": hidden, "collision": solid, "inSeason": rule, "untouchedHidden": others,
                     "cornerHidden": corner_hidden, "cornerCollision": corner_solid,
                     "cushionsHidden": cushions_hidden, "cushionsCollision": cushions_solid, "cushionRule": cushion_rule,
                     "snowmanHidden": snowman_hidden, "snowmanCollision": snowman_solid, "snowmanRule": snowman_rule}
            result["dates"].append(entry)
            u.log(f"LUNDEN_SEASONS_TEST {json.dumps(entry)}")
            if rule != row["christmas"] or cushion_rule != row["cushions"] or snowman_rule != row["snowman"] or after != initial or others != [False]:
                raise RuntimeError(f"{row['date']}: {entry}, the web: christmas {row['christmas']}")
        result["beerTimes"] = []
        for row in BEER_TIMES:
            y, m, d = (int(v) for v in row["date"].split("-"))
            seasons.call_method("ApplySeasonAt", (y, m, d, row["hour"]))
            yield
            beers_hidden, beers_solid = state(BEERS, row["beers"])
            in_hours = seasons.call_method("InHours", (row["hour"], bw[2], bw[3]))
            driven = seasons.get_editor_property("ClockDriven")
            entry = {**row, "hidden": beers_hidden, "collision": beers_solid, "inHours": in_hours, "clockDriven": driven}
            result["beerTimes"].append(entry)
            u.log(f"LUNDEN_SEASONS_TEST beers {json.dumps(entry)}")
            if driven or in_hours != hour_rule(row["hour"], bw[2], bw[3]):
                raise RuntimeError(f"{row['date']} {row['hour']}:00: {entry}")
        # ClockTick (the timer's function) does nothing while a fixed date holds, and restores the PC clock once it drives
        seasons.call_method("ClockTick")
        yield
        state(BEERS, BEER_TIMES[-1]["beers"])
        seasons.set_editor_property("ClockDriven", True)
        seasons.call_method("ClockTick")
        yield
        now = datetime.datetime.now()
        state(BEERS, web_rule(now.year, now.month, now.day, bw[0], bw[1]) and hour_rule(now.hour, bw[2], bw[3]))
        state(TREE, web_rule(now.year, now.month, now.day, FROM, TO))
        result["clockTick"] = {"time": now.isoformat(timespec="minutes"), "clockDriven": seasons.get_editor_property("ClockDriven")}
        u.log(f"LUNDEN_SEASONS_TEST ClockTick {json.dumps(result['clockTick'])}")
        (Path(u.Paths.project_saved_dir()) / "seasons-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log(f"LUNDEN_SEASONS_TEST {len(seasonal)} seasonal actors, {len(DATES)} dates agree with the web")
        u.log("LUNDEN_SEASONS_TEST_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
