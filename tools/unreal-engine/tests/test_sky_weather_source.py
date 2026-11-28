"""#2439: execute emitted Blueprint math against the actual web flash code, without UE.

The tiny arithmetic graph below evaluates the real Expr output, including its select
nodes at discontinuities. It does not stand in for native Blueprint compilation/PIE.
"""
import ast
import json
import math
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "tools/unreal-engine/python/build_lighting.py"


def constant_source(text, name):
    for node in ast.parse(text).body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError("Missing source constant " + name)


class Node:
    def __init__(self, name, pins):
        self.name, self.pins = name.rsplit(":", 1)[-1], pins


class Graph:
    def call(self, name):
        return Node(name, {})


def resolve(value):
    if not isinstance(value, tuple):
        return value
    node, _ = value
    p = {k: resolve(v) for k, v in node.pins.items()}
    ops = {
        "Add_DoubleDouble": lambda: p["A"] + p["B"],
        "Subtract_DoubleDouble": lambda: p["A"] - p["B"],
        "Multiply_DoubleDouble": lambda: p["A"] * p["B"],
        "Divide_DoubleDouble": lambda: p["A"] / p["B"],
        "Greater_DoubleDouble": lambda: p["A"] > p["B"],
        "GreaterEqual_DoubleDouble": lambda: p["A"] >= p["B"],
        "Less_DoubleDouble": lambda: p["A"] < p["B"],
        "LessEqual_DoubleDouble": lambda: p["A"] <= p["B"],
        "SelectFloat": lambda: p["A"] if p["bPickA"] else p["B"],
        "FMin": lambda: min(p["A"], p["B"]),
        "FMax": lambda: max(p["A"], p["B"]),
        "FClamp": lambda: min(p["Max"], max(p["Min"], p["Value"])),
        "Loge": lambda: math.log(p["A"]),
        "Exp": lambda: math.exp(p["A"]),
        "MultiplyMultiply_FloatFloat": lambda: p["Base"] ** p["Exp"],
    }
    return ops[node.name]()


def emitter():
    node = next(n for n in ast.parse(SOURCE.read_text()).body if isinstance(n, ast.ClassDef) and n.name == "Expr")
    env = {"ast": ast, "math": math,
           "constant": lambda node, pin, text: node.pins.__setitem__(pin, float(text)),
           "connect": lambda src, output, node, pin: node.pins.__setitem__(pin, (src, output))}
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(SOURCE), "exec"), env)
    return env["Expr"]


class SkyWeatherSourceTests(unittest.TestCase):
    def test_emitted_envelope_matches_actual_weather_update(self):
        # Run the actual unchanged Weather.update fragment, including boundary choices.
        script = """
const fs=require('node:fs');
const text=fs.readFileSync('src/weather.js','utf8');
const start=text.indexOf('const ft = this.flashT;');
const end=text.indexOf('this.day.flash = this.flash;',start);
if(start<0||end<0)throw Error('Actual flash code not found');
const evaluate=new Function(text.slice(start,end)+'return this.flash;');
const times=[0,.069999,.07,.139999,.14,.219999,.22,.221,.5,1.5,1.50001,9];
console.log(JSON.stringify([.35,.675,1].flatMap(k=>times.map(t=>({t,k,flash:evaluate.call({flashT:t,flashK:k})})))));
"""
        rows = json.loads(subprocess.check_output(["node", "-e", script], cwd=ROOT, text=True))
        Expr = emitter()
        for row in rows:
            expression = Expr(Graph(), {"FlashT": row["t"], "FlashK": row["k"]})
            actual = resolve(expression.run(constant_source(SOURCE.read_text(), "FLASH"))["flash"])
            self.assertAlmostEqual(actual, row["flash"], places=14, msg=str(row))
        self.assertEqual(len(rows), 36)

    def test_no_flash_preserves_every_existing_light_output(self):
        fixture = json.loads((Path(__file__).with_name("fixtures") / "sky-weather-no-flash.json").read_text())
        Expr = emitter()
        for row in fixture["cases"]:
            after = Expr(Graph(), row["inputs"]).run(constant_source(SOURCE.read_text(), "LIGHT"))
            for key, expected in row["expected"].items():
                self.assertEqual(resolve(after[key]), expected, key)



if __name__ == "__main__":
    unittest.main()
