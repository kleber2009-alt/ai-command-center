"""Проверка перед `wrangler deploy`: архивы скиллов академии на месте.

Архивы не лежат в git (репозиторий публичный), их собирает tools/pack_skills.py.
Без них деплой удалил бы скиллы с сайта — поэтому падаем с подсказкой.
"""
import pathlib, sys

need = ['lead-magnet', 'landing-gold', 'landing-light', 'landing-neon', 'landing-emerald', 'landing-poster', 'threads-telegram-funnel']
root = pathlib.Path(__file__).resolve().parent.parent.parent / 'academy-files' / 'skills'
missing = [n for n in need if not (root / f'{n}.zip').is_file()]
if missing:
    print('Нет архивов скиллов академии: ' + ', '.join(missing))
    print('Сначала: python3 academy-src/tools/pack_skills.py <папка со скиллами>')
    sys.exit(1)
print(f'academy-files: {len(need)} архивов на месте')
