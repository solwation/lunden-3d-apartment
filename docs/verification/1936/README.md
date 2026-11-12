# Historical image link repair — #1936

On baseline `f3f5ae145854bd40ecfe5e3ecd8cdb814142e5a0`, the unchanged full
Markdown checker exits **1**: **479 broken links** in **297 tracked Markdown
files**. There are 101 affected historical records and 468 unique missing image
paths (PNG/JPG). The issue's older 287-file reproduction has the same 479 broken
links; more Markdown records have since been added.

All 468 exact image paths exist in repository history. Their last path change is
`7ae586f53bfcc279e61eb80600544685dbb9a1e0`, the #1879 image-retention removal.
Its parent `2eaf0273ce3228c8322a17a14f72869abea00b42` is the final preceding
revision containing every image. Each mapped `revision:path` resolves to a real,
nonempty Git blob in this checkout's history. No guessed filename substitution
or missing-history explanation was necessary.

The repair replaces only the 479 broken Markdown image destinations with exact
`https://raw.githubusercontent.com/solwation/lunden-3d-apartment/<40-character-SHA>/<path>`
URLs. Captions, alt text, historical measurements and other record contents are
unchanged. The retention guide's factual explanation now describes these pinned
citations. No expired PNG/JPG is restored, no history rewritten and no checker
rule disabled. The 468 historical blobs total 165,702,059 bytes and remain out of
the working tree.

## Evidence group 1: actual historical files and remote links

[Every original occurrence](broken-occurrences.json) records Markdown file, line,
old destination and normalized image path. [Exact image mapping](image-mapping.json)
records all 468 paths, last-change commit, containing revision, blob OID, byte count
and pinned raw URL. The lookup used these actual Git operations per unique path:

```sh
git log -1 --format=%H HEAD -- docs/validation/issue-1042/before-badrum-set.png
git show -s --format=%P 7ae586f53bfcc279e61eb80600544685dbb9a1e0
git rev-parse --verify 2eaf0273ce3228c8322a17a14f72869abea00b42:docs/validation/issue-1042/before-badrum-set.png
git cat-file -t 2eaf0273ce3228c8322a17a14f72869abea00b42:docs/validation/issue-1042/before-badrum-set.png
git cat-file -s 2eaf0273ce3228c8322a17a14f72869abea00b42:docs/validation/issue-1042/before-badrum-set.png
```

[Actual HTTP HEAD receipts](http-head.json): **101 unique sampled URLs return
HTTP200 with image content types**, one first broken image per affected document,
deduplicated, including PNG and JPEG. All 468 paths have native Git verification;
367 URLs were not separately requested over HTTP. HEAD availability does not
revalidate an old screenshot's visual findings or timing claims. No old image was
recaptured and no browser was launched.

## Evidence group 2: full checker, exact mapping and diff scope

The actual existing checker is `.orchestra/shared/scripts/check-links.py`;
`tools/check-links.py` mentioned in the assignment does not exist. The checker
and its full tracked-file scope are unchanged. It skips external links by design,
so the separate native historical-blob and representative HTTP checks above are
required evidence, not a claim that the checker inspected those URLs.

```sh
python3 .orchestra/shared/scripts/check-links.py
```

[Before full CLI output](before.log): exit1, 479 broken links /297 Markdown files.
[After full CLI output](after.log): exit0, 1,918 relative links /298 Markdown files;
includes this newly staged README.
[Exact comparison receipt](verification.json) records totals, checker hash and
scope checks. Each changed historical record was rebuilt in memory from its
baseline text using only its recorded image URL replacements and compared byte
for byte to the candidate. The only other pre-existing Markdown edit is the
retention explanation above. `git diff --check` passes. No current #1927/#1928/
#1930 evidence, product source, tools, images or changelog is changed.

This original repository's historical evidence is not a public downstream feature;
there is no public transfer or issue. Docs-only verification has no meaningful new
result image, product changelog, browser or deployment requirement for this worker.
Root owns integration, any actually triggered CI/publication gates and closure.

Root reviewed the retention explanation and representative old records, then reconstructed all479replacements across101documents exactly from the saved occurrences/mapping. Every captured worker evidence file remains exact; current main/cache evidence is preserved. [Integration receipt](integration.json). The unchanged full checker is run once on integrated tracked HEAD below because newer main adds documentation.

[Publication record](https://github.com/solwation/lunden-3d-apartment/issues/1936#issuecomment-6822142121) for `9ee704c2c12d36a0b0ec2c89cbd6c473c0bdd6cf`. Integrated unchanged full checker: exit0,1924relative links in299MD. Inga workflows triggades för denna docs-only revision; Pages/Worker paths har granskats och ingen produktdeploy påstås.
