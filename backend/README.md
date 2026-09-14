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
```

Интеграционные PostgreSQL-тесты включаются соответствующими флагами в самих test suites и используют отдельное подключение с откатом.
