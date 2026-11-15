import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

// Opt-in: existing Docker images, isolated database/volumes/ports, no public torrent or provider traffic.
const describeDocker = process.env.LC012_DOCKER_TEST === '1' ? describe : describe.skip;
const execute = promisify(execFile);
const root = resolve(__dirname, '../../..');

describeDocker('LC-012 Docker Home -> Public -> Home', () => {
  it('preserves account/library/assets/engine data and removes server delivery from Public', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'yanemedia-lc012-'));
    const project = `yanemedia-lc012-${randomBytes(4).toString('hex')}`;
    const override = join(scratch, 'compose.fixture.yaml');
    const envFile = join(scratch, 'backend.env');
    const mediaDir = join(scratch, 'media');
    const profileDir = join(scratch, 'profiles');
    const token = randomBytes(32).toString('base64url');
    const user = randomUUID();
    const media = `work_${randomUUID()}`;
    const homeSession = `torrent_session_${randomBytes(16).toString('base64url')}`;
    const origin = 'http://localhost:5173';
    const docker = async (args: string[], input?: string) => {
      const child = execute('docker', args, {
        cwd: root,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, COMPOSE_PROFILES: '' },
      });
      if (input !== undefined) child.child.stdin!.end(input);
      return (await child).stdout.trim();
    };
    const composeArgs = (isPublic: boolean) => [
      'compose',
      '-p',
      project,
      '-f',
      'compose.yaml',
      '-f',
      override,
      ...(isPublic ? ['-f', 'compose.public.yaml'] : []),
    ];
    const compose = (isPublic: boolean, args: string[], input?: string) =>
      docker([...composeArgs(isPublic), ...args], input);
    const sql = (statement: string) =>
      compose(
        false,
        [
          'exec',
          '-T',
          'postgres',
          'psql',
          '-XAt',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'yanemedia',
          '-d',
          'yanemedia',
        ],
        statement,
      );
    const snapshot = () =>
      sql(`SELECT jsonb_build_object(
      'account', (SELECT row_to_json(u) FROM users u WHERE id='${user}'),
      'history', (SELECT jsonb_agg(h) FROM history_items h WHERE user_id='${user}'),
      'favorites', (SELECT jsonb_agg(f) FROM favorites f WHERE user_id='${user}'),
      'progress', (SELECT jsonb_agg(c) FROM continue_watching_items c WHERE user_id='${user}'),
      'home_session', (SELECT row_to_json(t) FROM torrent_sessions t WHERE session_id='${homeSession}'));`);
    const baseUrl = async (isPublic: boolean) =>
      `http://${await compose(isPublic, ['port', 'backend', '3000'])}/api/v1`;
    const request = (base: string, path: string) =>
      fetch(`${base}${path}`, {
        headers: { Cookie: `yanemedia_session=${token}`, Origin: origin },
        signal: AbortSignal.timeout(5000),
      });
    const waitReady = async (isPublic: boolean) => {
      const base = await baseUrl(isPublic);
      for (let attempt = 0; attempt < 90; attempt++) {
        const id = await compose(isPublic, ['ps', '-a', '-q', 'backend']);
        const running = await docker(['inspect', '--format', '{{.State.Running}}', id]);
        if (running !== 'true') throw new Error('Fixture backend exited before becoming ready');
        try {
          if ((await request(base, '/health')).ok) return base;
        } catch {
          /* container starting */
        }
        await new Promise((done) => setTimeout(done, 1000));
      }
      throw new Error('Fixture backend did not become ready');
    };
    try {
      await Promise.all([mkdir(mediaDir), mkdir(profileDir), writeFile(envFile, '')]);
      await writeFile(join(mediaDir, 'keep.txt'), 'media survives mode switch');
      await writeFile(join(profileDir, 'keep.txt'), 'profile survives mode switch');
      const secretPaths = Object.fromEntries(
        ['username', 'password', 'idempotency'].map((name) => [name, join(scratch, name)]),
      );
      await writeFile(
        override,
        `services:
  postgres:
    ports: !reset []
  backend:
    env_file: !override [${JSON.stringify(envFile)}]
    environment:
      NODE_ENV: test
      JACRED_BASE_URL: ""
      JACRED_FALLBACK_URLS: ""
      KNABEN_BASE_URL: ""
    ports: !override ["127.0.0.1::3000"]
    volumes: !override
      - type: bind
        source: ${JSON.stringify(mediaDir)}
        target: /app/storage/media-assets
      - type: bind
        source: ${JSON.stringify(profileDir)}
        target: /app/storage/profile-assets
  torrserver:
    image: yanemedia-torrserver
secrets:
  torrserver_username:
    file: ${JSON.stringify(secretPaths.username)}
  torrserver_password:
    file: ${JSON.stringify(secretPaths.password)}
  torrent_idempotency:
    file: ${JSON.stringify(secretPaths.idempotency)}
`,
      );
      // Fresh Public must work even when Home credential files do not exist.
      await compose(true, ['up', '-d', '--no-build', '--wait', 'postgres']);
      await compose(true, ['run', '--rm', '--no-deps', 'backend', 'npm', 'run', 'db:migrate']);
      const initialConfig = JSON.parse(await compose(true, ['config', '--format', 'json']));
      expect(initialConfig.services.backend.environment.TORRSERVER_BASE_URL ?? null).toBeNull();
      await compose(true, ['up', '-d', '--no-build', 'backend']);
      const initialContainer = JSON.parse(
        await docker(['inspect', await compose(true, ['ps', '-a', '-q', 'backend'])]),
      )[0];
      expect(
        initialContainer.Config.Env.filter((value: string) =>
          /^(TORRSERVER_(?:BASE_URL|USERNAME_FILE|PASSWORD_FILE)|TORRENT_IDEMPOTENCY_SECRET_FILE)=/.test(
            value,
          ),
        ),
      ).toEqual([]);
      await waitReady(true);
      console.info('LC012: fresh Public starts and migrates without Home credentials');
      for (const [name, path] of Object.entries(secretPaths))
        await writeFile(
          path,
          name === 'username' ? 'fixture-user' : randomBytes(32).toString('base64'),
        );
      const credentialSnapshot = await Promise.all(
        Object.values(secretPaths).map((path) => readFile(path, 'utf8')),
      );
      await sql(`INSERT INTO users(id,handle,display_name,email,password_hash,email_verified_at) VALUES('${user}','fixture_user','Fixture','fixture@example.invalid','fixture-only',now());
        INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('${createHash('sha256').update(token).digest('hex')}','${user}',now()+interval '1 day');
        INSERT INTO media_works(media_ref,type,slug) VALUES('${media}','movie','fixture-work');
        INSERT INTO history_items(user_id,media_ref) VALUES('${user}','${media}');
        INSERT INTO favorites(user_id,media_ref) VALUES('${user}','${media}');
        INSERT INTO continue_watching_items(user_id,media_ref,source_ref,position_seconds,duration_seconds) VALUES('${user}','${media}','torrent:${homeSession}',42,120);
        INSERT INTO torrent_sessions(session_id,owner_id,media_ref,state,expires_at,idle_expires_at) VALUES('${homeSession}','${user}','${media}','stopped',now()+interval '1 day',now()+interval '1 day');`);
      const saved = await snapshot();
      let engineDataWritten = false;
      for (const isPublic of [false, true, false]) {
        if (isPublic) await compose(false, ['stop', 'backend', 'torrserver']);
        await compose(isPublic, ['up', '-d', '--no-build', 'backend']);
        const base = await waitReady(isPublic);
        const readiness = await (await request(base, '/health/ready')).json();
        expect(readiness.data).toEqual({
          status: 'ready',
          features: { torrent: { status: isPublic ? 'disabled' : 'ready' } },
        });
        expect((await (await request(base, '/health/ready/torrent')).json()).data.status).toBe(
          isPublic ? 'disabled' : 'ready',
        );
        expect((await (await request(base, '/auth/me')).json()).data.user.email).toBe(
          'fixture@example.invalid',
        );
        const progress = (await (await request(base, '/continue-watching')).json()).data.entries;
        expect(progress[0]).toMatchObject({ mediaRef: media, positionSeconds: 42 });
        expect((await request(base, '/torrent-discovery/candidates?mediaRef=invalid')).status).toBe(
          400,
        );
        expect(await snapshot()).toBe(saved);
        expect(await readFile(join(mediaDir, 'keep.txt'), 'utf8')).toBe(
          'media survives mode switch',
        );
        expect(await readFile(join(profileDir, 'keep.txt'), 'utf8')).toBe(
          'profile survives mode switch',
        );
        expect(
          await Promise.all(Object.values(secretPaths).map((path) => readFile(path, 'utf8'))),
        ).toEqual(credentialSnapshot);
        const info = JSON.parse(
          await docker(['inspect', await compose(isPublic, ['ps', '-q', 'backend'])]),
        )[0];
        if (isPublic) {
          expect(
            info.Config.Env.some((value: string) =>
              /^(TORRSERVER_(?:BASE_URL|USERNAME_FILE|PASSWORD_FILE)|TORRENT_IDEMPOTENCY_SECRET_FILE)=/.test(
                value,
              ),
            ),
          ).toBe(false);
          expect(
            info.Mounts.some((mount: { Destination: string }) =>
              mount.Destination.startsWith('/run/secrets'),
            ),
          ).toBe(false);
          expect(Object.keys(info.NetworkSettings.Networks).sort()).toEqual(
            [`${project}_app`, `${project}_database`].sort(),
          );
          expect(
            (await compose(false, ['ps', '--status', 'running', '--services'])).split(/\r?\n/),
          ).not.toContain('torrserver');
          await compose(true, [
            'exec',
            '-T',
            'backend',
            'sh',
            '-c',
            '! command -v ffmpeg && ! command -v ffprobe && ! test -e dist/torrent/torrent.module.js && ! test -e dist/torrent/torrent-stream.gateway.js && ! test -d src',
          ]);
          expect((await request(base, '/torrent-sessions')).status).toBe(404);
          expect((await request(base, '/health/torrent-metrics')).status).toBe(404);
          const processes = await compose(true, ['top', 'backend']);
          expect(processes).not.toMatch(/ffmpeg|ffprobe|TorrServer/);
        } else {
          if (engineDataWritten) {
            expect(
              await compose(false, [
                'exec',
                '-T',
                '--user',
                '65532:65532',
                'torrserver',
                'cat',
                '/config/lc012-marker',
              ]),
            ).toBe('keep');
          } else {
            await compose(false, [
              'exec',
              '-T',
              '--user',
              '65532:65532',
              'torrserver',
              'sh',
              '-c',
              'printf keep > /config/lc012-marker',
            ]);
            engineDataWritten = true;
          }
          await compose(false, [
            'exec',
            '-T',
            'backend',
            'sh',
            '-c',
            'command -v ffmpeg && command -v ffprobe && test -e dist/torrent/torrent.module.js',
          ]);
          expect((await request(base, '/health/torrent-metrics')).status).toBe(200);
        }
        console.info(
          `LC012: ${isPublic ? 'Public' : 'Home'} readiness, account, saved data and process boundary PASS`,
        );
      }
    } finally {
      // Only this randomly named fixture owns these containers/volumes and scratch files.
      try {
        await compose(false, ['down', '--volumes', '--remove-orphans']);
      } finally {
        if (
          resolve(scratch).startsWith(resolve(tmpdir()) + sep) &&
          project.startsWith('yanemedia-lc012-')
        )
          await rm(scratch, { recursive: true, force: true });
      }
    }
  }, 240_000);
});
