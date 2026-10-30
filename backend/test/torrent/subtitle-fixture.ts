import { spawnSync } from 'node:child_process';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createSubtitleFixture(sourceOffset = 0, sparse = false, audioCodec = 'aac') {
  const root = await mkdtemp(join(tmpdir(), 'torrent-subtitle-test-'));
  const srt = join(root, 'film.rus.forced.srt');
  const ass = join(root, 'film.eng.ass');
  const file = join(root, 'film.mkv');
  await writeFile(
    srt,
    sparse
      ? '1\n00:00:01,000 --> 00:00:06,000\nEarly cue\n\n2\n00:00:35,000 --> 00:00:40,000\nOutside short window\n\n3\n00:01:58,000 --> 00:02:08,000\nBoundary overlap\n\n4\n00:05:00,000 --> 00:05:05,000\nLate cue\n'
      : '1\n00:00:01,000 --> 00:00:06,000\nРусские субтитры\n\n2\n00:02:05,000 --> 00:02:15,000\nПерекрытие перемотки\n\n3\n00:02:20,000 --> 00:02:25,000\nПосле перемотки\n',
  );
  await writeFile(
    ass,
    `[Script Info]\nScriptType: v4.00+\nPlayResX: 320\nPlayResY: 180\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,22,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,12,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:06.00,Default,,0,0,0,,{\\c&H00FFFF&}Styled subtitles\nDialogue: 0,0:02:05.00,0:02:15.00,Default,,0,0,0,,Styled overlap\nDialogue: 0,0:02:20.00,0:02:25.00,Default,,0,0,0,,After seek\n`,
  );
  const result = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=navy:size=320x180:rate=12',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:sample_rate=48000',
      '-i',
      srt,
      '-i',
      ass,
      '-t',
      sparse ? '360' : '260',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-map',
      '2:a',
      '-map',
      '3:s',
      '-map',
      '4:s',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-threads',
      '2',
      '-g',
      '24',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      audioCodec,
      '-b:a',
      audioCodec === 'ac3' ? '192k' : '32k',
      '-c:s',
      'copy',
      '-metadata:s:s:0',
      'language=rus',
      '-metadata:s:s:0',
      'title=Русский Forced',
      '-disposition:s:0',
      'forced',
      '-metadata:s:s:1',
      'language=eng',
      '-metadata:s:s:1',
      'title=English ASS SDH',
      '-disposition:s:1',
      'hearing_impaired',
      '-attach',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '-metadata:s:t:0',
      'mimetype=application/x-truetype-font',
      '-output_ts_offset',
      String(sourceOffset),
      file,
    ],
    { timeout: 30_000 },
  );
  if (result.status !== 0)
    throw new Error(`Subtitle fixture generation failed: ${result.stderr.toString()}`);
  return { root, file, srt, ass, size: (await stat(file)).size };
}
