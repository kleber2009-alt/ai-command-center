#!/usr/bin/env python3
"""Import the "content plan" page (index.html + hooks.json + ready.json) into content.json.

Every tab of the page becomes a sub-tab of the dashboard's «Контент» tab. Static text is sanitized to a
small tag/class whitelist (no scripts, styles or event handlers); interactive blocks (hook base, ready
carousels/reels, lead magnets, VSL scripts, calculator, top tables) become slots the dashboard renders.

Usage:
  python3 import_content_plan.py <dir with index.html, hooks.json, ready.json> <content.json> <out.json>
"""
import sys, json, re, html
from html.parser import HTMLParser
src_dir, base_json, out = sys.argv[1], sys.argv[2], sys.argv[3]
page = open(f"{src_dir}/index.html", encoding="utf-8").read()
TAGS = {"div","p","b","strong","i","em","s","ul","ol","li","table","thead","tbody","tr","th","td","h2","h3","span","a","br","code"}
CLASSES = {"tbl","card","callout","muted","note","mono","num","mech","pill","r","k","flag","grid2","refs","kpis","kpi","eyebrow","big","rank","hook","proof","calc"}
DROP_CLASS = {"filters","editbar"}
SLOTS = {"actlist","arch","toptbl","acctbl","plantbl","own9","scripts","ready6","ready7","ready10","calc"}
VOID = {"br"}

class San(HTMLParser):
    def __init__(s): super().__init__(convert_charrefs=True); s.out=[]; s.stack=[]; s.skip=0
    def handle_starttag(s, tag, attrs):
        a = dict(attrs)
        cls = set((a.get("class") or "").split())
        if s.skip:
            if tag not in VOID: s.skip += 1
            return
        sid = a.get("id") or ""
        if tag in ("button","input","select","label","script","style","nav") or cls & DROP_CLASS or sid.startswith("roNote") or a.get("hidden") is not None and tag=="p":
            if tag not in VOID and tag != "input": s.skip = 1
            return
        if sid in SLOTS or (tag=="table" and "calc" in cls):
            s.out.append(f'<div data-slot="{"calc" if "calc" in cls else sid}"></div>'); s.skip = 1; return
        if tag not in TAGS:
            s.stack.append(None); return
        keep = " ".join(c for c in (a.get("class") or "").split() if c in CLASSES)
        at = f' class="{keep}"' if keep else ""
        if tag == "a":
            href = a.get("href") or ""
            if re.match(r"https://", href): at += f' href="{html.escape(href)}" target="_blank" rel="noopener"'
        s.out.append(f"<{tag}{at}>")
        if tag not in VOID: s.stack.append(tag)
    def handle_endtag(s, tag):
        if s.skip:
            s.skip -= 1; return
        if tag in VOID or not s.stack: return
        t = s.stack.pop()
        if t: s.out.append(f"</{t}>")
    def handle_data(s, d):
        if not s.skip: s.out.append(html.escape(d, quote=False))

def clean(fragment):
    p = San(); p.feed(fragment); p.close()
    h = "".join(p.out)
    return re.sub(r"\n\s*\n+", "\n", h).strip()

def section(sid):
    m = re.search(rf'<section id="{sid}"[^>]*>(.*?)</section>', page, re.S)
    return clean(m.group(1))

nav = re.findall(r'<button role="tab"[^>]*data-tab="(t\d+)"[^>]*>(.*?)</button>', page)
tabs = [{"id": t, "title": html.unescape(re.sub("<[^>]+>", "", label)).strip(), "html": section(t)} for t, label in nav]
head = re.search(r"<header>(.*?)</header>\s*(<div class=\"kpis\">.*?</div>\s*</div>)", page, re.S)
intro = clean(head.group(1) + head.group(2))
d = json.load(open(base_json, encoding="utf-8"))
d["artifact"] = {"intro": intro, "tabs": tabs,
                 "hooks": json.load(open(f"{src_dir}/hooks.json", encoding="utf-8")),
                 "ready": json.load(open(f"{src_dir}/ready.json", encoding="utf-8")),
                 "top": re.findall(r"'([a-z0-9_]+)'", re.search(r"const TOP = \[(.*?)\]", page, re.S).group(1)),
                 "url": (sys.argv[4] if len(sys.argv) > 4 else "")}
json.dump(d, open(out, "w", encoding="utf-8"), ensure_ascii=False)
for t in tabs: print(t["id"], t["title"], len(t["html"]), re.findall(r'data-slot="(\w+)"', t["html"]))
print("intro", len(intro), "hooks", len(d["artifact"]["hooks"]), "top", len(d["artifact"]["top"]))
