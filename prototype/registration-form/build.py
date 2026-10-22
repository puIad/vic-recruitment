"""Inline fonts and logo into one file, so the comp opens from a phone or a message: python build.py
Writes registration-form.html (committed, Magic School falls back to Cormorant Garamond) and, when
fonts/MagicSchoolOne.ttf exists locally, registration-form.local.html with the owner's own Magic School download
inlined (all rights reserved, so git-ignored)."""
import base64, re, pathlib

here = pathlib.Path(__file__).parent
root = here.parent.parent
html = (here / "index.html").read_text(encoding="utf-8")


def data(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def font(m):
    return "url(" + data((here / m.group(1)).resolve(), "font/woff2") + ")"


html = re.sub(r"url\((\.\./\.\./frontend/src/assets/fonts/[^)]+\.woff2)\)", font, html)
logo = root / "frontend/public/brand/vic-logo-on-dark.svg"
html = html.replace('"../../frontend/public/brand/vic-logo-on-dark.svg"', '"' + data(logo, "image/svg+xml") + '"')
pub = here / "registration-form.html"
pub.write_text(html, encoding="utf-8")
print(pub, f"{pub.stat().st_size // 1024} KB, committed copy (no Magic School)")
ttf = here / "fonts/MagicSchoolOne.ttf"
if ttf.exists():
    loc = here / "registration-form.local.html"
    loc.write_text(html.replace("url(fonts/MagicSchoolOne.ttf)", "url(" + data(ttf, "font/ttf") + ")"), encoding="utf-8")
    print(loc, f"{loc.stat().st_size // 1024} KB, with Magic School (git-ignored)")
