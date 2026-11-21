"""Evaluate the same Blueprint math operations build_curtains.controller emits, against Blinds.update."""
import json
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from build_curtains import emission


class MathPins:
    def op(self, name, **pins):
        if name == "FClamp":
            return min(float(pins["Max"]), max(float(pins["Min"]), pins["Value"]))
        a, b = pins["A"], pins["B"]
        if name == "Add_DoubleDouble":
            return float(a) + float(b)
        if name == "Subtract_DoubleDouble":
            return float(a) - float(b)
        if name == "Multiply_DoubleDouble":
            return float(a) * float(b)
        if name == "Greater_DoubleDouble":
            return float(a) > float(b)
        if name == "BooleanAND":
            return a and b
        if name == "SelectVector":
            return a if pins["bPickA"] else [float(c) for c in b.split(",")]
        if name == "Multiply_VectorFloat":
            return [v * b for v in a]
        if name == "Add_VectorVector":
            return [x + y for x, y in zip(a, b)]
        raise ValueError(name)


cases = json.load(sys.stdin)
errors = [math.dist(emission(MathPins(), c["daylight"], c["dusk"], c["supply"], c["lit"], c["day"], c["lamp"]),
                    c["expected"]) for c in cases]
assert max(errors) < 1e-12, max(errors)
print(f"{len(cases)} web/Blueprint lighting samples; max linear RGB vector error {max(errors):.3g}.")
