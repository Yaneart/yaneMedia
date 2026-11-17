import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '../../../yanePlayer/node_modules/playwright/index.mjs';

const home = JSON.parse(await readFile(process.env.YANE_HOME_AUDIO_STAND, 'utf8'));
const companion = JSON.parse(await readFile(process.env.YANE_PUBLIC_AUDIO_STAND, 'utf8'));
const backend = process.env.YANE_HOME_AUDIO_URL;
if (!backend) throw new Error('Set YANE_HOME_AUDIO_URL to the private test container port');
let server, browser;
let currentInfo;
const playerRequire = createRequire(resolve('../../yanePlayer/package.json'));
const modes = process.env.YANE_AUDIO_MODE ? [process.env.YANE_AUDIO_MODE] : ['public', 'home'];
const sourcePlayer = process.env.YANE_AUDIO_PLAYER_SOURCE === '1';
const expectedVersion = JSON.parse(
  await readFile('node_modules/@yaneart/yaneplayer/package.json', 'utf8'),
).version;
try {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    cacheDir: resolve('../.tools/audio-review-vite-cache'),
    plugins: [
      react(),
      {
        name: 'audio-review',
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (req.url === '/review-info') {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-store');
              res.end(JSON.stringify(currentInfo));
              return;
            }
            if (req.url === '/review') {
              res.setHeader('Content-Type', 'text/html');
              void vite
                .transformIndexHtml(
                  '/review',
                  '<!doctype html><div id="root"></div><script type="module" src="/test/fixtures/rendition-review.tsx"></script>',
                )
                .then((html) => res.end(html));
              return;
            }
            next();
          });
        },
      },
    ],
    define: {
      __PACKAGE_VERSION__: JSON.stringify('audio-review'),
      'import.meta.env.VITE_API_BASE_URL': '(globalThis.location.origin+"/api/v1")',
    },
    optimizeDeps: {
      entries: ['test/fixtures/rendition-review.tsx'],
      include: sourcePlayer ? ['@videojs/hlsjs-video', 'hls.js'] : ['@yaneart/yaneplayer'],
    },
    resolve: {
      alias: {
        '@': resolve('src'),
        ...(sourcePlayer
          ? {
              '@yaneart/yaneplayer': resolve('../../yanePlayer/src/index.ts'),
              'yaneplayer:jassub': resolve('../../yanePlayer/node_modules/jassub/dist/jassub.js'),
              '@videojs/hlsjs-video': playerRequire.resolve('@videojs/hlsjs-video'),
              'hls.js': resolve('../../yanePlayer/node_modules/hls.js/dist/hls.mjs'),
            }
          : {}),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      hmr: false,
      fs: {
        allow: [
          process.cwd(),
          resolve('../../yanePlayer'),
          resolve('../.tools/audio-review-vite-cache'),
        ],
      },
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReq', (req) => {
              req.setHeader('origin', 'http://localhost:5173');
              req.setHeader('referer', 'http://localhost:5173/');
            });
          },
        },
      },
    },
  });
  await server.listen();
  await server.environments.client.depsOptimizer?.scanProcessing;
  await server.environments.client.warmupRequest('/test/fixtures/rendition-review.tsx');
  await server.environments.client.waitForRequestsIdle();
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
  browser = await chromium.launch();
  for (const mode of modes) {
    currentInfo = mode === 'home' ? { ...home, mode } : { ...companion, mode };
    const context = await browser.newContext();
    try {
      if (mode === 'home')
        await context.addCookies([{ name: 'yanemedia_session', value: home.cookie, url: origin }]);
      else
        await context.route('http://127.0.0.1:45723/**', async (route) => {
          const request = route.request();
          const response = await route.fetch({
            url: companion.url + new URL(request.url()).pathname,
            headers: {
              ...request.headers(),
              host: '127.0.0.1:45723',
              origin: companion.origin,
              referer: companion.origin + '/',
            },
            maxRedirects: 0,
          });
          await route.fulfill({
            response,
            headers: { ...response.headers(), 'access-control-allow-origin': origin },
          });
        });
      const page = await context.newPage();
      page.on('pageerror', (error) => console.log(mode, 'pageerror', error.message));
      page.on('response', (r) => {
        if (r.status() >= 400)
          console.log(
            mode,
            'HTTP',
            r.status(),
            new URL(r.url()).pathname.replace(/[a-f0-9]{32,64}/g, 'fixture'),
          );
      });
      await page.goto(origin + '/review');
      try {
        await page.waitForFunction(
          () =>
            window.review?.ready &&
            window.review.player()?.runtime.getSnapshot().playback === 'playing',
          null,
          { timeout: 30_000 },
        );
      } catch (error) {
        console.log(
          mode,
          'startup diagnostics',
          await page.evaluate(() => {
            const r = window.review,
              p = r?.player(),
              s = p?.runtime?.getSnapshot(),
              v = p?.shadowRoot.querySelector('video');
            return {
              ready: r?.ready,
              errors: r?.errors,
              transport: r?.transport,
              playback: s?.playback,
              intent: s?.intent,
              pending: s?.pending,
              error: s?.error,
              position: s?.positionSeconds,
              duration: s?.durationSeconds,
              timeline: r?.source?.timeline,
              native: v
                ? {
                    time: v.currentTime,
                    ready: v.readyState,
                    duration: v.duration,
                    paused: v.paused,
                    buffered: Array.from({ length: v.buffered.length }, (_, i) => [
                      v.buffered.start(i),
                      v.buffered.end(i),
                    ]),
                  }
                : null,
            };
          }),
        );
        throw error;
      }
      await page.evaluate(async () => {
        const p = window.review.player(),
          v = p.shadowRoot.querySelector('video');
        window.audioVideo = v;
        window.audioSrc = v.currentSrc;
        window.emptied = 0;
        v.addEventListener('emptied', () => window.emptied++);
        const c = (window.audioContext = new AudioContext());
        await c.resume();
        const a = c.createAnalyser();
        a.fftSize = 8192;
        c.createMediaElementSource(v).connect(a);
        a.connect(c.destination);
        window.frequency = () => {
          const b = new Uint8Array(a.frequencyBinCount);
          a.getByteFrequencyData(b);
          let peak = 20;
          for (let i = 21; i < 400; i++) if (b[i] > b[peak]) peak = i;
          return (peak * c.sampleRate) / a.fftSize;
        };
      });
      assert.equal(await page.evaluate(() => window.review.version), expectedVersion);
      await page.waitForTimeout(300);
      const before = await page.evaluate(() => ({
        snapshot: window.review.player().runtime.getSnapshot(),
        frequency: window.frequency(),
      }));
      assert(
        Math.abs(before.frequency - 440) < 20,
        mode + ' initial frequency ' + before.frequency,
      );
      await page.evaluate(() => {
        const p = window.review.player();
        return p.selectAudio(p.runtime.getSnapshot().audioTracks[1].id);
      });
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => ({
        snapshot: window.review.player().runtime.getSnapshot(),
        frequency: window.frequency(),
        same:
          window.review.player().shadowRoot.querySelector('video') === window.audioVideo &&
          window.audioVideo.currentSrc === window.audioSrc,
        emptied: window.emptied,
        errors: window.review.errors,
      }));
      assert.equal(after.same, true);
      assert.equal(after.emptied, 0);
      assert.equal(after.snapshot.error, null);
      assert.equal(after.snapshot.playback, 'playing');
      assert.equal(after.snapshot.source.revision, before.snapshot.source.revision);
      assert(Math.abs(after.frequency - 880) < 20, JSON.stringify(after));
      assert.equal(Math.round(after.snapshot.durationSeconds), 28);
      assert(
        after.snapshot.positionSeconds >= before.snapshot.positionSeconds &&
          after.snapshot.positionSeconds - before.snapshot.positionSeconds < 5,
      );
      await page.evaluate(async () => {
        const p = window.review.player();
        await p.pause();
        window.beforePause = p.runtime.getSnapshot().positionSeconds;
        await p.selectAudio(p.runtime.getSnapshot().audioTracks[0].id);
      });
      const paused = await page.evaluate(() => ({
        s: window.review.player().runtime.getSnapshot(),
        before: window.beforePause,
        emptied: window.emptied,
      }));
      assert.equal(paused.s.playback, 'paused');
      assert.equal(paused.s.intent, 'paused');
      assert.equal(Math.round(paused.s.durationSeconds), 24);
      assert.equal(paused.emptied, 0);
      assert.equal(paused.s.error, null);
      assert(Math.abs(paused.s.positionSeconds - paused.before) < 0.1);
      console.log(mode, 'playing/paused switches passed');
      await page.evaluate(async () => {
        const p = window.review.player();
        await p.seek(23);
        await p.play();
      });
      await page.waitForFunction(
        () => window.review.player().runtime.getSnapshot().playback === 'ended',
        null,
        { timeout: 15_000 },
      );
      const shortEnd = await page.evaluate(() => window.review.player().runtime.getSnapshot());
      assert.equal(Math.round(shortEnd.durationSeconds), 24);
      assert(shortEnd.positionSeconds >= 23.5);
      assert.equal(shortEnd.error, null);
      console.log(mode, 'short EOF passed');
      const beforeTail = await page.evaluate(() => ({
        src: window.audioVideo.currentSrc,
        emptied: window.emptied,
      }));
      await page.evaluate(async () => {
        const p = window.review.player();
        await p.selectAudio(p.runtime.getSnapshot().audioTracks[1].id);
        void p.play().catch((e) => window.review.errors.push(e.message));
      });
      try {
        await page.waitForFunction(
          () => {
            const s = window.review.player().runtime.getSnapshot();
            return s.playback === 'ended' && s.positionSeconds >= 27.5;
          },
          null,
          { timeout: 15_000 },
        );
      } catch (error) {
        console.log(
          mode,
          'tail diagnostics',
          await page.evaluate(() => {
            const r = window.review,
              p = r.player(),
              s = p.runtime.getSnapshot(),
              v = p.shadowRoot.querySelector('video');
            return {
              snapshot: s,
              transport: r.transport,
              errors: r.errors,
              native: {
                time: v.currentTime,
                duration: v.duration,
                paused: v.paused,
                ended: v.ended,
                buffered: Array.from({ length: v.buffered.length }, (_, i) => [
                  v.buffered.start(i),
                  v.buffered.end(i),
                ]),
              },
            };
          }),
        );
        throw error;
      }
      const tail = await page.evaluate(() => ({
        s: window.review.player().runtime.getSnapshot(),
        src: window.audioVideo.currentSrc,
        emptied: window.emptied,
      }));
      assert.equal(Math.round(tail.s.durationSeconds), 28);
      assert.equal(tail.s.error, null);
      assert.equal(tail.src, beforeTail.src);
      assert.equal(tail.emptied, beforeTail.emptied);
      console.log(mode, 'long EOF passed');
      await page.evaluate(() => {
        const p = window.review.player();
        return p.selectAudio(p.runtime.getSnapshot().audioTracks[0].id);
      });
      const clamped = await page.evaluate(() => ({
        s: window.review.player().runtime.getSnapshot(),
        src: window.audioVideo.currentSrc,
        emptied: window.emptied,
      }));
      assert.equal(Math.round(clamped.s.durationSeconds), 24);
      assert.equal(clamped.s.error, null);
      assert(clamped.s.positionSeconds <= 24.1);
      assert.equal(clamped.src, beforeTail.src);
      assert.equal(clamped.emptied, beforeTail.emptied);
      await page.evaluate(async () => {
        await window.audioContext.close();
        await window.review.stop();
      });
      console.log(
        'PASS',
        mode,
        'MediaVideoRenderer + real host API/FFmpeg, 440→880Hz, same video/MSE, paused switch, seek, actual 24/28s EOF, shorter-track clamp and cleanup',
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await server?.close();
  if (modes.includes('home'))
    await writeFile(join(dirname(process.env.YANE_HOME_AUDIO_STAND), 'stop'), 'stop');
  if (modes.includes('public'))
    await writeFile(join(dirname(process.env.YANE_PUBLIC_AUDIO_STAND), 'stop'), 'stop');
}
