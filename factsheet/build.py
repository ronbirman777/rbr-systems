#!/usr/bin/env python3
"""
Build the distributable outputs for the Wonderland Healing Center factsheet.

  wonderland-factsheet.html             source (local fonts/ and images/)
    -> wonderland-factsheet-standalone.html   single file, everything inlined
    -> wonderland-factsheet.pdf               2 x A4, no browser margins

Usage:  python3 build.py            # build both
        python3 build.py --html     # skip the PDF (no Chrome needed)

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
SRC = os.path.join(HERE, "wonderland-factsheet.html")
STANDALONE = os.path.join(HERE, "wonderland-factsheet-standalone.html")
PDF = os.path.join(HERE, "wonderland-factsheet.pdf")

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


def build_standalone():
    html = open(SRC, encoding="utf-8").read()
    # url('fonts/…woff2')  and  src="images/….jpg"
    html = re.sub(r"url\('(fonts/[^']+)'\)",
                  lambda m: "url('%s')" % data_uri(m.group(1)), html)
    html = re.sub(r'src="(images/[^"]+)"',
                  lambda m: 'src="%s"' % data_uri(m.group(1)), html)
    open(STANDALONE, "w", encoding="utf-8").write(html)
    print("standalone -> %s (%.1f MB)" % (STANDALONE, os.path.getsize(STANDALONE) / 1e6))


def find_chrome():
    for candidate in CHROME_CANDIDATES:
        if not candidate:
            continue
        resolved = candidate if os.path.isfile(candidate) else shutil.which(candidate)
        if resolved:
            return resolved
    return None


def build_pdf():
    chrome = find_chrome()
    if not chrome:
        print("PDF skipped: no Chrome/Chromium found (set CHROME=/path/to/chrome)")
        return False
    subprocess.run([
        chrome, "--headless", "--disable-gpu", "--no-sandbox",
        "--no-pdf-header-footer",
        "--print-to-pdf=" + PDF,
        "--virtual-time-budget=10000",
        "file://" + SRC,
    ], check=True, stderr=subprocess.DEVNULL)
    print("pdf        -> %s (%.1f MB)" % (PDF, os.path.getsize(PDF) / 1e6))
    return True


if __name__ == "__main__":
    build_standalone()
    if "--html" not in sys.argv:
        build_pdf()
