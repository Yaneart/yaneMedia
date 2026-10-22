# Private TorrServer

The image downloads the pinned `MatriX.146.2` GStreamer binary verified by `T-002` and validates
its SHA-256 during the build. GStreamer routes are not used by the product playback path.

Create local credentials once before starting Compose:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\torrserver\init-secrets.ps1
```

The generated username and password stay under the ignored `storage/` directory and are mounted as
Compose secrets into TorrServer and backend. TorrServer has no published host port. Only backend
shares its internal control network; a separate single-service network provides BitTorrent egress.

The startup configuration disables DLNA, Bonjour, LPD, UPnP, built-in Rutor/Torznab discovery,
retrackers, Telegram, WebDAV, FUSE, HTTPS management, and persistent viewed state. Because the
pinned upstream release has no switch for its web UI or MCP handler, raw TorrServer binds only to
container loopback. A non-root reverse proxy exposes only `/settings`, `/torrents`, and `/stream/*`
to the backend control network; all other paths return `404`.

At startup, `firewall.sh` installs IPv4 egress rules and an IPv6 deny policy in the container's
network namespace. Private, loopback, link-local/metadata, CGNAT, benchmark, documentation and
multicast destinations are rejected, including peer and tracker addresses obtained through DNS.
Exceptions are the local engine/proxy pair, Docker DNS (original port 53 before Docker's DNAT),
and replies on established connections. Public IPv4 TCP/UDP remains available for BitTorrent.
LAN peers and trackers are intentionally unavailable. Docker networks marked `internal` alone
do not provide this outbound destination filter.

The wrapper needs root with `NET_ADMIN`, `SETUID`, `SETGID`, and `SETPCAP` only during startup.
It then executes the existing entrypoint as UID/GID 65532 with empty capability sets, an empty
bounding set and `no_new_privs`; the engine and nginx cannot change the firewall. Startup fails
if either firewall family cannot be configured. Keep this wrapper as the entrypoint when deploying.
Docker operators can still bypass container isolation and must be trusted.

Torrent API request/concurrency budgets are defined in
`backend/src/torrent/torrent-security.ts`. They currently require a **single backend replica**;
do not scale replicas without shared rate/concurrency storage. Session admission is additionally
serialized in PostgreSQL (one active session per account, two globally). Uploads are capped at
2 MiB; incomplete HTTP headers/bodies have 10/30-second server deadlines. The ingress proxy
should also enforce connection and body deadlines. Express does not trust forwarded IP headers;
configure a trusted proxy boundary explicitly before changing that behavior.

Media GET requires a verified owner session and rejects foreign Origin/Referer and cross-site
Fetch Metadata. Headerless native clients still require the same owned cookie session. Mutations
also require the application's CSRF header. FFmpeg accepts only supported file demuxers over the
local HTTP bridge; playlist demuxers and file/crypto/data protocols are excluded from input.
External MOV track references remain disabled by FFmpeg's default. Input streams, pixels, single
allocations and decoder threads are bounded; these controls do not replace codec security updates.

Focused verification (from the project root):

```powershell
docker compose config --quiet
docker compose exec -T torrserver bash -n /usr/local/bin/torrserver-firewall
docker compose exec -T torrserver iptables -nvL TORRENT_EGRESS
docker compose exec -T torrserver ip6tables -S OUTPUT
docker compose exec -T torrserver curl --noproxy '*' --fail --max-time 10 https://example.com -o /dev/null
docker compose exec -T torrserver curl --noproxy '*' --connect-timeout 2 --max-time 3 http://backend:3000/api/v1/health
docker compose exec -T -e TORRENT_GATEWAY_TEST=1 backend npm test -- --runInBand test/torrent/torrent-gateway.integration.spec.ts
```

The backend request from TorrServer must fail and increment the matching private-range REJECT
counter; backend health must succeed from the app/host. Check `/proc/1/status` inside TorrServer:
all `Cap*` fields must be zero, `Uid` must be 65532 and `NoNewPrivs` must be 1. Repeat after restart.
The gateway fixture checks normal HLS generation and a disguised HLS input with an internal HTTP
canary that must receive zero requests. PostgreSQL admission tests are opt-in and should run only
on an idle development stand: set `TORRENT_POSTGRES_TEST=1` for
`test/torrent/torrent-session-postgres.integration.spec.ts`.

References: [Docker network isolation](https://docs.docker.com/reference/compose-file/networks/),
[setpriv capability removal](https://man7.org/linux/man-pages/man1/setpriv.1.html),
[FFmpeg demuxer controls](https://ffmpeg.org/ffmpeg-formats.html), and
[input protocol controls](https://ffmpeg.org/ffmpeg-protocols.html).

# Torrent observability

`GET /api/v1/health` remains process liveness. `GET /api/v1/health/ready` returns HTTP 200
with `{ data: { status: "ready", features: { torrent: { status } } } }`, where torrent status
is `ready`, `disabled`, or `degraded`. An optional torrent dependency cannot remove the main
application from service. This does not add a database or catalog dependency probe.

`GET /api/v1/health/ready/torrent` is the strict feature probe: HTTP 503 with a fixed
`TORRENT_UNAVAILABLE` code on degradation, HTTP 200 for `ready` or intentionally `disabled`.
Enabled checks run TorrServer and FFmpeg/FFprobe checks together, with existing 5/3-second
deadlines. Concurrent requests share one probe; results, including failures, are cached for 5 seconds.

`GET /api/v1/health/torrent-metrics` serves Prometheus text directly, without the JSON `data`
wrapper. It exposes aggregate operational data and needs no account cookie. Configure production
ingress access for the monitoring audience. Responses use `Cache-Control: no-store`.

| Metric                                      | Meaning / labels                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `torrent_sessions`                          | Database counts by fixed `state`, including retained stopped/expired tombstones                                      |
| `torrent_time_to_metadata_seconds`          | Successful creation to committed video metadata, histogram                                                           |
| `torrent_time_to_first_frame_ready_seconds` | Playback preparation to published init and first complete HLS segment, histogram                                     |
| `torrent_failures_total`                    | Committed session and playback recovery failures by allowlisted `code`; unknown values collapse to `TORRENT_UNKNOWN` |
| `torrent_active_transcodes`                 | Running FFmpeg workers by `mode="copy"` or `"transcode"`; excludes completed artifacts, probes and reservations      |
| `torrent_hls_bytes_proxied_total`           | Playlist and media payload bytes passed into the response pipeline, including partial requests                       |
| `torrent_cleanup_total`                     | Stop/expiry cleanup attempts by `result="success"` or `"deferred"`; retries count separately                         |

First-frame readiness is a server-side proxy, not browser rendering or search-to-frame latency.
Byte counts exclude headers and engine input, and do not prove client delivery. Failures exclude
HTTP validation/rate-limit denials that do not change a session. Counters and histograms reset on
backend restart; session gauges come from PostgreSQL. One backend replica remains required by
the existing abuse budgets. No default process metrics, user/session IDs, media titles, hashes,
magnets, filenames, tracker labels, peer IPs, raw errors or upstream URLs are exported.

Database counts use one coalesced snapshot per 10 seconds with a 2-second SQL statement timeout.
A failed snapshot returns fixed HTTP 503 `METRICS_UNAVAILABLE`, never stale counts as success.
Active workers and process counters are sampled on each scrape. A 15-second scrape interval is
suitable for this local setup. Histogram units, counter suffixes and finite labels follow
[Prometheus conventions](https://prometheus.io/docs/practices/naming/); the dedicated registry uses
the maintained [Node client](https://github.com/prometheus/client_js).
