#!/usr/bin/env python3
"""
CP3B user-visible-string audit.

Finds every candidate user-visible English literal in the four localized
surfaces, so the A/B/C/D classification is done against evidence rather
than against whatever a JSX-text regex happened to catch.

Three literal shapes are collected, because CP3B's first extraction
missed the last two and undercounted:
  1. JSX text nodes                     <p>How to register</p>
  2. string-valued attributes           placeholder="e.g. Maya Cohen"
  3. quoted/template strings in code    label: "Price",  `Max ${n}`
"""
import json, os, re, sys, collections

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "app", "src")

SURFACES = {
    # Shared Studio infrastructure is listed under BOTH Studios on
    # purpose. lib/studio/status.ts is exactly how a gap happens: it is
    # not under a product folder, so a surface-rooted scan missed it, and
    # it kept returning English labels into an otherwise fully
    # translated Hebrew and German Studio until browser QA caught it.
    "teachStudio": ["app/configurator/teach/", "lib/studio/", "components/studio/", "lib/teach/style.ts", "lib/teach/schedule.ts", "lib/teach/recurrenceText.ts"],
    "flowStudio":  ["app/configurator/retreat/", "lib/studio/", "components/studio/", "lib/modules/", "lib/spaceTypes/"],
    "teachGuest":  ["components/teach/", "app/t/", "lib/teach/links.ts", "lib/teach/guestData.ts"],
    # Flow's Guest screens sit directly under components/, not in a
    # product folder - missing them is what undercounted CP3B's first pass.
    "flowGuest":   ["components/guest/", "app/s/", "app/g/",
                    "components/guest-app.tsx", "components/back-to-home-link.tsx",
                    "components/today-screen.tsx", "components/schedule-screen.tsx",
                    "components/arrival-screen.tsx", "components/meals-screen.tsx",
                    "components/treatments-screen.tsx", "components/facilities-screen.tsx",
                    "components/facilitators-screen.tsx", "components/faq-screen.tsx",
                    "components/stay-connected-screen.tsx", "components/custom-page-screen.tsx",
                    "components/shared/", "components/brand/", "lib/content/"],
}
SKIP = ("i18n/", ".test.", "__tests__", "/icons", "-icons.tsx")

# A literal is a translation candidate only if it reads like prose a
# person would see: at least one letter, and not obviously an
# identifier, path, class list, or style token.
IDENTIFIERish = re.compile(r"^[a-z]+([A-Z][a-zA-Z0-9]*)+$")        # camelCase
CONSTish      = re.compile(r"^[A-Z0-9_]+$")                        # SCREAMING
TOKENish      = re.compile(r"^[a-z0-9-]+$")                        # kebab / css
HASNUMWORD    = re.compile(r"[A-Za-z]{2}")
CSSish        = re.compile(r"(^|\s)(flex|grid|absolute|relative|rounded|text-|bg-|px-|py-|mt-|mb-|ms-|me-|gap-|w-|h-|min-|max-|border|shadow|hidden|block|inline|sm:|md:|lg:|xl:)")
URLish        = re.compile(r"^(https?:|/|\.|#|data:|mailto:|tel:|var\(|--)")
UNITish       = re.compile(r"^[\d\s.,%/px rem em vh vw-]+$")

def is_candidate(s: str) -> bool:
    t = s.strip()
    if len(t) < 2 or not HASNUMWORD.search(t): return False
    if IDENTIFIERish.match(t) or CONSTish.match(t): return False
    if TOKENish.match(t) and " " not in t: return False
    if CSSish.search(t) or URLish.match(t) or UNITish.match(t): return False
    return True

# Attributes whose value is shown to a person (visually or to a screen reader).
VISIBLE_ATTRS = {
    "placeholder","title","alt","label","aria-label","aria-description",
    "aria-placeholder","aria-valuetext","aria-roledescription","backLabel",
    "ctaLabel","buttonLabel","heading","subtitle","summary","caption","hint",
    "emptyLabel","actionLabel","confirmLabel","cancelLabel","tooltip",
}
# Object-literal keys whose string value is shown to a person.
VISIBLE_KEYS = {
    "label","title","value","heading","subtitle","name","text","caption",
    "placeholder","help","helper","description","hint","message","error",
    "empty","emptyTitle","emptyBody","eyebrow","cta","ctaLabel","buttonLabel",
    "unit","suffix","prefix","aria","ariaLabel","tab","legend","summary",
}

def files():
    for surface, roots in SURFACES.items():
        for r in roots:
            p = os.path.join(ROOT, r)
            if os.path.isfile(p):
                yield surface, p; continue
            for dirpath, _, names in os.walk(p):
                for n in names:
                    if not n.endswith((".tsx", ".ts")): continue
                    f = os.path.join(dirpath, n)
                    if any(s in f for s in SKIP): continue
                    yield surface, f

def scan(path):
    src = open(path).read()
    out = []  # (kind, string, line)
    def line_of(i): return src.count("\n", 0, i) + 1

    # 1. JSX text nodes: between > and < with no braces/tags inside.
    for m in re.finditer(r">([^<>{}\n]{2,200})<", src):
        out.append(("jsx-text", m.group(1), line_of(m.start())))
    # multi-line JSX text
    for m in re.finditer(r">\s*\n\s*([A-Z][^<>{}]{1,200}?)\s*\n\s*<", src):
        out.append(("jsx-text", " ".join(m.group(1).split()), line_of(m.start())))

    # 2. Visible attributes with a literal value.
    for m in re.finditer(r'([a-zA-Z-]+)\s*=\s*"([^"\n]{2,300})"', src):
        if m.group(1) in VISIBLE_ATTRS:
            out.append((f"attr:{m.group(1)}", m.group(2), line_of(m.start())))
    for m in re.finditer(r"([a-zA-Z-]+)\s*=\s*\{\s*[\"'`]([^\"'`\n]{2,300})[\"'`]\s*\}", src):
        if m.group(1) in VISIBLE_ATTRS:
            out.append((f"attr:{m.group(1)}", m.group(2), line_of(m.start())))

    # 3. Object-literal / variable string values on visible keys.
    for m in re.finditer(r"\b([a-zA-Z]+)\s*:\s*\"([^\"\n]{2,300})\"", src):
        if m.group(1) in VISIBLE_KEYS:
            out.append((f"key:{m.group(1)}", m.group(2), line_of(m.start())))

    # 4. Template literals containing prose (catches `Max ${n}` / ` · until `).
    for m in re.finditer(r"`([^`]{2,300})`", src, re.S):
        body = m.group(1)
        if "\n" in body: continue
        words = re.sub(r"\$\{[^}]*\}", "\x00", body)
        if re.search(r"[A-Za-z]{3}", words) and not CSSish.search(words) and not URLish.match(words.strip()):
            out.append(("template", body, line_of(m.start())))

    # 5. Bare double-quoted prose anywhere (last net; noisy, reviewed by hand).
    for m in re.finditer(r"\"([A-Z][^\"\n]{3,200})\"", src):
        out.append(("quoted", m.group(1), line_of(m.start())))
    return out

def main():
    found = collections.defaultdict(lambda: collections.defaultdict(list))
    for surface, path in files():
        rel = os.path.relpath(path, ROOT)
        for kind, s, ln in scan(path):
            if not is_candidate(s): continue
            key = s.strip()
            found[surface][key].append(f"{rel}:{ln}:{kind}")
    total = 0
    for surface in SURFACES:
        n = len(found[surface]); total += n
        print(f"{surface:12s} {n:4d} unique candidate literals", file=sys.stderr)
    print(f"{'TOTAL':12s} {total:4d}", file=sys.stderr)
    json.dump({s: dict(v) for s, v in found.items()}, open(os.path.join(os.path.dirname(__file__), "i18n-audit.json"), "w"), indent=1, ensure_ascii=False)

main()
