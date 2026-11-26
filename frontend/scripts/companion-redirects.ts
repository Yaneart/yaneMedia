import {
  companionDownload,
  companionInstallFiles,
} from '../src/features/companion/model/installation';

for (const platform of ['debian', 'arch'] as const) {
  const download = companionDownload(platform);
  if (download) {
    console.log(`handle /install/${companionInstallFiles[platform]} {
\tredir ${JSON.stringify(download)} temporary
}`);
  }
}
