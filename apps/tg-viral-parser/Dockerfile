FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY tg_viral_parser.py .

# Команда задаётся при запуске: login | init-db | run (по умолч.) | selftest
ENTRYPOINT ["python", "-u", "tg_viral_parser.py"]
CMD ["run"]
