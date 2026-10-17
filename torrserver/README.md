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
