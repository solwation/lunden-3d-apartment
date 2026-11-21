"""Room ids follow src/main.js DoorSync.register, while actor tags use the exporter's persistent id."""
import re


def door_ids(measurements):
    found = {}
    garage_index = 0
    for index, row in enumerate(measurements["doors"]):
        actor = row.get("id")
        if not actor or not row.get("zone"):
            continue
        wire = row.get("wireId")
        source = row.get("source", "")
        if source == "src/garage.js Garage.cageDoors and Garage.place":
            # In pre-#2293 exports this loop emitted all registered garage leaves in target order.
            wire = wire or f"g{garage_index}"
            garage_index += 1
        elif not wire:
            core = re.search(r"\.doors\[(\d+)\]$", source)
            if core and row.get("house"):
                wire = row["house"].upper() + core[1]
            elif row["kind"] == "overhead" and source.startswith("src/garage.js GarageDoor"):
                wire = "q0"
            elif "parts" not in row and row["kind"] in ("swing", "sliding", "cabinet"):
                wire = f"w{index}"
        if wire:
            if not re.fullmatch(r"[wLABCgq](0|[1-9]\d{0,2})", wire) or wire in found.values() or actor in found:
                raise ValueError(f"Invalid or duplicate room door {wire!r} for {actor!r}")
            found[actor] = wire
    return found
