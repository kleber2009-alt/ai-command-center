#!/usr/bin/env python3
"""Assemble static pages from partials — output is plain HTML, no runtime includes.

  _source/partials/<name>.html   reusable blocks (head, header, footer, fab, dialogs...)
  _source/pages/<page>.html      pages; first line may be  <!--page nav=agents title="..." desc="..."-->

In pages:   <!--@header-->            -> contents of partials/header.html
In partials: {{title}} {{desc}} {{nav}} -> page values;  data-nav="agents" link gets class="on"

usage: build.py <site_dir>      (reads <site_dir>/_source, writes <site_dir>/*.html)
"""
import re, sys, pathlib
site = pathlib.Path(sys.argv[1]); src = site / '_source'
parts = {p.stem: p.read_text(encoding='utf-8') for p in (src / 'partials').glob('*.html')}
for page in sorted((src / 'pages').glob('*.html')):
    html = page.read_text(encoding='utf-8')
    meta = {}
    m = re.match(r'\s*<!--page(.*?)-->\n?', html, re.S)
    if m:
        meta = {k: a or b for k, a, b in re.findall(r'(\w+)=(?:"([^"]*)"|(\S+))', m.group(1))}
        html = html[m.end():]
    for _ in range(3):  # partials may include partials
        html = re.sub(r'<!--@(\w+)-->', lambda x: parts[x.group(1)], html)
    html = re.sub(r'\{\{(\w+)\}\}', lambda x: meta.get(x.group(1), ''), html)
    nav = meta.get('nav')
    if nav:
        html = html.replace(f'data-nav="{nav}"', f'data-nav="{nav}" class="on" aria-current="page"')
    (site / page.name).write_text(html, encoding='utf-8')
    print('built', page.name)
