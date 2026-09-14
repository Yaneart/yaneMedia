# yaneMedia frontend

React/Vite-клиент yaneMedia.

## Локальный запуск

```bash
bun install
cp .env.example .env
bun run dev
```

Приложение доступно на `http://localhost:5173`. `VITE_API_BASE_URL` должен указывать на backend API, по умолчанию `http://localhost:3000/api/v1`.

## Команды

```bash
bun run build
bun run lint
bun run format:check
bun run preview
```

Архитектурные правила описаны в [`../docs/frontend-architecture.md`](../docs/frontend-architecture.md).
