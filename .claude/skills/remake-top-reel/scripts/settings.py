#!/usr/bin/env python3
"""Личные настройки «Ремейка залёта» (REMAKE_HOME/config.json поверх config.json скилла)

  python3 settings.py show                                   итоговые настройки
  python3 settings.py set avatar.look_id=... avatar.voice_id=... avatar.confirmed=true
  python3 settings.py set style_mode=rotate                  больше не спрашивать стиль — чередовать

Значение читается как JSON (true, 1.1, "текст"), иначе — как строка.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import HOME_DIR, config, set_override


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("show", "set"):
        sys.exit(__doc__)
    if sys.argv[1] == "show":
        print(json.dumps(config(), ensure_ascii=False, indent=1))
        return
    for kv in sys.argv[2:]:
        k, _, v = kv.partition("=")
        if not k or not _:
            sys.exit(f"нужно ключ=значение: {kv}")
        try:
            val = json.loads(v)
        except ValueError:
            val = v
        set_override(k, val)
        print(f"OK {k} = {val!r}")
    print(f"FILE {HOME_DIR / 'config.json'}")


if __name__ == "__main__":
    main()
