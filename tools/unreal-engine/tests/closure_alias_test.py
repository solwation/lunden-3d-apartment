#!/usr/bin/env python3
"""#2401: no editor Python file may keep a bound Unreal method in its module globals. Runs without Unreal:

    python3 tools/unreal-engine/tests/closure_alias_test.py

UE 5.8's PythonScriptPlugin returns `u.SomeClass.some_function` (and every method of a wrapped object) as a
`builtin_function_or_method_with_closure`. That type inherits `PyCFunction_Type`'s weak-reference offset (40 bytes) but
is only 40 bytes long, so the offset points past the end of the object (PyMethodWithClosure.cpp, "This is a hack so
that the doc gen code will think this is a built-in function"). Reference counting frees such an object safely. When
Python's cycle collector frees it instead, `handle_weakrefs` reads the bytes after the object as a weak-reference
list and the editor dies with EXCEPTION_ACCESS_VIOLATION in python311.dll, depending on what those bytes hold.

The PythonAutomationTest plugin runs every test_*.py in its own copy of the globals dict. The test's functions point
back at that dict, so after the test the dict is cyclic garbage. Any bound method stored in it is collected by the
cycle collector at the next garbage collection, typically when the next test loads a map: test_audio's
`load = u.EditorAssetLibrary.load_asset` crashed test_window_audio that way. Wrap such a method in a `def` instead.

The check flags module-level assignments whose value is `<unreal module>.<Class>.<snake_case name>`, not a call.
Enum members (UPPER_CASE) and calls are fine. A module-level alias of a wrapped object's method
(`f = actor.some_method`) cannot be told from a property here: do not write one either.
"""
import ast
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCES = [ROOT / "tools/unreal-engine/tests", ROOT / "tools/unreal-engine/python", ROOT / "unreal/Lunden/Content/Python"]


def unreal_names(tree):
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names |= {a.asname or a.name for a in node.names if a.name == "unreal"}
    return names


def module_level(body):
    """Statements outside any def/class, also inside module-level if/try/with/for blocks."""
    for node in body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        yield node
        for field in ("body", "orelse", "finalbody", "handlers"):
            yield from module_level(getattr(node, field, []) or [])


def bound_method_aliases(source, filename="<source>"):
    tree = ast.parse(source, filename)
    roots = unreal_names(tree)
    found = []
    for node in module_level(tree.body):
        value = node.value if isinstance(node, (ast.Assign, ast.AnnAssign)) else None
        if not isinstance(value, ast.Attribute) or not value.attr[:1].islower():
            continue
        owner = value.value
        if isinstance(owner, ast.Attribute) and isinstance(owner.value, ast.Name) and owner.value.id in roots \
                and owner.attr[:1].isupper():
            found.append((node.lineno, ast.unparse(value)))
    return found


class ClosureAliasTest(unittest.TestCase):
    def test_detects_alias(self):
        src = "import unreal as u\nload = u.EditorAssetLibrary.load_asset\nif True:\n    x = u.A.b\n"
        self.assertEqual(bound_method_aliases(src), [(2, "u.EditorAssetLibrary.load_asset"), (4, "u.A.b")])

    def test_allows_calls_enums_and_locals(self):
        src = ("import unreal\nK = unreal.AttachmentRule.KEEP_WORLD\nlog = unreal.log\n"
               "a = unreal.EditorAssetLibrary.load_asset('/Game/X')\n"
               "def f():\n    load = unreal.EditorAssetLibrary.load_asset\n    return load\n")
        self.assertEqual(bound_method_aliases(src), [])

    def test_editor_python_files(self):
        bad = []
        for folder in SOURCES:
            for path in sorted(folder.glob("*.py")) if folder.is_dir() else []:
                for line, text in bound_method_aliases(path.read_text(encoding="utf-8"), str(path)):
                    bad.append(f"{path.relative_to(ROOT)}:{line}: {text}")
        self.assertEqual(bad, [], "module-level bound Unreal methods (wrap them in a def, #2401)")


if __name__ == "__main__":
    sys.exit(unittest.main())
