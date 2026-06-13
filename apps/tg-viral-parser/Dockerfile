FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY tg_viral_parser.py review_bot.py .

# ENTRYPOINT — интерпретатор, скрипт+команда задаются через CMD / compose `command`:
#   парсер:    python -u tg_viral_parser.py run|login|init-db|selftest   (по умолч. ниже)
#   review-бот: python -u review_bot.py                                  (см. docker-compose.yml)
ENTRYPOINT ["python", "-u"]
CMD ["tg_viral_parser.py", "run"]
