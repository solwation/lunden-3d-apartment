"""#2408: the GUIDs behind material-parameter-collection reads, shared by the material builders.

A CollectionParameter expression stores its parameter's GUID and looks the name up through it when it loads. A
collection rebuilt with new parameter structs (MPC_LundenWeather before #2381) leaves every material built against
the old structs with a GUID that names nothing. The expression then loads with the parameter name None, and the
material either fails to compile and renders the default grey (the river, #2408) or silently reads 0 (the foliage
wind, #2383). Two rules keep that from going unnoticed:
- `ids()` goes into a builder's spec hash or stamp, so a changed GUID rebuilds the material and `--check` fails on it;
- `unresolved()` finds expressions that already point at nothing, whatever their hash says.
The structs' Id is protected from Python; export_text carries it (as build_vegetation.py found in #2383).
"""
import re

import unreal as u


def parameter_ids(path):
    """{parameter name: GUID} of every scalar and vector parameter of the collection at `path`."""
    mpc = u.EditorAssetLibrary.load_asset(path) if u.EditorAssetLibrary.does_asset_exist(path) else None
    if mpc is None:
        raise RuntimeError(f"{path} is missing: run build_lighting.py / build_seasons.py first")
    out = {}
    for prop in ("scalar_parameters", "vector_parameters"):
        for p in mpc.get_editor_property(prop):
            g = re.search(r"Id=([0-9A-F]{32})", p.export_text())
            if g:
                out[str(p.get_editor_property("parameter_name"))] = g.group(1)
    return out


def ids(reads):
    """{collection path: {name: GUID}} for `reads` = {collection path: names the material reads}."""
    out = {}
    for path, names in sorted(reads.items()):
        have = parameter_ids(path)
        missing = sorted(set(names) - set(have))
        if missing:
            raise RuntimeError(f"{path} has no parameter(s) {missing}")
        out[path] = {n: have[n] for n in sorted(set(names))}
    return out


def unresolved(material):
    """Descriptions of the material's CollectionParameter expressions whose GUID names no parameter of their collection."""
    out = []
    if material is None:
        return out
    for e in u.MaterialEditingLibrary.get_material_expressions(material):
        if isinstance(e, u.MaterialExpressionCollectionParameter):
            coll, name = e.get_editor_property("collection"), str(e.get_editor_property("parameter_name"))
            if coll is None or name in ("", "None"):
                out.append(f"{e.get_name()} reads {'no collection' if coll is None else coll.get_path_name()} parameter {name!r}")
    return out


def clear_graph(material):
    """Delete every expression the material owns. delete_all_material_expressions can leave an orphaned collection
    expression behind (#2383), which then keeps the compile error."""
    mel = u.MaterialEditingLibrary
    mel.delete_all_material_expressions(material)
    for e in [e for e in u.ObjectIterator(u.MaterialExpression) if e.get_outer() == material]:
        mel.delete_material_expression(material, e)
