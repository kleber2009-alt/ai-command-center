"""funnel_worker — задачи воронки Threads → Telegram (см. app/funnel/jobs.py).

    python -m app.workers.funnel_worker <metrics|plan|generate|publish|comments|report|token|seed> [YYYY-MM-DD]

Дата нужна только plan / generate / report (по умолчанию — сегодня по FUNNEL_TZ).
n8n может звать то же самое по HTTP: POST /cron/funnel/<job> с X-Cron-Secret.
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import date

from app.funnel import jobs

logging.basicConfig(format="%(asctime)s [%(levelname)s] %(name)s: %(message)s", level=logging.INFO)

DATED = ("plan", "generate", "report")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    name = sys.argv[1]
    kwargs = {}
    if len(sys.argv) > 2 and name in DATED:
        kwargs["day"] = date.fromisoformat(sys.argv[2])
    print(json.dumps(jobs.run(name, **kwargs), ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
