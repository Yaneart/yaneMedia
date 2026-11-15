import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const dockerAvailable = spawnSync('docker', ['compose', 'version']).status === 0;
const describeCompose = dockerAvailable ? describe : describe.skip;
const config = (isPublic: boolean, extraEnv: NodeJS.ProcessEnv = {}) =>
  JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        'compose.yaml',
        ...(isPublic ? ['-f', 'compose.public.yaml'] : []),
        'config',
        '--format',
        'json',
      ],
      { cwd: root, encoding: 'utf8', env: { ...process.env, COMPOSE_PROFILES: '', ...extraEnv } },
    ),
  );

describeCompose('Home/Public deployment configuration (Docker Compose CLI required)', () => {
  it('keeps separate backend artifacts, a shared database and a recoverable Home engine', () => {
    const home = config(false);
    const publicMode = config(true);
    expect(home.services.backend.build.target).toBe('home');
    expect(publicMode.services.backend.build.target).toBe('public');
    expect(home.services.backend.image).not.toBe(publicMode.services.backend.image);
    expect(home.services.backend.environment.TORRENT_STREAMING_ENABLED).toBe('true');
    expect(publicMode.services.backend.environment.TORRENT_STREAMING_ENABLED).toBe('false');
    expect(home.services.frontend.environment.VITE_SERVER_TORRENT_ENABLED).toBe('true');
    expect(publicMode.services.frontend.environment.VITE_SERVER_TORRENT_ENABLED).toBe('false');
    expect(publicMode.services.torrserver).toBeUndefined();
    expect(publicMode.services.backend.secrets ?? []).toEqual([]);
    expect(Object.keys(publicMode.services.backend.depends_on)).toEqual(['postgres']);
    expect(Object.keys(publicMode.services.backend.networks).sort()).toEqual(['app', 'database']);
    expect(publicMode.services.postgres.volumes).toEqual(home.services.postgres.volumes);
    expect(publicMode.services.backend.volumes).toEqual(home.services.backend.volumes);
    expect(home.services.torrserver.volumes.length).toBeGreaterThan(0);
  });

  it('removes Home engine settings while preserving independently configured search', () => {
    const publicMode = config(true);
    const env = publicMode.services.backend.environment;
    for (const key of [
      'TORRSERVER_BASE_URL',
      'TORRSERVER_USERNAME_FILE',
      'TORRSERVER_PASSWORD_FILE',
      'TORRENT_IDEMPOTENCY_SECRET_FILE',
    ]) {
      expect(env[key] ?? null).toBeNull();
    }
    const homeEnv = config(false).services.backend.environment;
    for (const key of ['JACRED_BASE_URL', 'JACRED_FALLBACK_URLS', 'KNABEN_BASE_URL']) {
      expect(env[key]).toBe(homeEnv[key]);
    }
  });

  const launchers: [string, string[]][] = [
    ['sh', ['scripts/start.sh', 'Public', '--check']],
    ...(process.platform === 'win32'
      ? [
          [
            'powershell',
            [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              'scripts/start.ps1',
              '-Mode',
              'Public',
              '-Check',
            ],
          ] as [string, string[]],
        ]
      : []),
  ];
  it.each(launchers)(
    '%s validates Public with search enabled without starting services',
    (command, args) => {
      const result = spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, COMPOSE_PROFILES: '' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Public configuration is valid. No services changed.');
    },
  );
  it.each(launchers)(
    '%s rejects a profile that would start the engine in Public',
    (command, args) => {
      const result = spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, COMPOSE_PROFILES: 'home-torrent' },
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/COMPOSE_PROFILES|home-torrent/);
    },
  );
});
