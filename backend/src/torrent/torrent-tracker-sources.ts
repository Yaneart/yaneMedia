// Canonical hosts from JacRed's tracker catalog. Topic URLs are metadata only;
// discovery never fetches them or accepts them as download targets.
const source = (name: string, ...hosts: string[]) => ({ name, hosts });
export const TRACKER_SOURCES = {
  kinozal: source('Kinozal', 'kinozal.me', 'kinozal.guru', 'kinozal.tv'),
  rutracker: source('RuTracker.org', 'rutracker.org', 'rutracker.net', 'rutracker.nl'),
  nnmclub: source('NoNaMe Club', 'nnmclub.to', 'nnm-club.name', 'nnm-club.me'),
  rutor: source('Rutor', 'rutor.info', 'rutor.is', 'rutor.org'),
  megapeer: source('MegaPeer', 'megapeer.vip', 'megapeer.org', 'megapeer.ru'),
  bitru: source('BitRu', 'bitru.org'),
  toloka: source('Toloka', 'toloka.to'),
  torrentby: source('Torrent.by', 'torrent.by'),
  mazepa: source('Mazepa', 'mazepa.to'),
  lostfilm: source('LostFilm', 'lostfilm.tv', 'www.lostfilm.tv'),
  selezen: source('Selezen', 'use.selezen.club', 'selezen.club'),
  animelayer: source('AnimeLayer', 'animelayer.ru', 'www.animelayer.ru'),
  anidub: source('AniDub', 'tr.anidub.com'),
  anistar: source('AniStar', 'anistar.org', 'anistar.me'),
  anibelka: source('AniBelka', 'anibelka.com'),
  aniliberty: source('AniLiberty', 'aniliberty.top', 'anilibria.tv'),
  anifilm: source('AniFilm', 'anifilm.pro'),
  leproduction: source('LE-Production', 'le-production.online', 'www.le-production.online'),
  viruseproject: source('ViruseProject', 'viruseproject.tv'),
  korsars: source('Korsars', 'korsars.pro'),
  ultradox: source('Ultradox', 'ultradox.vip'),
  baibako: source('BaibaKo', 'baibako.tv'),
  rudub: source('RuDub', 'r4.rudub.world', 'rudub.world'),
  subsplease: source('SubsPlease', 'subsplease.org'),
  knaben: source('Knaben', 'knaben.org', 'knaben.xyz', 'api.knaben.org'),
  piratebay: source('The Pirate Bay', 'thepiratebay.org'),
  yts: source('YTS', 'yts.gg', 'yts.mx', 'yts.bz'),
  '1337x': source('1337x', '1337x.to', '1337x.st'),
  nyaasi: source('Nyaa', 'nyaa.si'),
} satisfies Record<string, { name: string; hosts: string[] }>;

export function trackerName(slug: string): string | undefined {
  const key = slug === 'thepiratebay' ? 'piratebay' : slug;
  return Object.hasOwn(TRACKER_SOURCES, key)
    ? TRACKER_SOURCES[key as keyof typeof TRACKER_SOURCES].name
    : undefined;
}

export function jacredTrackerName(slugs: string, value: string): string | undefined {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
    return;
  const claimed = slugs
    .toLowerCase()
    .split(',')
    .map((slug) => (slug.trim() === 'thepiratebay' ? 'piratebay' : slug.trim()));
  // Merged rows name several trackers but carry one topic URL. Attribute only
  // its actual host, rather than inventing copies for the other claimed sources.
  const match = Object.entries(TRACKER_SOURCES).find(
    ([slug, item]) =>
      item.hosts.includes(url.hostname) && (claimed.includes(slug) || claimed.includes('knaben')),
  );
  if (!match) return;
  const [slug, item] = match;
  if (url.pathname === '/' && !(slug === 'knaben' && url.searchParams.has('id'))) return;
  if (['kinozal', 'rutracker', 'nnmclub'].includes(slug)) {
    const topicKey = slug === 'kinozal' ? 'id' : 't';
    if (
      url.pathname !== (slug === 'kinozal' ? '/details.php' : '/forum/viewtopic.php') ||
      !/^\d{1,10}$/.test(url.searchParams.get(topicKey) ?? '') ||
      [...url.searchParams.keys()].some((key) => key !== topicKey) ||
      url.hash
    )
      return;
  }
  return item.name;
}
