"""
Builds a faithful model of the REAL Guest tab switch, per product and
per locale.

Both Guest Apps are one client bundle whose bottom nav is a React
`useState` switch, not a navigation: pressing a tab unmounts one screen's
subtree and mounts another's. Measuring that with `page.goto` between
separate documents would re-parse the HTML and re-discover every image,
overstating what a tab press costs.

So: one document per product/locale, the first screen server-rendered
exactly as the route delivers it, and the rest held as inert templates
that a switch swaps into the live container - which is what React does.
"""
import re, pathlib, sys, json

SITE = pathlib.Path(sys.argv[1])
LOCALES = ["en", "he", "de"]

# Which documents make up each product's tab set, in bottom-nav order.
PRODUCTS = {
    "teach": ["teach-home", "teach-schedule?", "teach-about", "teach-explore"],
    "flow": ["flow", "flow-team", "flow-explore"],
}


def body(path: pathlib.Path) -> str:
    s = path.read_text()
    return s[s.index(">", s.index("<body")) + 1 : s.index("</body>")]


def root_attrs(path: pathlib.Path) -> tuple[str, str]:
    """
    The locale and direction as the REAL app expresses them.

    Deliberately read off the Guest App's own root element, not <html>:
    app/layout.tsx serves every route as `<html lang="en">` with no dir,
    and each Guest surface sets lang/dir on the element it owns. The
    harness reproduces that exactly rather than "fixing" it, so the QA
    matrix sees the direction cascade production actually has.
    """
    s = path.read_text()
    # Teach puts them on a <div>, Flow on the route's <main>, and React
    # emits attributes in prop order - so match the pair on any element,
    # in either order, rather than one hard-coded shape.
    m = re.search(r'<(?:div|main)\b[^>]*?\blang="([a-z-]+)"[^>]*?\bdir="(ltr|rtl)"', s) or re.search(
        r'<(?:div|main)\b[^>]*?\bdir="(ltr|rtl)"[^>]*?\blang="([a-z-]+)"', s
    )
    if not m:
        return ("en", "ltr")
    a, b = m.group(1), m.group(2)
    return (a, b) if b in ("ltr", "rtl") else (b, a)


# An extra image-heavy panel, to stress the case CP4 is actually about.
# Built in the same shape BrandImage emits, so the browser runs the same
# candidate selection it does in the app.
LADDER = [96, 160, 320, 480, 640, 960, 1280, 1600]
T = "11111111-1111-4111-8111-111111111111"


def card(i: int) -> str:
    base = f"/api/media/{T}/teach/heavy{i}/up-heavy{i}/published.card-{(i % 4) + 1}.png"
    srcset = ", ".join(f"{base}?w={w} {w}w" for w in LADDER)
    sizes = "(min-width: 640px) 300px, 45vw"
    return (
        f'<div style="width:45%;margin:6px">'
        f'<img src="{base}" srcset="{srcset}" sizes="{sizes}" alt="" loading="lazy" '
        f'decoding="async" class="object-cover" style="width:100%;height:120px"/></div>'
    )


HEAVY = (
    '<main style="padding:12px"><h2 style="font:600 20px system-ui;margin:8px 0">Heavy</h2>'
    '<div style="display:flex;flex-wrap:wrap">'
    + "".join(card(i) for i in range(1, 8))
    + "</div></main>"
)

built = []
for product, names in PRODUCTS.items():
    for locale in LOCALES:
        suffix = "" if locale == "en" else f".{locale}"
        panels: dict[str, str] = {}
        first = None
        for name in names:
            if name.endswith("?"):
                continue  # optional screen this fixture does not render
            f = SITE / f"{name}{suffix}.html"
            if not f.exists():
                continue
            key = name.replace(f"{product}-", "").replace(product, "home")
            panels[key] = body(f)
            if first is None:
                first = (key, f)
        if not first:
            continue
        panels["heavy"] = HEAVY
        lang, direction = root_attrs(first[1])

        # <html lang="en"> with no dir, exactly as app/layout.tsx emits it.
        doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>{product} tabs {locale}</title>
<meta name="x-guest-dir" content="{direction}"><meta name="x-guest-lang" content="{lang}">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/app.css">
<style>#qa-tabbar{{position:fixed;inset-inline:0;top:0;display:flex;z-index:99;opacity:0;pointer-events:auto;height:1px}}
#qa-tabbar button{{flex:1;height:1px;font-size:1px}}</style>
</head><body>
<!-- The first screen is in the server HTML, as the real route delivers
     it, so the preload scanner sees the hero and `priority` means
     something. The switcher is 1px and transparent: the real app's own
     bottom nav is what the QA matrix measures, and a second visible nav
     would sit over it. -->
<div id="screen">{panels[first[0]]}</div>
<nav id="qa-tabbar" aria-label="harness switcher">
{"".join(f'<button data-tab="{k}">{k}</button>' for k in panels)}
</nav>
<script id="panels" type="application/json">{json.dumps(panels)}</script>
<script>
  // React's own behaviour, modelled: the outgoing screen's subtree is
  // discarded and the incoming one created fresh, so its images are
  // newly-inserted <img> elements with no prior request behind them.
  const PANELS = JSON.parse(document.getElementById('panels').textContent);
  const screen = document.getElementById('screen');
  window.__tabs = Object.keys(PANELS);
  window.__show = function show(k) {{ screen.innerHTML = PANELS[k]; window.scrollTo(0, 0); window.__tab = k; }};
  document.getElementById('qa-tabbar').addEventListener('click', (e) => {{
    const b = e.target.closest('button[data-tab]');
    if (b) window.__show(b.dataset.tab);
  }});
  window.__tab = {json.dumps(first[0])};  // already server-rendered; do not re-mount
</script>
</body></html>"""
        out = SITE / f"tabs-{product}{suffix}.html"
        out.write_text(doc)
        built.append((out.name, lang, direction, list(panels)))

for name, lang, direction, keys in built:
    print(f"{name:26s} lang={lang:3s} dir={direction:4s} panels={keys}")
