# Настройка torrent discovery

Backend объединяет приватный Prowlarr и необязательный JacRed v1 catalog.
Ручной magnet/`.torrent` использует тот же playback pipeline и не требует
настроенных indexers. Secrets, URL скачивания и magnets не передаются frontend:
он получает ограниченные по времени candidate refs, принадлежащие аккаунту.

## Prowlarr и индексаторы

Prowlarr хранит `/config` в `prowlarr-config`; backend обращается к
`http://prowlarr:9696` по control-сети с `X-Api-Key` из
`storage/torrent-discovery/secrets/api-key`. Этот файл и volume содержат secrets.
Для начальной настройки запустить только Prowlarr с loopback admin override,
получить API key через UI и сохранить в файл, затем запускать backend.
Порядок команд и ротация — в [OPERATIONS.md](OPERATIONS.md#настройки-secrets-и-сеть).

Добавлять только разрешённые владельцем источники. Проверить connection test,
credentials и movie/TV/anime categories каждой definition. Выбрать до восьми
фактических локальных indexer IDs в `PROWLARR_INDEXER_IDS` backend `.env`;
без списка используется общий поиск. После замены volume/definition проверить
IDs заново. Изменение окружения требует recreate backend, обычный restart
его не применяет. После настройки убрать admin-порт базовым Compose.

Набор, принятый 2026-10-22: BigFANGroup, Nyaa.si, Anime Tosho и YTS через
Prowlarr; Kinozal, RuTracker и NoNaMe Club через JacRed. Локальные IDs native
источников на том стенде — `2,7,8,9`; это пример, а не переносимый default.
Nyaa/Anime Tosho расширяют anime coverage, YTS — movie coverage; русская озвучка
не гарантируется. Одинаковый hash у двух источников не означает независимых peers.

## Необязательный JacRed

Принятый стенд задавал `JACRED_BASE_URL=https://jacred.su` в backend `.env`.
Backend запрашивает внешний catalog по bounded title и не хранит его базу
локально; tracker credentials туда не отправляются. Без URL остаётся Prowlarr.
Совместимый origin должен предоставлять `/api/v1.0/torrents` с `title`, `tracker`,
`url`, `size`, числовым `sid` и `magnet`; `createTime` необязателен, `{}` означает
пустой ответ. Adapter ограничен тремя распознаваемыми tracker/topic origins,
8 s, 2 MiB и проверкой magnet; redirects и не-JSON отклоняются.

Candidate list ограничен 50 результатами с сохранением разнообразия источников.
Catalog seed counts могут устареть и не доказывают доступность peers. Проверять
реальную metadata и playback, а не только результаты поиска. Отказ одного
provider сохраняет результаты другого с `degraded`; cached results помечаются
как stale. Backend restart сбрасывает in-memory cache и candidate refs.

## Проверка и диагностика

Сохранённые результаты приёмки 2026-10-22: BigFANGroup, Kinozal, RuTracker и
NoNaMe Club дали decoded video/audio в app HLS (59–129 s на выбранных releases,
первый кадр через 5.8–13.4 s после отдельного Play). Подготовка тогда выполнялась
до Play; эти timings не описывают поздний one-click UX. YTS играл 36 s / 886 frames,
Nyaa — 51 s / 1238 frames, Anime Tosho — 31 s / 752 frames после явного retry
из-за медленного swarm. Connection-refused probes каждого provider сохраняли
результаты другого с `degraded=true`; обычный запрос подтверждал recovery.
Это отдельные исторические samples, не гарантия текущей доступности источника.

После сборки backend необязательные probes из корня проекта (внешний поиск,
без создания сессии и скачивания torrent):

```powershell
docker compose exec -T backend npm run probe:torrent-discovery -- --query Oppenheimer --kind movie --rounds 2
docker compose exec -T backend npm run probe:torrent-discovery -- --query Shogun --kind tv --rounds 2
docker compose exec -T backend npm run probe:torrent-discovery -- --query "Sousou no Frieren" --kind anime --rounds 2
```

Probe печатает timing/source counts без ключей, credentials и magnets;
при degraded/unavailable exit ненулевой. Пустой catalog, provider failure и
release без peers — разные состояния. При пустом поиске проверить IDs,
categories, source cooldown и доступность provider. Повторный поиск после
восстановления проверяет recovery; успешный probe не доказывает playback.

Прямой доступ к protected trackers зависит от сети/Cloudflare. Исторические
browser/solver prototypes не доказали устойчивые login/search/download;
увеличение timeout само по себе проблему не решает. Существующие отключённые
definitions и credentials сохранены в Prowlarr; старые сторонние Docker volumes
не удаляются этой уборкой.

После исправления оператором сети можно отдельно запустить
`docker compose --profile protected-trackers up -d flaresolverr`, настроить
native definitions/proxy в loopback admin UI, выбрать их локальные IDs и
пересоздать backend. Для Prowlarr-only discovery убрать JacRed URL. Профиль
не исправляет Cloudflare автоматически; нужны повторные search/download и
authenticated playback/cleanup checks. По умолчанию FlareSolverr не запускается.

Доказательства browser/codec playback и их границы — в
[ACCEPTANCE.md](ACCEPTANCE.md). Readiness, метрики, отключение и восстановление
описаны в [OPERATIONS.md](OPERATIONS.md). Отдельных runtime flags manual/discovery
нет; общий engine flag не является выключателем всех discovery routes.
