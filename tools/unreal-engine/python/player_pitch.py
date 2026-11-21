"""Read the web player's pitch stop from measurements.json (radians)."""
import math


def pitch_limit_rad(player):
    # Format 1 exports before #2370 omitted the web's fixed 1.45 rad stop.
    limit = player.get("pitchLimit", 1.45)
    if type(limit) not in (int, float) or not 0 < limit < math.pi / 2:
        raise ValueError("spawn.player.pitchLimit must be in radians between zero and a quarter turn")
    return limit
