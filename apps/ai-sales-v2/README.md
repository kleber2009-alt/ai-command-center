# ai-sales-v2

Standalone compose-проект `aisales-v2` для контейнера `aisales-api-v2`.

Mount-пути обновлены после монорепо-консолидации:
- `code/` теперь читается из `/home/aisales/monorepo/apps/aisales/code` (не из `/home/aisales/ai-command-center/apps/ai-sales/code`).
- `agent-prompts/` + `voice-input/` остались в `/home/aisales/aisales-app-v2/` (local live data).

Запуск:
```bash
cd /home/aisales/monorepo/apps/ai-sales-v2
docker compose up -d
```

`env/v2.env` хранится локально (gitignored).
