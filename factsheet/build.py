#!/usr/bin/env python3
"""
Build the distributable outputs for the Wonderland Healing Center factsheet.

Each variant's source HTML references factsheet.css, fonts/ and images/ locally:

  wonderland-factsheet.html         pool hero
  wonderland-factsheet-shala.html   shala-interior hero

and produces, alongside itself,

  <name>-standalone.html            single file, CSS + fonts + photos inlined
  <name>.pdf                        2 x A4, no browser margins

Usage:  python3 build.py                    # every variant
        python3 build.py --html             # skip the PDFs (no Chrome needed)
        python3 build.py wonderland-factsheet-shala.html    # just one

The PDF step needs a Chrome/Chromium binary; set CHROME to override the path.
"""
import base64
import mimetypes
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VARIANTS = ["wonderland-factsheet.html", "wonderland-factsheet-shala.html"]

CHROME_CANDIDATES = [
    os.environ.get("CHROME"),
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "google-chrome",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def data_uri(relpath):
    path = os.path.join(HERE, relpath)
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    if relpath.endswith(".woff2"):
        mime = "font/woff2"
    with open(path, "rb") as fh:
        return "data:%s;base64,%s" % (mime, base64.b64encode(fh.read()).decode())


def build_standalone(src, out):
    html = open(src, encoding="utf-8").read()
    # Fold the shared stylesheet in, then the fonts it names and the photographs.
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
                  lambda m: "<style>\n%s</style>" % open(
                      os.path.join(HERE, m.group(1)), encoding="utf-8").read(), html)
    html = re.sub(r"url\('(fonts/[^']+)'\)",
                  lambda m: "url('%s')" % data_uri(m.group(1)), html)
    html = re.sub(r'src="(images/[^"]+)"',
                  lambda m: 'src="%s"' % data_uri(m.group(1)), html)
    open(out, "w", encoding="utf-8").write(html)
    print("  standalone -> %s (%.1f MB)" % (os.path.basename(out), os.path.getsize(out) / 1e6))


def find_chrome():
    for candidate in CHROME_CANDIDATES:
        if not candidate:
            continue
        resolved = candidate if os.path.isfile(candidate) else shutil.which(candidate)
        if resolved:
            return resolved
    return None


def build_pdf(src, out, chrome):
    subprocess.run([
        chrome, "--headless", "--disable-gpu", "--no-sandbox",
        "--no-pdf-header-footer",
        "--print-to-pdf=" + out,
        "--virtual-time-budget=10000",
        "file://" + src,
    ], check=True, stderr=subprocess.DEVNULL)
    print("  pdf        -> %s (%.1f MB)" % (os.path.basename(out), os.path.getsize(out) / 1e6))


if __name__ == "__main__":
    named = [a for a in sys.argv[1:] if not a.startswith("-")]
    variants = named or VARIANTS

    chrome = None
    if "--html" not in sys.argv:
        chrome = find_chrome()
        if not chrome:
            print("PDFs skipped: no Chrome/Chromium found (set CHROME=/path/to/chrome)")

    for name in variants:
        stem = os.path.join(HERE, name[:-len(".html")])
        src = os.path.join(HERE, name)
        print(name)
        build_standalone(src, stem + "-standalone.html")
        if chrome:
            build_pdf(src, stem + ".pdf", chrome)
