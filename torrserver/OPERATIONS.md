# Эксплуатация torrent-функции

Инструкция для текущего Docker Compose, T-024. Rollout и изменение прав доступа
исключены по решению владельца проекта. Команды PowerShell выполняются из корня
репозитория. Это процедуры обслуживания; обновление, очистка и отключение не
выполняются автоматически при чтении документа.

## Настройки, secrets и сеть

`compose.yaml` включает `TORRENT_STREAMING_ENABLED=true` и задаёт приватные адреса
TorrServer/Prowlarr и пути secrets. `backend/.env.example` содержит безопасный
standalone default `false`. Значения `environment` в Compose имеют приоритет над
`env_file`: изменение только `backend/.env` **не отключает** текущий Docker backend.
`docker compose restart` не применяет новое окружение; нужен `up -d --no-deps backend`.

| Настройка                                                     | Назначение                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `TORRENT_STREAMING_ENABLED`                                   | Общий флаг движка, подготовки HLS и фонового reconciler                           |
| `TORRSERVER_BASE_URL`                                         | В Compose `http://torrserver:8090`, без credentials в URL                         |
| `TORRSERVER_USERNAME_FILE`, `TORRSERVER_PASSWORD_FILE`        | Файлы Basic Auth, одинаковые для backend и engine                                 |
| `TORRENT_IDEMPOTENCY_SECRET_FILE`                             | Постоянный ключ 32 bytes в base64; сохранять между перезапусками                  |
| `TORRSERVER_CONNECT_TIMEOUT_MS`                               | 3000 ms                                                                           |
| `TORRSERVER_HEADERS_TIMEOUT_MS`, `TORRSERVER_BODY_TIMEOUT_MS` | По 30000 ms                                                                       |
| `TORRSERVER_METADATA_TIMEOUT_MS`                              | 120000 ms; отдельный probe ограничен 30 s                                         |
| `PROWLARR_BASE_URL`, `PROWLARR_API_KEY_FILE`                  | В Compose приватный origin и файл ключа; задаются вместе                          |
| `PROWLARR_TIMEOUT_MS`                                         | Default 10000 ms; локальные настройки могут отличаться                            |
| `PROWLARR_INDEXER_IDS`                                        | До восьми локальных ID через запятую; перепроверить после восстановления Prowlarr |
| `JACRED_BASE_URL`                                             | Необязательный внешний каталог; без него работает только Prowlarr                 |

Отдельных runtime flags ручного ввода и discovery, admin-only режима и allowlist
сейчас нет. API требует подтверждённый аккаунт; ownership, CSRF и origin checks
действуют дополнительно. Общий флаг не скрывает панель frontend и не является
сетевой блокировкой всего discovery API. Для отключения поиска убрать из эффективного
окружения backend **все три** `PROWLARR_BASE_URL`, `PROWLARR_API_KEY_FILE`,
`JACRED_BASE_URL` и пересоздать backend. При этом ручной ввод может работать, если
общий флаг включён. Текущие Prowlarr URL/key заданы в Compose, а JacRed — опционально в `.env`.

Создание отсутствующих engine secrets без перезаписи существующих:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\torrserver\init-secrets.ps1
```

Файлы находятся в ignored `storage/torrent-engine/secrets/{username,password,idempotency}`.
Prowlarr API key хранится отдельно в `storage/torrent-discovery/secrets/api-key`;
скрипт его не создаёт. Сначала запустить Prowlarr, через локальную admin UI получить
ключ и сохранить в этот файл без публикации в консоль/репозиторий. Ключ должен
совпадать с Prowlarr; при его ротации обновить файл и пересоздать backend. При смене
engine credentials сначала завершить сессии, затем пересоздать engine и backend.
Не менять idempotency key при обычном обновлении. Ограничить доступ к secret-файлам
учётной записью оператора и Docker; Compose secrets здесь являются файлами хоста.

Локальная настройка индексаторов:

```powershell
docker compose -f compose.yaml -f compose.prowlarr-admin.yaml up -d --no-deps prowlarr
# Открыть http://127.0.0.1:9696; настроить источники и сохранить API key локально.
docker compose up -d --no-deps prowlarr
```

Последняя команда убирает временную публикацию admin-порта. Индексаторы и их
credentials живут в volume, а не в Git. Рабочий набор этого стенда: BigFANGroup,
Nyaa.si, Anime Tosho, YTS через Prowlarr и Kinozal/RuTracker/NoNaMe Club через
JacRed. Доступность источника и peers меняется; успешный search не доказывает playback.
FlareSolverr — необязательный профиль `protected-trackers`, текущему набору не нужен.

| Порт / сеть                     | Граница                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| backend `3000`, frontend `5173` | Опубликованы на хосте; базовый Compose предназначен для локального стенда                |
| PostgreSQL `5432`               | В файле Compose опубликован; старый running container может не иметь host mapping        |
| TorrServer `8090`               | Только `torrent-control`; nginx разрешает settings/torrents/stream                       |
| TorrServer `18090`              | Raw engine только container loopback                                                     |
| BitTorrent `32000` TCP/UDP      | Внутри engine, host publication отсутствует; входящая доступность peers не гарантируется |
| Prowlarr `9696`                 | Только приватная control-сеть, кроме временного loopback override                        |

Не публиковать engine, его raw UI/MCP и FlareSolverr. Сохранить startup firewall,
сброс capabilities и IPv6 deny: `internal` Docker network сама по себе не блокирует
частные назначения при исходящем BitTorrent. Движок выделен **только yaneMedia**:
`listOwned()` перечисляет весь engine, и orphan cleanup считает эти записи своими.
Подключать к нему сторонние клиенты/торренты нельзя.

## Диски, ресурсы и резервные копии

| Данные                                       | Где                                              | Политика                                                                   |
| -------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Данные приложения, torrent sessions/bindings | `postgres-data`                                  | Обычный согласованный DB backup; содержит пользовательские данные          |
| Engine config/auth                           | `torrserver-config` → `/config`                  | Чувствительные данные; закрытая копия для восстановления                   |
| Части torrent                                | `torrserver-cache` → `/cache`                    | Расходный cache, исключить из backup                                       |
| Prowlarr config, indexers, credentials       | `prowlarr-config` → `/config`                    | Закрытый согласованный backup; остановить Prowlarr на время файловой копии |
| Engine/Prowlarr secret-файлы, backend `.env` | Хост, ignored                                    | Отдельный защищённый backup, без вывода значений в логи                    |
| HLS                                          | backend `/tmp/yanemedia-torrent-hls`             | Временный container layer, исключить из backup; пропадает при recreate     |
| Media/profile assets                         | `storage/media-assets`, `storage/profile-assets` | Пользовательские данные; torrent cleanup их не затрагивает                 |
| QA/spike fixtures                            | `storage/t023-tools`, `storage/torrent-spike`    | Не нужны штатному запуску; уборка отдельно в T-025                         |

В `settings.json`: disk cache 24 GiB (`25769803776`), удаление cache при Drop,
25 peer connections, UPnP/LPD отключены. `--maxsize` engine и app validation
ограничивают вход 30 GiB; это **не квота Docker volume**. Выделить для cache не
менее 30 GiB свободного места как стартовый резерв, плюс запас для PostgreSQL,
HLS, образов и логов. Это оценка для стенда, а не доказанный пик: отслеживать
фактический рост и держать не менее 20% свободного диска. Docker Desktop хранит
volumes внутри собственного виртуального диска; проверить и его лимит, и диск хоста.
HLS имеет скользящее окно из шести сегментов по ~2 s, но размер зависит от bitrate;
квота HLS на файловой системе сейчас не задана.

Entrypoint при каждом старте заменяет `/config/settings.json` шаблоном из образа
и пересоздаёт auth из secret-файлов. Менять cache/settings нужно в tracked
`torrserver/settings.json` с пересборкой engine; правки только внутри volume
не сохранятся после следующего старта.

TorrServer ограничен 4 CPU, 4 GiB RAM, swap сверх лимита отсутствует, 256 PIDs и
tmpfs 256 MiB. Cache дисковый, поэтому 24 GiB cache не означает 24 GiB heap.
У backend в Compose нет CPU/RAM лимита; FFmpeg работает **в backend**. Требуется одна
реплика backend: бюджеты и candidate cache находятся в памяти процесса. Допускаются
две активные сессии всего, одна на аккаунт, два FFmpeg worker, из них максимум один
с video transcode. Увеличение ресурсов само по себе не меняет эти ограничения.

Практический начальный бюджет для всего локального Docker-стенда — 6 CPU / 8 GiB RAM
с дальнейшим измерением; это инженерная оценка, не результат нагрузочного теста.
Необязательный FlareSolverr дополнительно допускает до 2 CPU / 2 GiB и 512 PIDs.
[Приёмка](ACCEPTANCE.md) содержит только короткие измерения одного потока: backend
около 145 MiB, engine до 98 MiB; они не определяют transcode capacity или пиковую RAM.
При обслуживании наблюдать `docker stats --no-stream` и свободное место, а при
устойчивой нехватке ресурсов завершить torrent-сессии, сохраняя основной сайт.

При восстановлении вернуть DB, нужные assets, secrets и закрытые конфигурации из
согласованного набора. Cache/HLS восстанавливать не требуется. Запуск с отсутствующим
engine state переводит старые сессии в ошибку, а backend restart инвалидирует HLS
generation и candidate refs. Пользователю может понадобиться новый поиск/Play.
Не откатывать всю пользовательскую БД ради отката torrent binary.

## Диагностика без чувствительных данных

```powershell
docker compose config --quiet
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Ports}}'
curl.exe --fail --silent --show-error --max-time 15 http://localhost:3000/api/v1/health
curl.exe --fail --silent --show-error --max-time 15 http://localhost:3000/api/v1/health/ready
curl.exe --fail --silent --show-error --max-time 15 http://localhost:3000/api/v1/health/ready/torrent
curl.exe --fail --silent --show-error --max-time 15 http://localhost:3000/api/v1/health/torrent-metrics
docker compose exec -T torrserver iptables -nvL TORRENT_EGRESS
docker compose exec -T torrserver ip6tables -S OUTPUT
docker compose exec -T torrserver cat /proc/1/status | Select-String '^(Uid|Gid|Cap\w*|NoNewPrivs):'
docker compose exec -T torrserver df -h /cache
docker compose exec -T backend df -h /tmp
docker stats --no-stream
```

Liveness остаётся 200 при отказе torrent dependency. Core readiness тоже возвращает
200, но `data.features.torrent.status` будет `degraded`. Strict readiness возвращает
503 при деградации и 200 при намеренно `disabled`; проверять JSON status вместе с
HTTP. Пробы кешируются 5 s. У engine PID 1 ожидаются UID 65532, нулевые `Cap*`,
`NoNewPrivs: 1`. Правила firewall должны сохраняться после recreate.

Метрики агрегированы, без user/session/hash/peer labels; endpoint не требует cookie.
Описание счётчиков, server-side first-frame-ready и reset semantics — в
[README](README.md#torrent-observability). DB snapshot failure возвращает 503
`METRICS_UNAVAILABLE`. Рост `torrent_cleanup_total{result="deferred"}` требует
проверки доступности engine; повторная очистка идёт раз в минуту. Большое значение
terminal session gauges само по себе не означает утечку: tombstones хранятся сутки.
Не публиковать полный `docker compose config`, `docker inspect`, `.env`, request
bodies, API keys, cookies или сырые ответы engine/Prowlarr для диагностики.

Необязательный live search probe обращается к настроенным внешним источникам, но
печатает только длительность, количество результатов по source и degraded/error:

```powershell
docker compose exec -T backend npm run probe:torrent-discovery -- --query Oppenheimer --kind movie --rounds 2
```

`--kind` допускает `movie|tv|anime`. Ненулевой exit при degraded не доказывает отказ
ручного ввода. При пустом поиске проверить indexer IDs, source cooldown и доступность
каталога; при no-peers timeout не увеличивать лимиты бесконечно. Ошибки metadata/probe
связаны также с peers, transcode — с media/ресурсами, 429 — с budget (`Retry-After`).
Не повторять create автоматически: общий бюджет 20 новых попыток / 10 min и
20 HTTP create / min, manual и candidate разделяют бюджеты.

## Завершение сессий и очистка

Обычный путь — Stop владельцем в UI или authenticated
`DELETE /api/v1/torrent-sessions/:sessionId` с CSRF. Чужая сессия не останавливается
через пользовательский API. Stop завершает FFmpeg/HLS, удаляет engine binding и
делает Drop только после проверки других ссылок; при отказе engine оставляет
задачу reconciler. Не удалять DB bindings раньше очистки engine.

Сессия ограничена 8 h, обычный idle — 20 min; для готового playback действует
viewer lease 2 min, продлеваемый валидным HLS/status. Sweep раз в 60 s; orphan
grace 120 s. Удаление stopped/expired DB tombstones — после 24 h. Отказ движка
может отложить физическую очистку; истёкшая сессия уже недоступна по API.

Для обслуживания всех app-сессий сначала исключить новые torrent-запросы на время
работ: на ingress закрыть создание/поиск/playback, оставив владельцам Stop.
На локальном стенде без ingress закрыть клиенты и не запускать новые операции.
Такого встроенного режима обслуживания в приложении нет.

Сводка без идентификаторов и пользовательских данных:

```powershell
@'
SELECT state, count(*) FROM torrent_sessions GROUP BY state ORDER BY state;
SELECT count(*) AS bindings FROM torrent_engine_bindings;
'@ | docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U yanemedia -d yanemedia
```

Если владельцы не могут выполнить Stop, оператор может досрочно истечь **все
yaneMedia torrent-сессии этой БД**. Это прерывает просмотр; не применять для
диагностики. Остановить backend, чтобы убрать гонку с выполняющимися командами,
затем выполнить только следующий bounded update и вернуть тот же backend:

```powershell
docker compose stop -t 30 backend
@'
BEGIN;
SET LOCAL statement_timeout = '5s';
UPDATE torrent_sessions
SET expires_at = LEAST(expires_at, now()),
    idle_expires_at = LEAST(idle_expires_at, now()),
    version = version + 1, updated_at = now()
WHERE state IN ('created', 'fetching_metadata', 'awaiting_file', 'probing',
                'awaiting_playback', 'preparing', 'ready', 'failed');
COMMIT;
'@ | docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U yanemedia -d yanemedia
docker compose start backend
```

Если SQL завершился ошибкой, очистка не подтверждена: исправить причину и повторить
проверку. Backend запускается с общим флагом **true**, engine должен быть доступен.
Подождать несколько sweep (обычно 1–3 min) и повторить сводку: нет активных,
failed/stopping/expiring сессий, bindings=0, метрики copy/transcode=0. Проверить
количество записей engine через adapter без raw JSON:

```powershell
@'
const { ConfigService } = require('@nestjs/config');
const { createTorrServerConfig } = require('./dist/torrent/torrserver.config');
const { TorrServerClient } = require('./dist/torrent/torrserver.client');
const config = new ConfigService({
  TORRENT_STREAMING_ENABLED: true,
  TORRSERVER_BASE_URL: process.env.TORRSERVER_BASE_URL,
  TORRSERVER_USERNAME_FILE: process.env.TORRSERVER_USERNAME_FILE,
  TORRSERVER_PASSWORD_FILE: process.env.TORRSERVER_PASSWORD_FILE,
});
(async () => {
  const client = new TorrServerClient(createTorrServerConfig(config));
  const entries = await client.listOwned(AbortSignal.timeout(10000));
  console.log(JSON.stringify({ engineTorrents: entries.length }));
})().catch(() => { console.error('engine_count_unavailable'); process.exitCode = 1; });
'@ | docker compose exec -T backend node
```

Ожидается `engineTorrents=0`; probe требует доступный engine и его config/secrets.
Одних DB counts недостаточно для исключения engine orphan. Reconciler самостоятельно
удаляет orphan записи выделенного engine после grace и устаревшие HLS directories.
Не использовать global Drop/reset, `docker compose down -v`, volume prune или
удаление всего `storage`. Не трогать assets, пользователей, secrets и посторонние volumes.

## Полное отключение и возврат

Штатно сначала выполнить завершение/проверку очистки выше. После этого изменить
эффективное `services.backend.environment` в `compose.yaml`:

```yaml
TORRENT_STREAMING_ENABLED: "false"
```

Для прекращения discovery убрать Prowlarr URL/key из этого же блока и JacRed URL
из backend `.env`. Сохранить secret-файлы и volumes для возврата. Применить:

```powershell
docker compose config --quiet
docker compose up -d --no-deps backend
docker compose stop -t 30 torrserver prowlarr
```

Если запускался профиль FlareSolverr, отдельно остановить его:
`docker compose --profile protected-trackers stop -t 30 flaresolverr`.
Проверить core health=200, strict feature status=`disabled`, работоспособность
обычных online sources. Torrent UI может оставаться видимым; новые операции
недоступны. При последующих `up` оставлять `--no-deps`, иначе зависимость backend
может снова запустить engine даже при выключенном флаге.

Аварийно можно сначала остановить engine и пересоздать backend с флагом false и
без discovery config. Это прекращает обслуживание, **но не очищает** engine/DB
state: выключенный reconciler не делает sweep. Для последующей очистки временно
вернуть engine и backend с true в закрытом окне обслуживания и выполнить процедуру
выше. Не удалять secrets/volumes как замену корректному отключению.

Для возврата восстановить приватные URL/key settings и флаг true, запустить
`docker compose up -d --no-deps torrserver prowlarr`, дождаться engine healthy,
затем `docker compose up -d --no-deps backend`. Проверить readiness и firewall.
Старые candidate refs после recreate недействительны; выполнить новый поиск.

## Обновление pinned engine и rollback

1. Завершить сессии и сохранить закрытые config/secrets backups. Записать текущие
   source revision, URL, SHA-256 и image ID. Текущий pin — `MatriX.146.2`, бинарник
   `TorrServer-gst-linux-amd64`; другие архитектуры этим Compose не проверены.
2. Сохранить предыдущий engine image до сборки:
   `docker image tag yanemedia-torrserver yanemedia-torrserver:before-maintenance`.
   Не перезаписывать этот tag до завершения обслуживания.
3. Для выбранного upstream release проверить происхождение бинарника, release notes
   и API compatibility. Изменить вместе `TORRSERVER_URL` и `TORRSERVER_SHA256` в
   build args `compose.yaml`; build проверяет checksum. Не переходить на `latest`.
4. Выполнить `docker compose build torrserver`, затем
   `docker compose up -d --no-deps torrserver`. Не менять firewall entrypoint,
   loopback bind и proxy allowlist при обновлении.
5. Повторить health/firewall/capability checks из README, затем на idle dev-стенде
   focused adapter/lifecycle tests и отдельный real FFmpeg fixture. Выполнить
   контрольный разрешённый playback/Stop и проверить очистку. Fixture проверяет
   gateway, а не полную совместимость новой engine версии.

```powershell
# Из backend, focused проверки без public peers:
npm.cmd test -- --runInBand test/torrent/torrserver-client.spec.ts test/torrent/torrent-engine-lifecycle.integration.spec.ts
# Из корня, отдельный реальный FFmpeg fixture на idle dev-стенде:
docker compose exec -T -e TORRENT_GATEWAY_TEST=1 backend npm test -- --runInBand test/torrent/torrent-gateway.integration.spec.ts
```

Если обновление не прошло проверку: оставить новые запросы закрытыми, вернуть
предыдущие URL/SHA в Compose, затем вернуть сохранённый image и пересоздать только engine:

```powershell
docker image tag yanemedia-torrserver:before-maintenance yanemedia-torrserver
docker compose up -d --no-deps --no-build --force-recreate torrserver
```

Если предыдущий image не сохранён, собрать engine с прежними URL/SHA. При
несовместимом изменении config восстановить его согласованную закрытую копию
при остановленном engine. Не восстанавливать cache и всю DB. Снова проверить
readiness/firewall и app playback. Для отказа backend аналогично сохранить его
предыдущий image до обновления; откат допустим только при совместимой DB schema.
Эта задача миграций не добавляет. При сомнении отключить функцию по процедуре выше.

Точные Docker semantics:
[приоритет environment](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/),
[up / recreate / no-deps](https://docs.docker.com/reference/cli/docker/compose/up/),
[stop без удаления контейнеров](https://docs.docker.com/reference/cli/docker/compose/stop/).
