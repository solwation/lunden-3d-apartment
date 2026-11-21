"""Evaluate the actual generated gate branches without launching Unreal. Run with python3 garage-rules.py."""
from pathlib import Path
import sys
import unittest
import math

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from garage_control import gate_step


class Graph:
    """Execute the subset of Blueprint nodes that gate_step emits on an in-memory door."""
    def __init__(self, values, active=True):
        self.values, self.active = values, active

    def get(self, key, owner=None, target=None):
        return self.values[key]

    def set(self, key, value):
        if self.active:
            self.values[key] = float(value)

    def fork(self, pin, y):
        return Graph(self.values, pin)

    def branch(self, cond):
        old, self.active = self.active, self.active and cond
        return old and not cond

    def pure(self, path, **kwargs):
        return {"KismetSystemLibrary:IsValid": True, "Actor:K2_GetActorRotation": self.values["Rotation"]}[path]

    def run(self, path, target):
        if self.active:
            self.values["TargetOpen"] = {"Door:OpenDoor": True, "Door:CloseDoor": False}[path]

    def op(self, name, A=None, B=None, **kwargs):
        if name == "NotEqual_IntInt":
            return A != B
        if name == "SelectFloat":
            return float(A) if kwargs["bPickA"] else B
        if name == "Conv_RotatorToQuaternion":
            return kwargs["InRot"]
        if name == "Quat_AngularDistance":
            return math.radians(abs(A - B))
        if name == "Less_DoubleDouble":
            return A < float(B)
        if name == "Not_PreBool":
            return not A
        return {"BooleanOR": lambda: A or B, "BooleanAND": lambda: A and B,
                "Add_DoubleDouble": lambda: A + B, "GreaterEqual_DoubleDouble": lambda: A >= B}[name]()


class RuleTest(unittest.TestCase):
    def setUp(self):
        self.v = dict(Gate=True, TargetOpen=False, ClosedRotation=0, OpenRotation=90, Rotation=0,
                      ChangeCount=0, LastGateChange=0, VehicleInside=False, VehicleHolds=False, VehicleRequestsOpen=False, IdleSeconds=0, AutoSeconds=25)

    def step(self, dt, visitor=False, **state):
        self.v.update(state)
        gate_step(Graph(self.v), dict(Elapsed=dt, VisitorInside=visitor), "Door")
        return self.v["TargetOpen"]

    def test_clock_and_obstruction(self):
        self.assertFalse(self.step(1, True))  # a visitor at a shut door presses the button
        self.assertTrue(self.step(30, TargetOpen=True, Rotation=45))
        self.assertTrue(self.step(24.9, Rotation=90))
        self.assertTrue(self.step(.1, True))  # rearm for another 25 s
        self.assertTrue(self.step(24.75))
        self.assertFalse(self.step(.25))
        self.assertTrue(self.step(.1, True, Rotation=85))

    def test_same_frame_reopen(self):
        self.assertTrue(self.step(24.9, TargetOpen=True, Rotation=90, ChangeCount=1))
        self.assertTrue(self.step(1, ChangeCount=3))
        self.assertFalse(self.step(24))

    def test_vehicle(self):
        self.assertTrue(self.step(.1, VehicleRequestsOpen=True))
        self.assertTrue(self.step(30, Rotation=90, VehicleRequestsOpen=False, VehicleHolds=True))
        self.assertTrue(self.step(24, VehicleHolds=False))
        self.assertFalse(self.step(1))
        self.assertTrue(self.step(.1, Rotation=80, VehicleInside=True))
        self.assertFalse(self.step(.1, TargetOpen=False, Rotation=0))  # parked in front of a fully closed door


if __name__ == "__main__":
    unittest.main()
