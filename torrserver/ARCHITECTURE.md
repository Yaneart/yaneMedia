# Torrent playback: выбор архитектуры

Единый путь: приватный TorrServer `/stream` → app-owned `TorrentStreamGateway`
с FFprobe/FFmpeg → авторизованный HLS/fMP4 yaneMedia → существующий плеер.
Browser получает только opaque app refs; engine credentials, hash, file index,
upstream URL и локальные пути остаются на сервере. Прямой byte stream и `/gst/*`
не являются публичными playback routes.

## Почему выбран FFmpeg gateway

Эксперименты T-002/T-002A от 2026-10-16 использовали `MatriX.146.2`, бинарник
`TorrServer-gst-linux-amd64`, SHA-256
`ca71d268ed326e13594567010270a7e7fa8744337fec9378a4cefd8892da97ce`.
Окружение: Debian 12, GStreamer 1.22.0, FFmpeg 5.1.9, Transmission 3.00;
изолированный локальный swarm с синтетическими файлами.

| Вариант                                   | Основание решения                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Встроенный TorrServer `/gst/*`            | NO-GO: MP4 H.264/AAC получил 502 (`only Matroska/WebM is supported`); HEVC Main10 после probe не создал HLS (`not-negotiated`). `/gst/echo` отвечал без auth. |
| TorrServer `/stream` + FFmpeg             | GO: HTTP Range поддерживает seek; MP4/MKV, audio/video conversion, progressive start, отмена и cleanup проверены одним pipeline.                              |
| Собственный libtorrent adapter + FFmpeg   | Отложен: потребовал бы второго torrent service, range reader, storage и lifecycle без доказанной продуктовой выгоды.                                          |
| qBittorrent + FFmpeg над частичным файлом | Отклонён: sequential/first-last priority не заменяют seekable stream и orchestration piece/disk cleanup.                                                      |
| Direct MP4 + `/gst/*` для MKV             | Отклонён: два playback/auth/lifecycle контракта сохраняют ограничения встроенного HLS.                                                                        |

Первый MP4 segment появился после 959204 из 30679780 bytes (3,13%), до полной
загрузки. Проверены выбор второго audio track и seek, отсутствие опубликованных
`.tmp`, немедленный отказ второго video worker при занятом capacity slot,
остановка FFmpeg и удаление session directories. No-peer/corrupt-piece cases
ограничивались supervisor deadlines 35/45 s; итоговый inventory engine был пуст.
Это исторические проверки прототипа, а не обещание текущего product timeout или UI.

| Исторический FFmpeg fixture         | Первый playable segment |
| ----------------------------------- | ----------------------: |
| MP4 H.264/AAC, remux                |                17.187 s |
| Выбранный MP4 episode из multi-file |                17.428 s |
| MKV H.264/FLAC, audio conversion    |                12.976 s |
| Вторая audio track, seek 20 s       |                24.927 s |
| HEVC Main10, video conversion       |                16.463 s |

Эти timings ограничивал единственный локальный seeder (~65.6 kB/s); это не browser
first-frame SLA. Отдельно 30 s HEVC 720p → H.264 720p/3 Mbit/s на Intel Xeon
E5-2680 v3 (container 4 CPU/4 GiB) заняли 11.894 s, 2.78x realtime, max RSS
208612 kB (~204 MiB). Результат не доказывает capacity для 1080p/4K/HDR или
нескольких transcodes. Сохраняется глобальный лимит одного video transcode.

## Действующие ограничения и проверки

HLS/fMP4 использует сегменты около 2 s, окно шести сегментов, atomic publication
и удаление старых файлов. Текущую codec policy определяет
`backend/src/torrent/torrent-media-policy.ts`; реализацию и cleanup —
`torrent-stream.gateway.ts` и reconciler. Исторический remux не гарантирует copy
любого H.264 input: фактические параметры должны пройти текущую policy.

UI использует default audio; выбор audio/subtitle не заявлен. Для несовместимого
video output ограничен H.264 1280×720, audio преобразуется в AAC stereo при
необходимости. HDR fidelity, Safari/iOS и длительная нагрузка не доказаны.
[Browser acceptance](ACCEPTANCE.md) фиксирует более позднюю проверку реального
приложения и границы измерений; [эксплуатация](OPERATIONS.md) — обслуживание,
лимиты, приватную сеть и восстановление.

Одноразовый spike Compose, generated media и QA harnesses удалены при уборке T-025
после переноса выводов. Неиспользуемый остаток upstream checkout не участвует
в запуске или штатных тестах.
Повторяемые проверки описаны в [torrent test guide](../backend/test/torrent/README.md):
FFmpeg fixture генерирует вход сам; HTTP/DB contracts проверяются отдельно.
Новая real-engine/browser приёмка требует отдельного изолированного теста,
разрешённого контента и проверки Stop/expiry cleanup. Startup firewall рабочего
engine не ослабляют ради локального test swarm.
