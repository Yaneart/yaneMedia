# Первый запуск Home на Windows

Home позволяет смотреть torrent через ваш сервер. Prowlarr ищет раздачи, а TorrServer скачивает их для просмотра.

Нужен запущенный Docker Desktop с Linux-контейнерами и файл `backend/.env` из [общей инструкции](../README.md#быстрый-старт).

Откройте PowerShell в корне скачанного или склонированного проекта — папке с `compose.yaml`. В примерах она обозначена как `yaneMedia/`. Все команды ниже запускайте из неё; переходить в `torrserver`, `backend` или `storage` не нужно.

Если Home уже настроен, переходите сразу к шагу 5.

## 1. Создайте пароли автоматически

```powershell
# Папка: yaneMedia/ (корень проекта)
powershell -NoProfile -ExecutionPolicy Bypass -File .\torrserver\init-secrets.ps1
```

Скрипт сам создаст служебный логин, пароль и ключ для TorrServer. Они сохранятся в `storage/torrent-engine/secrets`. Придумывать или копировать их не нужно. Существующие файлы скрипт не меняет.

## 2. Откройте настройки Prowlarr

```powershell
# Папка: yaneMedia/ (корень проекта)
docker compose -f compose.yaml -f compose.prowlarr-admin.yaml up -d --no-deps prowlarr
```

Подождите запуска и откройте **[127.0.0.1:9696](http://127.0.0.1:9696)** в браузере на этом же компьютере. Если страница ещё не открывается, немного подождите и обновите её.

При первом входе Prowlarr может попросить создать логин и пароль. Это отдельный вход в его настройки, не аккаунт yaneMedia.

## 3. Сохраните ключ Prowlarr

В Prowlarr откройте **[Settings → General → Security](https://wiki.servarr.com/prowlarr/settings)** и скопируйте значение **API Key**. Это служебный ключ для связи с yaneMedia, а не пароль от входа.

Сразу после копирования выполните:

```powershell
# Папка: yaneMedia/ (корень проекта)
New-Item -ItemType Directory -Force -Path .\storage\torrent-discovery\secrets | Out-Null
Get-Clipboard -Raw | Set-Content -LiteralPath .\storage\torrent-discovery\secrets\api-key -Encoding ascii -NoNewline
```

Команда возьмёт ключ из буфера обмена и запишет в файл `storage/torrent-discovery/secrets/api-key` без расширения. Вставлять ключ в команду или в `.env` не нужно. Все эти служебные файлы уже исключены из Git.

## 4. Добавьте источники поиска

В Prowlarr откройте **Indexers → Add Indexer** (кнопка **+**), выберите нужный torrent-трекер, заполните его настройки, нажмите **Test**, затем **Save**. Для поиска добавьте хотя бы один источник с успешной проверкой.

Для первого запуска оставьте `PROWLARR_INDEXER_IDS` в `backend/.env` пустым: приложение будет искать по всем подключённым источникам. Вручную указывать их номера не требуется.

Если собираетесь открывать только свою magnet-ссылку или `.torrent`-файл, добавление источников можно пропустить. Шаг 3 всё равно нужен для текущей конфигурации Home.

## 5. Запустите Home

Закройте временный доступ к настройкам Prowlarr и запустите приложение:

```powershell
# Папка: yaneMedia/ (корень проекта)
docker compose up -d --no-deps prowlarr
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Mode Home -Build
```

Если это первый запуск всего приложения, создайте таблицы и заполните каталог:

```powershell
# Папка: yaneMedia/ (корень проекта)
docker compose exec -T backend npm run db:migrate
docker compose exec -T backend npm run catalog:sync
```

Откройте **[localhost:5173](http://localhost:5173)**. Для torrent-просмотра войдите в аккаунт с подтверждённой почтой. Для создания нового аккаунта нужна настроенная отправка писем; гостевой просмотр внешних источников работает без неё.

При следующих запусках достаточно команды `start.ps1 -Mode Home -Build`. Пароли и ключ Prowlarr готовятся один раз.

Если нужно проверить готовность torrent-сервиса:

```powershell
# Папка: yaneMedia/ (корень проекта)
Invoke-RestMethod http://localhost:3000/api/v1/health/ready/torrent
```

Ответ `ready` означает, что сервис готов. Он не гарантирует, что у выбранной раздачи есть доступные участники.
