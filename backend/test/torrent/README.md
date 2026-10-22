# Torrent contract tests

Run the torrent area and its HTTP error boundary, without project-wide checks:

```powershell
cd backend
npm.cmd run test:torrent
cd ../frontend
bun run test:torrent
```

Default tests use loopback HTTP fakes, temporary HLS files, repository doubles and a DOM.
They do not use PostgreSQL, a running TorrServer, public trackers or peers. The frontend
command runs API/model contracts and DOM components in separate Bun processes; each DOM
test unmounts React, clears queries/storage and resets the account cancellation scope.

| Contract                                                                                                         | Coverage                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Magnet/metainfo validation, unsafe paths and bounded input                                                       | `torrent-input.spec.ts`, `torrent-security.spec.ts`                                                          |
| State graph, owner isolation, idempotency and conflicts                                                          | `torrent-session.state.spec.ts`, input/security/playback suites; PostgreSQL suite below                      |
| Opaque file mapping and probe/codecs policy                                                                      | `torrent-metadata.spec.ts`, `torrent-media-policy.spec.ts`                                                   |
| Playback admission, first segment before ready, explicit retry, failed generation cleanup                        | `torrent-playback.spec.ts`                                                                                   |
| Delayed metadata/no peers, upstream outage/recovery, multi-file mapping, deadline, stop, restart and idle expiry | `torrent-engine-lifecycle.integration.spec.ts`: real HTTP TorrServer client + reconciler, persistence double |
| Bounded adapter responses, range validation, timeout, client disconnect and error mapping                        | `torrserver-client.spec.ts`: real loopback HTTP server                                                       |
| Playlist rewriting, owner checks, generation/window invalidation, init and segment bytes                         | `torrent-hls.spec.ts`: HTTP gateway with temporary artifacts                                                 |
| Ref-count cleanup, failed cleanup retry and orphan grace                                                         | `torrent-session-reconciler.spec.ts`                                                                         |
| Response/log redaction, rate limits, CSRF and origin checks                                                      | `torrent-security.spec.ts`, `test/platform/http/api-exception.filter.spec.ts`                                |
| Safe metrics and independent feature readiness                                                                   | `torrent-observability.spec.ts`                                                                              |
| Discovery, candidate ownership, safe download, ranking and partial source failure                                | discovery/JacRed/Prowlarr suites                                                                             |
| Protected flow, file choice, explicit HLS start/error/retry, progress, Stop and account reset                    | `frontend/test/torrentLifecycle.test.tsx`: real React/query/API mapping, fake fetch and HLS library          |
| Terminal polling, retry bounds, abort, account cache isolation and login return                                  | frontend boundary/social-access suites                                                                       |

The HLS renderer test checks callbacks, credentials and absolute torrent progress with
a fake HLS library. It does not decode video or replace the browser matrix in T-023.
The HTTP lifecycle fixture does not prove database transactions; those are checked separately.

## Opt-in PostgreSQL and FFmpeg

On an idle development stand, first confirm there are no active torrent sessions. PostgreSQL
admission tests use the configured database, create isolated users and delete them afterward;
global quotas still apply. FFmpeg tests generate their own short local video and hostile playlist.
Neither suite uses the live engine or public torrents.

From the project root, using the running backend image containing the matching source/tests:

```powershell
docker compose exec -T -e TORRENT_POSTGRES_TEST=1 -e TORRENT_GATEWAY_TEST=1 backend npm test -- --runInBand test/torrent/torrent-session-postgres.integration.spec.ts test/torrent/torrent-gateway.integration.spec.ts
```

These cover PostgreSQL atomic metadata/file publication, CAS, ownership, idempotent playback,
concurrency quotas and logout, plus actual FFprobe/FFmpeg HLS output and hostile input isolation.
They are skipped by the default command. Host PostgreSQL tests need a reachable `DATABASE_URL`;
the current Compose database has no host port. FFmpeg tests need both binaries on `PATH`.

Real TorrServer smoke remains a separate, explicitly selected isolated T-001 fixture exercise
under `docs/torrent-spike/`. Those historical scripts target their own disposable spike stack;
some reset that engine. They are never invoked by `test:torrent` or pointed at the application
engine. Public releases and their peer availability are outside this deterministic suite.
