"""Упаковка скиллов AICEX для учеников академии.

    python3 tools/pack_skills.py <папка со скиллами>

Берёт папки скиллов, вычищает из примеров личные данные (почта, телефон,
реквизиты ИП) и кладёт архивы в ../academy-files/skills/<имя>.zip.
Архивы отдаёт Worker hq.aicex.club только по коду ученика.
"""
import pathlib, re, sys, zipfile

SKILLS = ['lead-magnet', 'landing-gold', 'landing-light', 'landing-neon', 'landing-emerald', 'landing-poster', 'threads-telegram-funnel']
SCRUB = [
    (re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+'), 'hello@example.com'),
    (re.compile(r'\+7\d{10}'), '+7 900 000-00-00'),
    (re.compile(r'Индивидуальный предприниматель [^·"\n]+· ИНН \d+ · ОГРНИП \d+'), 'Индивидуальный предприниматель Фамилия Имя Отчество · ИНН XXXXXXXXXXXX · ОГРНИП XXXXXXXXXXXXXXX'),
]
# после чистки в архиве не должно остаться: длинных номеров (телефон, ИНН, ОГРН), чужих почт, реквизитов ИП.
# Сами данные здесь не перечисляем: репозиторий публичный. Имя автора в примере остаётся — это публичный лендинг AICEX.
LEAKS = re.compile(r'(?<!\d)\d{10,}(?!\d)|[\w.+-]+@(?!example\.com\b)[\w-]+\.[a-z]{2,}|предприниматель (?!Фамилия Имя Отчество)', re.I)
TEXT = {'.md', '.json', '.js', '.css', '.py', '.html', '.txt'}

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).resolve().parent.parent.parent / 'academy-files' / 'skills'
out.mkdir(parents=True, exist_ok=True)
for name in SKILLS:
    root = src / name
    assert (root / 'SKILL.md').is_file(), f'{name}: нет SKILL.md'
    dst = out / f'{name}.zip'
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(p for p in root.rglob('*') if p.is_file()):
            arc = f'{name}/{f.relative_to(root).as_posix()}'
            if f.suffix in TEXT:
                t = f.read_text(encoding='utf-8')
                if 'examples' in f.parts:   # личные данные бывают только в примерах лендингов
                    for rx, rep in SCRUB:
                        t = rx.sub(rep, t)
                assert not LEAKS.search(t), f'{arc}: личные данные после чистки'
                z.writestr(zipfile.ZipInfo(arc, (2026, 10, 28, 0, 0, 0)), t)
            else:
                z.writestr(zipfile.ZipInfo(arc, (2026, 10, 28, 0, 0, 0)), f.read_bytes())
    print(f'{dst.name}: {dst.stat().st_size // 1024} КБ')
