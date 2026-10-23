# README diagram verification

These browser captures render the two Mermaid blocks from [README.md](../../README.md)
as delivered in v0.1.2 (the README now keeps only the first), using Mermaid 11.17.2 and headless Chromium on
2026-10-23. They are verification artifacts; the editable source of the
remaining diagram is in README.

- [Desktop preview, 960 px](readme-diagrams-desktop.png)
- [Narrow preview, 375 px](readme-diagrams-narrow.png)

All 17 node labels were checked against their containing shapes, and both captures
were visually inspected. Explicit line breaks and SVG text labels avoid clipped HTML
label containers. Narrow layouts scale the whole diagram; zoom may still be needed
for small text.

These are local browser previews. GitHub's embedded Mermaid frames did not complete
loading in the verification browser, so its exact renderer/version is not verified.
No application dependencies or screenshot tooling were added to the repository.
