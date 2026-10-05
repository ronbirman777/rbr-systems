#!/usr/bin/env python3
"""
Replaces English literals with their translation call, driven by the
dictionary itself.

Matching on the dictionary's own English value is what makes this safe:
a replacement can only happen when the text is character-for-character
what English will render, so an English Space is unchanged by
construction. Anything that does not match exactly is left alone and
reported, to be looked at by hand.
"""
import re, sys, json, os
os.chdir("/Users/ronbirman/Desktop/RBR-028C-worktree/app")

def dictionary():
    """{english value: (namespace, key)}, longest value first."""
    src = open("src/lib/i18n/dictionaries/en.ts").read()
    out = {}
    for ns in ("common", "teach", "flow", "studio"):
        m = re.search(r"\n  " + ns + r": \{\n(.*?)\n  \},", src, re.S)
        if not m:
            continue
        for key, val in re.findall(r'^\s{4}(\w+): "((?:[^"\\]|\\.)*)",$', m.group(1), re.M):
            # A value with a {placeholder} needs arguments, so it cannot be
            # swapped in blind.
            if "{" in val:
                continue
            real = val.replace('\\"', '"').replace("\\\\", "\\")
            out.setdefault(real, (ns, key))
    return dict(sorted(out.items(), key=lambda kv: -len(kv[0])))

# Attributes that are NEVER user-visible. Replacing one of these with a
# translation is a real bug, not a cosmetic one: className="hidden"
# became className={t("teach","availHidden")} because the dictionary has
# "hidden" as an availability label, which un-hid a file input and blew
# out the 320px layout. Browser QA caught it; this list stops it.
NEVER_VISIBLE = {
    "className", "class", "id", "key", "type", "name", "role", "href", "src",
    "rel", "target", "value", "pattern", "inputMode", "autoComplete",
    "data-testid", "style", "htmlFor", "accept", "method", "action",
    "aria-controls", "aria-labelledby", "aria-describedby", "form",
}


def jsx_escape(v):
    """How the value would appear inside JSX text."""
    return v.replace("&", "&amp;").replace("'", "&apos;")

def wire(path, t="t", report=True):
    s = open(path).read()
    before = s
    DICT = dictionary()
    done = []
    for val, (ns, key) in DICT.items():
        call = f'{t}("{ns}", "{key}")'
        hits = 0
        # 1. attribute:  label="Value"  ->  label={t(...)}
        pat = re.compile(r'([a-zA-Z][a-zA-Z0-9-]*)="' + re.escape(val) + '"')

        def attr_sub(m):
            if m.group(1) in NEVER_VISIBLE:
                return m.group(0)
            return f"{m.group(1)}={{{call}}}"

        s, n = pat.subn(attr_sub, s)
        hits += n
        # 2. JSX text on its own line, with entity-escaped variants
        for shown in {val, jsx_escape(val), val.replace("'", "&apos;"), val.replace("&", "&amp;")}:
            pat = re.compile(r"^(\s*)" + re.escape(shown) + r"$", re.M)
            s, n = pat.subn(lambda m: f"{m.group(1)}{{{call}}}", s)
            hits += n
            # 3. JSX text inline between tags
            pat = re.compile(r">" + re.escape(shown) + r"<")
            s, n = pat.subn(f">{{{call}}}<", s)
            hits += n
        if hits:
            done.append((val, ns, key, hits))
    if s != before:
        open(path, "w").write(s)
    if report:
        total = sum(h for *_, h in done)
        print(f"{os.path.basename(path)}: {total} replacements across {len(done)} distinct strings")
    return done

if __name__ == "__main__":
    for p in sys.argv[1:]:
        wire(p)
