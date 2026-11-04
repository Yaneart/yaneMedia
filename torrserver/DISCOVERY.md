# Поиск раздач через API

Backend использует JSON API JacRed v1 и независимый Knaben v2. Локальная база раздач,
отдельный поисковый контейнер и ключ API не нужны. Настройки в `backend/.env`:

```dotenv
JACRED_BASE_URL=https://jacred.su
JACRED_FALLBACK_URLS=https://jac.black
KNABEN_BASE_URL=https://api.knaben.org
```

Можно указать origin своего совместимого сервиса без пути и завершающего `/`.
Для JacRed допускаются до двух резервных origins через запятую. Очистка всех трёх
значений отключает поиск, сохраняя ручной ввод magnet/`.torrent` и тот же playback pipeline.
После изменения `.env` пересоздайте backend:

```sh
# Папка: yaneMedia/ (корень проекта)
docker compose up -d --no-deps backend
```

## Как работает поиск

Backend параллельно запрашивает JacRed `/api/v1.0/torrents?search=...&sort=sid`
и Knaben `/v2/search?q=...&o=seeders&s=150&f=0` по оригинальному и локализованному названию.
Год, сезон и серия учитываются при ранжировании. Поиск ничего не скачивает через TorrServer;
сессия создаётся только после выбора результата пользователем.

Ответ API содержит `title`, `tracker`, `url`, `size`, числовой `sid` и `magnet`; `createTime` необязателен.
Пустые `[]` и `{}` означают отсутствие результатов JacRed. Поддержан его полный
известный каталог: прежние Kinozal/RuTracker/NoNaMe Club, Rutor, BitRu, MegaPeer,
Toloka, Torrent.by, аниме/сериальные трекеры и другие. Их наличие зависит от выбранного API.
Knaben добавляет свои источники, например Nyaa, YTS, 1337x и The Pirate Bay.
Проверяются хост страницы JacRed, magnet, hash и числовые метрики.
Объединённые записи JacRed относятся к фактическому хосту страницы; одинаковые
hash+tracker из разных каталогов дедуплицируются. Запрос ограничен 4 секундами и 2 МиБ ответа;
redirects, HTML и некорректные данные отклоняются. Пароли трекеров в API не передаются.

Frontend получает до 50 результатов с непрозрачными `candidateRef`, привязанными к аккаунту на 10 минут.
Magnet и внутренние адреса остаются на backend. При запуске кандидата используется только проверенный magnet;
backend не загружает `.torrent` по URL из результата поиска. Ручная загрузка `.torrent` остаётся отдельной возможностью.

При отказе JacRed используется следующий настроенный origin, Knaben работает независимо.
Ошибки одного API не удаляют результаты другого; ответ получает `degraded=true`.
Недоступные API пропускаются на минуту. Успешные ответы кэшируются на минуту,
до 100 записей; во время ошибки тот же запрос может вернуть кэш не старше 10 минут
с `stale=true`. При полном отказе без подходящего кэша возвращается
`TORRENT_DISCOVERY_UNAVAILABLE`.
Перезапуск backend сбрасывает candidate refs. Число сидов в каталоге может устареть и не гарантирует playback.

## Диагностика

Необязательная проверка обращается к настроенному API без создания torrent-сессии:

```sh
# Папка: yaneMedia/ (корень проекта)
docker compose exec -T backend npm run probe:torrent-discovery -- --query Oppenheimer --kind movie --rounds 2
```

Probe печатает длительность, число результатов по трекерам/каталогам и degraded/error,
без magnet и сырых ответов. Второй раунд может использовать кэш.
При пустом поиске проверьте все три настройки, доступность API и наличие названия в каталоге.
Поиск и доступность peers — разные проверки.

API-документация: [трекеры JacRed](https://github.com/jacred-fdb/jacred/blob/main/docs/trackers/overview.mdx),
[Knaben v2](https://knaben.org/api/v2/). Другие API-аналоги:
[Jackett](https://github.com/Jackett/Jackett/wiki/Jackett-API) и
[Prowlarr](https://prowlarr.com/docs/api/) требуют настроенного экземпляра и ключа;
сейчас они не подключены. HTML трекеров приложение не парсит.

Первый запуск описан в [SETUP.md](SETUP.md), эксплуатация — в [OPERATIONS.md](OPERATIONS.md).
