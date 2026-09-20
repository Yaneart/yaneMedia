# yaneMedia backend

NestJS API для Media Engine, авторизации и пользовательских данных.

## Локальный запуск

```bash
bun install
cp .env.example .env
bun run db:migrate
bun run start:dev
```

По умолчанию API доступен на `http://localhost:3000/api/v1`, liveness — на `http://localhost:3000/api/v1/health`.

Для запуска вне Compose нужен доступный PostgreSQL из `DATABASE_URL`. Для отправки писем задаются `RESEND_API_KEY` и `MAIL_FROM`.

## Команды

```bash
bun run build
bun run lint
bun run test -- <test-file-or-pattern>
bun run db:generate
bun run db:migrate
bun run db:check
bun run probe:discovery
bun run catalog:sync
```

Discovery probe выполняет только GET-запросы к `http://localhost:3000/api/v1` и печатает JSON-строки со status, TTFB, total time и размером ответа. Другой стенд задаётся через `DISCOVERY_PROBE_BASE_URL`.

`catalog:sync` валидирует редакционный manifest, собирает staging-ревизию с локальными poster/backdrop и публикует её только после полного успешного наполнения. Повторный запуск той же версии manifest идемпотентен.

Интеграционные PostgreSQL-тесты включаются соответствующими флагами в самих test suites и используют отдельное подключение с откатом.
