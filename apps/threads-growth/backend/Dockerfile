FROM python:3.11-slim

WORKDIR /app

# psycopg/cryptography собираются из колёс; build-essential на всякий случай для slim.
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

EXPOSE 8080

# По умолчанию — API. Воркеры запускаются n8n-ом:
#   python -m app.workers.scrape_worker [scrape|rescore]
#   python -m app.workers.generate_worker
#   python -m app.workers.reply_worker
#   python -m app.workers.publish_worker
#   python -m app.workers.analytics_worker [collect|daily]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
