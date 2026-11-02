# Первый запуск Home

Home ищет раздачи через API Jacred и скачивает их через TorrServer на вашем сервере.
Нужен Docker с Compose 2.24.4 или новее. Все команды выполняйте из корня проекта — папки с `compose.yaml`.

## 1. Подготовьте настройки

Если `backend/.env` ещё нет, скопируйте пример:

```sh
# Папка: yaneMedia/ (корень проекта)
cp backend/.env.example backend/.env
```

В `backend/.env` заполните `TMDB_API_KEY` для каталога. Адрес API поиска уже указан: `JACRED_BASE_URL=https://jacred.su`.
Можно использовать свой совместимый Jacred v1 API. Ключ и настройка индексаторов не требуются.
Пустой `JACRED_BASE_URL` отключает поиск; ручной ввод magnet/`.torrent` остаётся доступным.

Почта необязательна для гостевого запуска. Для регистрации и подтверждения аккаунта нужны `RESEND_API_KEY` и `MAIL_FROM`.
Просмотр torrent требует подтверждённого аккаунта.

## 2. Создайте пароли и запустите Home

**Windows / PowerShell:**

```powershell
# Папка: yaneMedia/ (корень проекта)
powershell -NoProfile -ExecutionPolicy Bypass -File .\torrserver\init-secrets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Mode Home -Build
```

**Linux / macOS** (для генерации паролей нужен OpenSSL):

```sh
# Папка: yaneMedia/ (корень проекта)
sh torrserver/init-secrets.sh
sh scripts/start.sh Home --build
```

Скрипт создаёт недостающие пароли TorrServer, сохраняя существующие. Backend получает до 4 ГиБ RAM, TorrServer — до 4 ГиБ.

## 3. Подготовьте базу и каталог

При первом запуске:

```sh
# Папка: yaneMedia/ (корень проекта)
docker compose exec -T backend npm run db:migrate
docker compose exec -T backend npm run catalog:sync
```

Откройте [localhost:5173](http://localhost:5173). После обновлений применяйте новые миграции командой `db:migrate`.

Для повторного запуска достаточно команды запуска Home для вашей системы из шага 2.
Повторно копировать `.env` и заполнять каталог не нужно.

Подробности: [поиск](DISCOVERY.md), [обслуживание](OPERATIONS.md).
