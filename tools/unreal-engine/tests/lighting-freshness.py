"""Exercise #2385 with the same real export and versioned sky package as the push check."""
import argparse
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory

CHECK = Path(__file__).resolve().parents[1] / "check-lighting.py"
lighting = runpy.run_path(str(CHECK))


def check(measurements, sky, *, stale):
    result = subprocess.run([sys.executable, str(CHECK), str(measurements), "--sky-asset", str(sky)],
                            capture_output=True, text=True)
    if stale:
        if result.returncode == 0 or "stale Lighting assets" not in result.stderr or "build_lighting.py" not in result.stderr:
            raise AssertionError(f"expected an actionable stale Lighting failure, got {result.returncode}: {result.stderr}")
    elif result.returncode:
        raise AssertionError(result.stderr)


def exercise(measurements, sky):
    data = json.loads(measurements.read_bytes())
    with TemporaryDirectory() as directory:
        copy = Path(directory) / "measurements.json"
        # An unrelated scene edit changes the whole export file, but keeps the versioned Lighting current.
        data["spawn"] = {}
        copy.write_text(json.dumps(data))
        check(copy, sky, stale=False)
        # An exported cloud parameter (#2371) and an actual lamp position independently require a rebuild.
        clouds = data["site"]["sky"]["clouds"]
        height = clouds["height"]
        clouds["height"] = height + 1
        copy.write_text(json.dumps(data))
        check(copy, sky, stale=True)
        clouds["height"] = height
        # #2421: the raw-output night sky palette is part of the saved material signature.
        night_zenith = clouds["palette"]["nightZenith"]
        old_blue = night_zenith[2]
        night_zenith[2] = old_blue + 0.001
        copy.write_text(json.dumps(data))
        check(copy, sky, stale=True)
        night_zenith[2] = old_blue
        # #2394: source window colours participate in the real saved sky signature.
        sky_day = data["site"]["windowDaylight"]["runtimeColors"]["skyDay"]
        old_red = sky_day[0]
        sky_day[0] = old_red + 0.01
        copy.write_text(json.dumps(data))
        check(copy, sky, stale=True)
        sky_day[0] = old_red
        # #2403: the actual saved controller must match the exported folding rule.
        parasol_rule = data["furnishing"]["parasols"][0]["rule"]
        sun_threshold = parasol_rule["sunThreshold"]
        parasol_rule["sunThreshold"] = sun_threshold + 0.001
        copy.write_text(json.dumps(data))
        check(copy, sky, stale=True)
        parasol_rule["sunThreshold"] = sun_threshold
        data["lights"][0]["position"]["unreal"][0] += 10
        copy.write_text(json.dumps(data))
        check(copy, sky, stale=True)

    blob = sky.read_bytes()
    # The original hash bytes are still present in both copies. The first has no tag, the second
    # still has that tag but its soft object path now names a different Blueprint.
    for old, new in [(b"Lunden.SpecHash\0", b"Lunden.TestHash\0"), (b"BP_LundenSky\0", b"BP_LundenXXX\0")]:
        # Only replace a complete name-table entry (the package name also ends in BP_LundenSky).
        entry = (len(old)).to_bytes(4, "little") + old
        assert entry in blob
        altered = blob.replace(entry, (len(new)).to_bytes(4, "little") + new, 1)
        try:
            lighting["blueprint_signature"](altered)
        except ValueError as error:
            assert "Lunden.SpecHash" in str(error), str(error)
        else:
            raise AssertionError(f"accepted old signature after changing {old!r}")
    print("Lighting regressions OK: unrelated changes, cloud, night palette, window colours, parasol rule, lamp position, tag and Blueprint owner")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("measurements", type=Path)
    parser.add_argument("--sky-asset", type=Path, default=lighting["ASSET"])
    args = parser.parse_args()
    exercise(args.measurements, args.sky_asset)
