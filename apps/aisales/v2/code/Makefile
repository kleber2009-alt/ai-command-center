# AI Sales · удобные команды
.PHONY: help install dev-up dev-down dev-logs api-shell db-shell test lint format clean migrate-up content content-batch

help:
	@echo "AI Sales · команды:"
	@echo ""
	@echo "  СТЕК"
	@echo "    make dev-up        — поднять docker compose"
	@echo "    make dev-down      — остановить"
	@echo "    make dev-logs      — следить за логами api"
	@echo "    make api-shell     — bash внутрь api контейнера"
	@echo "    make db-shell      — psql внутрь postgres"
	@echo ""
	@echo "  ЛОКАЛЬНО (без Docker)"
	@echo "    make install       — venv + зависимости"
	@echo "    make dev           — uvicorn локально"
	@echo "    make test          — pytest"
	@echo ""
	@echo "  КОНТЕНТ"
	@echo "    make content TOPIC='...'           — все форматы одной идеи"
	@echo "    make content-batch N=5             — N идей из idea-bank"
	@echo "    make voice                         — анализ голоса из транскриптов"
	@echo ""

# ============ Docker ============

dev-up:
	docker compose up -d
	@echo "✓ Стек поднят. API: http://localhost:8000/docs"

dev-down:
	docker compose down

dev-logs:
	docker compose logs -f api

api-shell:
	docker compose exec api bash

db-shell:
	docker compose exec postgres psql -U aisales -d aisales

dev-rebuild:
	docker compose build api && docker compose up -d api

# ============ Local ============

install:
	python3 -m venv venv
	. venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt

dev:
	. venv/bin/activate && uvicorn main:app --reload --port 8000

# ============ Tests ============

test:
	. venv/bin/activate && pytest tests/ -v

lint:
	. venv/bin/activate && ruff check . --exclude venv

format:
	. venv/bin/activate && ruff format . --exclude venv

# ============ Migrations ============

migrate-up:
	. venv/bin/activate && alembic upgrade head

migrate-create:
	. venv/bin/activate && alembic revision --autogenerate -m "$(MSG)"

# ============ Content pipeline ============

content:
	. venv/bin/activate && python content_pipeline.py --idea "$(TOPIC)" --formats carousel,reel,caption --mock

content-batch:
	. venv/bin/activate && python content_pipeline.py --from-bank $(N) --formats carousel,reel --mock

content-real:
	. venv/bin/activate && python content_pipeline.py --idea "$(TOPIC)" --formats carousel,reel,caption

voice:
	. venv/bin/activate && python -m utils.voice_analyzer --mock

voice-real:
	. venv/bin/activate && python -m utils.voice_analyzer

transcribe:
	. venv/bin/activate && python -m utils.voice_transcribe

# ============ Cleanup ============

clean:
	rm -rf __pycache__ **/__pycache__ .pytest_cache .ruff_cache *.pyc
	find . -type d -name __pycache__ -not -path './venv/*' -exec rm -rf {} +

clean-generated:
	rm -rf ../carousels/generated/* ../reels/generated/* ../content-bank/generated-captions/*
