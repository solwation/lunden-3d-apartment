"""Season metadata shared by imported furniture and its separately built point light."""


def season_tags(extras, ex):
    """Use the nearest seasonal ancestor. Encode each date as month * 100 + day for BPC_LundenSeasons."""
    for _ in range(64):  # the parent chain is short; the bound only guards against a malformed export
        if ex is None or "seasonal" in ex:
            break
        ex = extras.get(ex.get("parent")) if ex.get("parent") else None
    if not ex or "seasonal" not in ex:
        return []
    s = ex["seasonal"]
    tags = ["seasonal", f"season:{s['what']}", f"seasonFrom:{s['from'][0] * 100 + s['from'][1]}",
            f"seasonTo:{s['to'][0] * 100 + s['to'][1]}"]
    if s.get("hours"):  # #2406: also only from clock hour [0] until [1] on the window's days (the patio beers)
        tags += [f"seasonHourFrom:{s['hours'][0]}", f"seasonHourTo:{s['hours'][1]}"]
    return tags
