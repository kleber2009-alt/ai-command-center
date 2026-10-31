#!/usr/bin/env python3
"""Личные настройки «Ремейка залёта» (REMAKE_HOME/config.json поверх config.json скилла)

  python3 settings.py show                                   итоговые настройки
  python3 settings.py set avatar.look_id=<один из avatar.allowed>
  python3 settings.py set style_mode=rotate                  больше не спрашивать стиль — чередовать
  python3 settings.py engine                                 движок HeyGen (всегда avatar_v)

Значение читается как JSON (true, 1.1, "текст"), иначе — как строка.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # и под python3 -I
from common import HOME_DIR, avatar_engine, config, set_override


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("show", "set", "engine"):
        sys.exit(__doc__)
    if sys.argv[1] == "engine":
        print(avatar_engine())
        return
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
        if k == "avatar.look_id":
            from common import allowed_looks
            if val not in {x["look_id"] for x in allowed_looks()}:
                sys.exit("можно только образ из avatar.allowed (ilia.paliy № 55, 56, 57, 58, 61)")
        elif k.startswith("avatar.") and k not in ("avatar.look_name",):
            sys.exit(f"{k} менять нельзя: голос — родной у образа, движок только Avatar V, темп 1.1 (решение Ильи 31.10)")
        set_override(k, val)
        print(f"OK {k} = {val!r}")
    print(f"FILE {HOME_DIR / 'config.json'}")


if __name__ == "__main__":
    main()
