"""Сборка Академии «Свой ИИ-офис» поверх 3D-офиса hq.

    python3 build.py [--artifact PATH]

Пишет:
  ../academy.html     — страница для сайта: hq.aicex.club/academy (деплой вместе с hq)
  dist/artifact.html  — та же страница в формате артефакта claude.ai (или в PATH)
  dist/test.html      — копия для локальных тестов через file://
"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent
src = root / 'src'
hq = root.parent
read = lambda p: p.read_text(encoding='utf8')
html = read(hq / 'index.html')

def rep(old, new, count=1):
    global html
    assert html.count(old) == count, (old[:70], html.count(old))
    html = html.replace(old, new)

# 1. artifact skeleton: no doctype/html/head/body of our own
rep('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<title>AI Office</title>\n',
    '<title>Академия AICEX</title>\n')
rep('</head>\n<body>\n', '')
rep('</script>\n</body>\n', '</script>\n')
html = html.replace('</html>', '')
# 2. academy styles
rep('</style>\n<script type="importmap">', read(src / 'academy.css') + '</style>\n<script type="importmap">')
# 3. config + catalogue inline, academy markup and app before the office module
academy_cfg = '''<script>
// офис ученика: свои названия и руководители, без фото и моделей команды AICEX
(function () {
  var C = window.OFFICE_CONFIG; if (!C) return;
  var st = null; try { st = JSON.parse(localStorage.getItem('academy:v2') || 'null'); } catch (e) {}
  var me = (st && st.profile && st.profile.name) || 'Ты';
  C.brand = (st && st.profile && st.profile.project) || 'Мой ИИ-офис';
  var names = { ceo: 'Стратегия и продукт', marketing: 'Маркетинг', sales: 'Продажи', traffic: 'Реклама' };
  C.depts.forEach(function (d) { d.name = names[d.id] || d.name; d.head = { id: d.head.id, name: (st && st.heads && st.heads[d.id]) || me, title: 'Руководитель отдела', look: d.head.look }; });
  C.agents = {};
})();
</script>'''
rep('<script src="office.config.js?v=3"></script>', '<script>\n' + read(hq / 'office.config.js') + '\n</script>\n' + academy_cfg)
html = re.sub(r"<script>\n  // предпросмотр из мастера настройки.*?</script>\n", '', html, count=1, flags=re.S)
rep('<script src="dept-content.js?v=3"></script>', '<script>\n' + read(hq / 'dept-content.js') + '\n</script>')
rep('<script src="agent-content.js?v=3"></script>', '<script>\n' + read(hq / 'agent-content.js') + '\n</script>')
markup = '''<div class="ahud glass" id="aHud"></div>
<aside class="apanel glass" id="aPanel" hidden></aside>
<button class="showpanel glass" id="aShow" data-act="panel-on" hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>Трек</button>
<div class="banner glass" id="aBanner" hidden></div>
<div class="atoasts" id="aToasts" role="status"></div>
<div class="amodal" id="aModal" hidden></div>
'''
app = '\n'.join(read(src / n) for n in ['acad-1-core.js', 'acad-2-ui.js', 'acad-3-modals.js', 'acad-4-boot.js'])
scripts = ''.join('<script>\n' + read(src / n) + '\n</script>\n' for n in ['content-a.js', 'content-b.js', 'academy-data.js'])
scripts += '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>\n'
scripts += "<script>\n(function () {\n'use strict';\n" + app + "\n})();\n</script>\n"
rep('<script src="track.js?v=1"></script>\n', markup + scripts)
# 4. office module: academy 3D layer instead of the game block
start = html.index('/* ================= ИГРА: ТРЕК')
end = html.index('/* ================= СТАРТ И ЦИКЛ')
html = html[:start] + read(src / 'office-academy.js') + '\n' + html[end:]
rep("  if (document.body.classList.contains('game') && !portrait()) camera.setViewOffset(innerWidth, innerHeight, -190, 0, innerWidth, innerHeight);\n  else camera.clearViewOffset();",
    "  const panel = document.body.classList.contains('academy') && !document.body.classList.contains('panel-off');\n"
    "  if (panel && innerWidth > 820) camera.setViewOffset(innerWidth, innerHeight, -(Math.min(440, innerWidth * 0.4) + 32) / 2, 0, innerWidth, innerHeight);\n"
    "  else if (panel) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.19, innerWidth, innerHeight);\n"
    "  else camera.clearViewOffset();")
rep("document.body.classList.contains('game') && !portrait() ? 1.2 : 1", "document.body.classList.contains('academy') && !portrait() ? 1.45 : 1")
gs = html.index('  if (GAME) {\n    // проводник ждёт')
ge = html.index('\n  }\n}\n', gs) + len('\n  }\n')
html = html[:gs] + '''  if (ACA) {
    window.OFFICE = { sync:academySync, hire:academyHire, unlock:academyUnlock, focusStep:academyFocusStep, toPlan:() => toPlan(), enter:id => enter(id), resize:onResize };
    academySync(); onResize();
    dispatchEvent(new Event('office:ready'));
  }
''' + html[ge:]
rep('  gameTick(t, now);', '  academyTick(t, now);')
assert 'GAME.' not in html.replace('const GAME = null', ''), 'GAME leftovers'

# 5. outputs
dist = root / 'dist'; dist.mkdir(exist_ok=True)
artifact = pathlib.Path(sys.argv[sys.argv.index('--artifact') + 1]) if '--artifact' in sys.argv else dist / 'artifact.html'
artifact.write_text(html, encoding='utf8')
head = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<!-- Собрано из apps/hq/academy-src (python3 build.py). Руками не правь. -->\n'
        '<title>Академия AICEX</title>\n'
        '<meta name="description" content="Академия AICEX: собери свой ИИ-офис — 24 агента, команда, регламенты и проект Claude.">\n'
        '<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n')
page = head + html.replace('<title>Академия AICEX</title>\n', '', 1) + '</body>\n</html>\n'
(hq / 'academy.html').write_text(page, encoding='utf8')
(dist / 'test.html').write_text(page, encoding='utf8')
print('built', len(html), '→', hq / 'academy.html', '+', artifact)
