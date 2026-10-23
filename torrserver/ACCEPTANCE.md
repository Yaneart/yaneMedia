# Torrent acceptance — T-023

Run: 2026-10-22. Target: the current local Docker Compose deployment, as selected
by the operator. Windows host, Linux Docker backend and TorrServer. Two temporary,
verified accounts; existing users, secrets and volumes were preserved. Real
headless Chromium 156.0.8078.4 and Firefox 157.0 were driven through Playwright.
These are browser checks with actual media decoding, not the DOM/fake HLS tests.
Safari/macOS/iOS and physical touch devices were unavailable.

This records the UI and deployment tested on that date. The later source-picker
UI starts playback on release selection and stops/replaces the previous session
automatically; the historical Play/Stop controls and degraded notice below are
not instructions for the current UI. See [operations](OPERATIONS.md) for current
maintenance and [architecture](ARCHITECTURE.md) for the earlier spike decision.

## Browser and lifecycle evidence

| Scenario                     | Result                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest access                 | Login link preserves `/media/arrival` and `intent=torrent`; no creation before explicit submit.                                                                                                                                                                                                 |
| Discovery                    | Initial search returned 50 candidates from five movie sources, `degraded=false`. An intermittent source failure later returned 18 candidates from two sources with a visible degraded notice; another search recovered.                                                                         |
| Desktop/tablet/mobile layout | 1440, 768 and 360 px in both browsers: document width equals viewport width. Chromium screenshots were inspected. Viewport emulation does not prove native touch behavior.                                                                                                                      |
| Real torrent playback        | RuTracker sample in both browsers and BigFANGroup sample in Firefox: video frames increase, media error is null. Chromium also reports increasing decoded audio bytes. Firefox does not expose that byte counter; audible output was not assessed by a human.                                   |
| Pause/resume                 | Position remains unchanged during a three-second pause and advances again after resume in both browsers.                                                                                                                                                                                        |
| Seek outside buffered data   | Slider to 900 seconds creates a new playback generation (202); decoded playback resumes. Displayed absolute timeline survives refresh (Chromium observed approximately 15:46).                                                                                                                  |
| Disconnect/reconnect         | Ten-second browser network outage drains the buffer; playback resumes after reconnect, without a media error, in both browsers.                                                                                                                                                                 |
| Refresh                      | Same owned session is restored and plays again in both browsers. No duplicate session is created.                                                                                                                                                                                               |
| Logout                       | Firefox: account menu logout switches to guest, removes video, and subsequent authenticated session access returns 401. Backend QA records are stopped with no engine binding.                                                                                                                  |
| Stop                         | API Stop returns 204; UI recovery Stop makes the former session inaccessible (404).                                                                                                                                                                                                             |
| Two accounts                 | Foreign status, Stop, HLS master and playback commands all return 404. Two independent QA sessions also coexisted during the TTL check.                                                                                                                                                         |
| Multi-file selection         | Synthetic TS-02 upload presents only `episode-a.mp4` and `episode-b.mp4`, with opaque file references. Selecting the second video enters probing. No LAN peer was enabled; absence of peers produces `TORRENT_PROBE_TIMEOUT`.                                                                   |
| Public multi-file playback   | The official WebTorrent Sintel fixture (one MP4, nine subtitles and a poster) works through manual magnet submission, real TorrServer peers and the app HLS player in both browsers. Chromium: 317 decoded frames, increasing decoded audio bytes, no media error. Nonvideo files are excluded. |
| No video                     | TS-05 upload is accepted, then fails with `TORRENT_NO_VIDEO_FILES`; UI recovery works.                                                                                                                                                                                                          |
| No metadata/peers            | A fresh random magnet remains at zero peers and ends with `TORRENT_METADATA_TIMEOUT` after the bounded metadata wait. Stop succeeds.                                                                                                                                                            |
| Expiry                       | Only a QA session's DB expiry was shortened. Status and HLS immediately return 404; the real periodic reconciler changes it to `expired` and removes its engine binding. The eight-hour production TTL was not waited out or changed.                                                           |
| Existing online sources      | Guest Initem iframe still decodes video: 7.7 seconds, 190 frames, 864 px width, readyState 4, no media error.                                                                                                                                                                                   |

## Codec evidence

The actual deployed `TorrentStreamGateway` processed shortened synthetic assets
from T-001 through real FFprobe/FFmpeg. A local seekable-file adapter supplied
bytes instead of peers. Its generated fMP4 HLS was then played by real hls.js in
both browsers. This isolates codecs from swarm availability; it is not an
end-to-end public torrent test for each codec.

| Input                                        | Gateway behavior                                                               | Browser result                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| TS-01 MP4 H.264/AAC LC                       | Video/audio copy; first segment 2.698 s                                        | Both browsers: >5 seconds, >118 frames, 1280×720, no fatal HLS/media errors |
| TS-03 MKV H.264 + FLAC 5.1, two audio tracks | Conservative video transcode and stereo AAC transcode; first segment 2.648 s   | Both browsers: >5 seconds, >121 frames, 1280×720, no fatal HLS/media errors |
| TS-04 MKV HEVC Main10/AAC                    | H.264 8-bit SDR-path video transcode and AAC conversion; first segment 2.643 s | Both browsers: >5 seconds, >121 frames, 1280×720, no fatal HLS/media errors |

HEVC passthrough is not advertised. Input is bounded to 4096×2160; video copy is
restricted to the policy's conservative H.264 profile/pixel format/level/rate and
bitrate envelope. Other accepted video is converted to H.264, at most 1280×720;
audio outside the AAC LC stereo envelope is converted to AAC stereo, 48 kHz.
This run does not establish HDR tone mapping or accurate HDR color. UI uses the
default audio track and does not offer subtitle selection. Unsupported demuxers,
audio-only input and malformed input do not become playable sessions.

## Timing, resources and boundaries

Real app click-to-video-ready observations: Chromium 4.795–5.384 s, Firefox
6.124–6.745 s for the tested releases. These initial measurements wait for an
actual decoded video with `currentTime > 1`; they are conservative observations,
not precise first-render timestamps, cold-cache guarantees or search-to-frame SLA.
Public peer availability, content and host load change the result.

For public [Sintel](https://webtorrent.io/intro), a video-frame callback recorded
the first rendered Chromium frame **4.047 s** after the Play click (5.074 s to
the additional `currentTime > 1` assertion), Firefox **4.990 s** (6.071 s to the
assertion). These samples were not guaranteed cold.
Five Docker samples taken during the same single stream, without the isolated
codec harness running:

| Service    | CPU (`docker stats`) | Resident/container memory | PIDs |
| ---------- | -------------------- | ------------------------- | ---- |
| backend    | 3.68–4.70%           | 144.4–145.8 MiB           | 25   |
| TorrServer | 1.13–66.99%          | 84.68–97.54 MiB           | 25   |

After Stop: backend 122.6 MiB / 0.06%, TorrServer 53.78 MiB / 1.02% in a later
snapshot. Docker CPU 100% represents approximately one CPU core. These short
samples are not peak measurements, a transcode capacity benchmark, a long
soak test, or sizing guarantees. Current container limits and one-replica/worker
constraints remain applicable; rollout sizing belongs to T-024.

The engine's private-network egress firewall stayed enabled throughout. Public
browser APIs use opaque session/file/media references. Generated codec fixtures
were accessed only on a separate local test server and were not app API routes.
During active Firefox Sintel playback, actual session JSON and the HLS master
passed a check for engine identifiers, hashes, internal ports and filesystem
paths; a second account could not access the master. Expiry was also triggered
while a real FFmpeg copy worker and HLS playback were active, rather than only
during metadata discovery. The next sweep completed within approximately 50 s:
zero engine bindings, zero running FFmpeg workers and zero HLS artifact
directories remained. Cleanup metrics reported success, with zero deferred
attempts. The two QA accounts and temporary authentication tokens were removed
after these checks.

## Defect found and fixed

Uploading one `.torrent` together with its `mediaRef` incorrectly returned 400
`VALIDATION_FAILED: Too many parts`. Busboy emits the part-limit event when the
count reaches the configured threshold. The threshold is now three, while the
independent limits remain one file and one field, with existing name/type checks.

A real HTTP regression test fails before the fix and passes after it. It accepts
the valid two-part form and rejects an unknown extra field, duplicate `mediaRef`
and an extra file. Focused input/security suites: 34/34; changed-file ESLint and
Prettier pass. Only backend was rebuilt, after confirming zero active sessions.
Live TS-02 and TS-05 uploads then returned 202.

Focused validation command, from `backend`:

```powershell
npm.cmd test -- --runInBand test/torrent/torrent-security.spec.ts test/torrent/torrent-input.spec.ts
```

## Acceptance decision

T-023 is complete for the operator-selected Docker target and the available
Chromium/Firefox desktop browsers. No release-blocking defect remains from this
matrix; the multipart regression was fixed and verified live. Safari/iOS,
physical touch devices, HDR fidelity, long-running performance and human
listening are outside the evidence above. This is not authorization to expose
the feature publicly. Operational procedures are in [OPERATIONS.md](OPERATIONS.md);
rollout was excluded from T-024 by the owner. Temporary harnesses, screenshots
and generated media were removed in T-025; this report retains their measured
results and limitations. Maintained automated checks are described in the
[torrent test guide](../backend/test/torrent/README.md).
