"""Read the room disclosure and Windows notes from the web's static privacy dialog (#2375)."""
from html.parser import HTMLParser


class PrivacyText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.section = None
        self.block = None
        self.text = []
        self.rows = []
        self.groups = []

    def handle_starttag(self, tag, attrs):
        audience = dict(attrs).get("data-privacy")
        if (tag, audience) in (("section", "shared"), ("template", "windows")):
            self.section = tag
            self.groups.append(audience)
        elif self.section and tag in ("h2", "p", "li"):
            self.block, self.text = tag, []

    def handle_data(self, data):
        if self.block:
            self.text.append(data)

    def handle_endtag(self, tag):
        if self.block == tag:
            self.rows.append((tag, " ".join("".join(self.text).split())))
            self.block = None
        if self.section == tag:
            self.section = None


def windows_privacy(html):
    reader = PrivacyText()
    reader.feed(html)
    reader.close()
    if reader.groups != ["shared", "windows"] or not reader.rows or any(not words for _, words in reader.rows):
        raise ValueError("index.html must contain the shared room disclosure and the Windows privacy text")
    return reader.rows
