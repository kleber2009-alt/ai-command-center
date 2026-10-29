"""Общая очередь тяжёлых задач (Claude + рендер) для всех ботов на сервере: монтаж, карусели, Кадрик, productionskill, Silent Reels.

Сервер один (4 ядра, 7.5 ГБ), и два монтажа сразу упираются в память: процесс убивают (код 137) или он «зависает».
Поэтому каждый бот берёт слот перед запуском Claude и отдаёт после. Слот — flock на ~/.heavy-slot.lock:
если процесс бота умер, блокировка снимается сама. Копия этого файла лежит в папке каждого бота — держать одинаковой.
"""
import asyncio
import fcntl
from contextlib import asynccontextmanager
from pathlib import Path

LOCK_PATH = Path.home() / ".heavy-slot.lock"
OWNER_PATH = Path.home() / ".heavy-slot.owner"


def busy_by() -> str:
    """Кто сейчас занял сервер ("" — свободно). Только для текста «в очереди»."""
    f = open(LOCK_PATH, "a+")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(f, fcntl.LOCK_UN)
        return ""
    except BlockingIOError:
        try:
            return OWNER_PATH.read_text(encoding="utf-8").strip() or "другой бот"
        except OSError:
            return "другой бот"
    finally:
        f.close()


@asynccontextmanager
async def heavy_slot(owner: str):
    f = open(LOCK_PATH, "a+")
    try:
        while True:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                await asyncio.sleep(5)
        OWNER_PATH.write_text(owner, encoding="utf-8")
        yield
    finally:
        try:
            fcntl.flock(f, fcntl.LOCK_UN)
        finally:
            f.close()
