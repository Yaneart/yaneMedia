# yaneMedia

Фильмы, сериалы и аниме в одном приложении: найдите, что посмотреть, выберите источник и продолжайте с того места, где остановились.

![Главная страница yaneMedia в тёмной теме](assets/screenshots/home-dark.png)

- Каталог, поиск, подборки и фильтры.
- Выбор источника, серий, озвучки и субтитров, когда они доступны.
- Избранное, история просмотра и сохранение прогресса.
- Оценки, отзывы и профили пользователей.
- Светлая и тёмная темы, интерфейс для компьютера и телефона.

<details>
<summary>Ещё скриншоты</summary>

Главная в светлой теме:

![Главная страница yaneMedia в светлой теме](assets/screenshots/home-light.png)

Каталог фильмов:

![Каталог фильмов в тёмной теме](assets/screenshots/catalog-dark.png)

Страница фильма:

![Страница фильма с выбором источника](assets/screenshots/media-dark.png)

Мобильная версия:

<img src="assets/screenshots/mobile-dark.png" width="375" alt="Главная страница на телефоне">

</details>

## Быстрый старт

Нужен Docker с Compose **2.24.4 или новее**. Корень проекта — папка скачанного или склонированного репозитория, в которой лежит `compose.yaml`. Откройте терминал в этой папке. В примерах ниже она обозначена как `yaneMedia/`.

1. Скопируйте настройки:

   ```sh
   # Папка: yaneMedia/ (корень проекта)
   cp backend/.env.example backend/.env
   ```

2. В `backend/.env` укажите `TMDB_API_KEY` для каталога и ключи нужных источников: `KODIK_API_KEY`, `VEOVEO_API_KEY`, `FILMIX_API_KEY` (device token Filmix). Источники с ключами подключаются автоматически. API Filmix использует HTTP по явному разрешению владельца проекта; этот запрос передаёт токен без TLS. Адрес можно заменить через `FILMIX_API_BASE_URL`. Для поиска torrent используется API Jacred: `JACRED_BASE_URL` уже заполнен в примере, его можно заменить адресом своего совместимого сервиса. Почта необязательна для гостей; для регистрации заполните `RESEND_API_KEY` и `MAIL_FROM`.

3. Выберите режим: **Home** — с torrent на вашем сервере, **Public** — без серверного torrent.

   Для Home создайте пароли и запустите приложение. Пароли создаются автоматически, существующие сохраняются.

   **Windows / PowerShell:**

   ```powershell
   # Папка: yaneMedia/ (корень проекта)
   # Home
   powershell -NoProfile -ExecutionPolicy Bypass -File .\torrserver\init-secrets.ps1
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Mode Home -Build

   # Или Public
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Mode Public -Build
   ```

   **Linux / macOS:**

   ```sh
   # Папка: yaneMedia/ (корень проекта)
   # Home
   sh torrserver/init-secrets.sh
   sh scripts/start.sh Home --build

   # Или Public
   sh scripts/start.sh Public --build
   ```

4. При первом запуске создайте таблицы и заполните подборки каталога:

   ```sh
   # Папка: yaneMedia/ (корень проекта)
   docker compose exec -T backend npm run db:migrate
   docker compose exec -T backend npm run catalog:sync
   ```

   Наполнение каталога требует доступа к внешним источникам данных. После обновлений проекта применяйте новые миграции командой `db:migrate`.

Откройте **[localhost:5173](http://localhost:5173)**. API доступен на [localhost:3000/api/v1](http://localhost:3000/api/v1).

## Public и Home

| Режим      | Как работает                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------- |
| **Public** | Сайт, API и база данных. Внешние источники и локальный yaneCompanion; серверный torrent отключён. |
| **Home**   | Поиск через API Jacred, скачивание через TorrServer и обработка на вашем сервере.                 |

В скрипте запуска выберите `Public` или `Home`. Отдельная [инструкция Home](torrserver/SETUP.md) описывает первый и повторный запуск. Переключение сохраняет базу и файлы, но прерывает текущий просмотр. Backend ограничен 4 ГиБ RAM; FFmpeg работает в том же контейнере.

[`compose.yaml`](compose.yaml) задаёт Home, а [`compose.public.yaml`](compose.public.yaml) отключает домашние torrent-сервисы поверх него. Скрипты сами выбирают нужную конфигурацию.

Public пока остаётся конфигурацией для разработки: настройка домена и HTTPS ещё впереди.
Кнопка «Локальный помощник» позволяет сопрячь сайт с yaneCompanion и отозвать доступ.
В Public вкладка «Торренты» запускает локальное видео на обычной странице просмотра:
поиск или magnet/.torrent, выбор файла, озвучки, субтитров и серии. Установщики,
восстановление истории и production HTTPS-приёмка остаются следующими этапами.

## Разработка

- [Frontend](frontend/README.md) — интерфейс на React и TypeScript, запуск через Vite.
- [Backend](backend/README.md) — API на NestJS, PostgreSQL и миграции.
- [Домашний torrent](torrserver/README.md) — настройка и работа TorrServer.
