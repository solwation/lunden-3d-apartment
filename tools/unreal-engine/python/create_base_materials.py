"""Lunden (#2245, #2282): kept entry point for the hand-made materials; the builder is build_materials.py.

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/create_base_materials.py [--force]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_materials  # noqa: E402

build_materials.main(sys.argv[1:])
