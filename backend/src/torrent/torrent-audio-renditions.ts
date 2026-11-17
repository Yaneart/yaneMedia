import { randomBytes } from 'node:crypto';
import type { EngineFileKey, EngineTorrentKey } from './torrent-engine.port';
import {
  torrentSelectedDuration,
  type AudioTrack,
  type TorrentProbe,
} from './torrent-media-policy';
import type { TorrentTimeline } from './torrent-playback-window';

export type TorrentSource = { key: EngineTorrentKey; file: EngineFileKey; size: number };
export type TorrentTrackKind = 'muxed' | 'video' | 'audio';
type Port = {
  start(
    id: string,
    generation: number,
    source: TorrentSource,
    probe: TorrentProbe,
    audio: AudioTrack,
    position: number,
    kind: TorrentTrackKind,
  ): Promise<void>;
  ready(id: string, generation: number, signal: AbortSignal): Promise<TorrentTimeline>;
  stop(id: string, generation: number): Promise<void>;
  freeze(id: string, generation: number): Promise<void>;
  has(id: string, generation: number): boolean;
  ended(id: string, generation: number): boolean;
  covers(id: string, generation: number, position: number): boolean;
  confirm(id: string, generation: number, position: number): boolean;
};
export type TorrentAudioCopy = { id: string; ref: string };
type Renditions = {
  generation: number;
  source: TorrentSource;
  probe: TorrentProbe;
  controller: AbortController;
  audio?: TorrentAudioCopy;
  retired?: TorrentAudioCopy;
  pending?: TorrentAudioCopy;
  position?: number;
};

// Own the audio lifetime under the page's existing video/session generation.
// Two 8 MiB audio slots allow preparation to fail without stopping audible audio.
export class TorrentAudioRenditions {
  private readonly sets = new Map<string, Renditions>();
  constructor(private readonly port: Port) {}

  get(id: string, generation: number): Renditions | undefined {
    const set = this.sets.get(id);
    return set?.generation === generation ? set : undefined;
  }

  protectedIds(): Set<string> {
    return new Set(
      [...this.sets.values()].flatMap((set) =>
        [set.audio, set.pending, set.retired]
          .filter((copy): copy is TorrentAudioCopy => !!copy)
          .map((copy) => copy.id),
      ),
    );
  }

  async prepare(
    id: string,
    generation: number,
    source: TorrentSource,
    probe: TorrentProbe,
    audio: AudioTrack,
    position: number,
  ): Promise<void> {
    await this.port.start(id, generation, source, probe, audio, position, 'video');
    if (!this.port.has(id, generation)) throw new Error('Playback replaced');
    const set: Renditions = { generation, source, probe, controller: new AbortController() };
    this.sets.set(id, set);
    const signal = AbortSignal.any([set.controller.signal, AbortSignal.timeout(90_000)]);
    try {
      await this.port.ready(id, generation, signal);
      await this.select(id, generation, audio.trackRef, position, probe, signal);
    } catch (error) {
      await this.stop(id, generation);
      await this.port.stop(id, generation);
      throw error;
    }
  }

  async select(
    id: string,
    generation: number,
    ref: string,
    position: number,
    probe: TorrentProbe,
    caller = AbortSignal.timeout(90_000),
  ): Promise<void> {
    const set = this.get(id, generation);
    const track = probe.audioTracks.find((item) => item.trackRef === ref);
    const duration = torrentSelectedDuration(probe, ref);
    if (
      !set ||
      set.pending ||
      !track ||
      !Number.isFinite(position) ||
      position < 0 ||
      !duration ||
      position >= duration ||
      (!this.port.ended(id, generation) && !this.port.covers(id, generation, position))
    )
      throw new Error('Audio selection unavailable');
    if (set.audio?.ref === ref && this.port.covers(set.audio.id, generation, position)) return;
    const next = { id: `${id}_audio_${randomBytes(12).toString('hex')}`, ref };
    set.pending = next;
    const signal = AbortSignal.any([caller, set.controller.signal]);
    let published = false;
    try {
      if (set.retired) {
        const retired = set.retired;
        set.retired = undefined;
        await this.port.stop(retired.id, generation);
      }
      signal.throwIfAborted();
      await this.port.start(next.id, generation, set.source, probe, track, position, 'audio');
      await this.port.ready(next.id, generation, signal);
      signal.throwIfAborted();
      if (this.get(id, generation) !== set || !this.port.has(id, generation))
        throw new Error('Playback replaced');
      const previous = set.audio;
      set.retired = previous;
      set.audio = next;
      set.probe = probe;
      published = true;
      if (previous) await this.port.freeze(previous.id, generation);
    } finally {
      if (!published) await this.port.stop(next.id, generation);
      if (set.pending === next) set.pending = undefined;
    }
  }

  healthy(id: string, generation: number): boolean {
    const set = this.get(id, generation);
    return !set || !set.audio || this.port.has(set.audio.id, generation);
  }

  confirm(id: string, generation: number, position: number): boolean {
    const set = this.get(id, generation);
    if (!set?.audio) return this.port.confirm(id, generation, position);
    // A completed shorter track can retain its final frame while audio continues.
    if (
      (!this.port.ended(id, generation) && !this.port.covers(id, generation, position)) ||
      (!this.port.ended(set.audio.id, generation) &&
        !this.port.covers(set.audio.id, generation, position))
    )
      return false;
    const duration = torrentSelectedDuration(set.probe, set.audio.ref);
    if (!Number.isFinite(position) || position < 0 || !duration || position > duration + 0.1)
      return false;
    this.port.confirm(id, generation, Math.min(position, set.probe.videoEndSeconds!));
    this.port.confirm(
      set.audio.id,
      generation,
      Math.min(
        position,
        set.probe.audioTracks.find((a) => a.trackRef === set.audio!.ref)!.endSeconds!,
      ),
    );
    set.position = position;
    return true;
  }

  async stop(id: string, generation?: number): Promise<void> {
    const set = this.sets.get(id);
    if (!set || (generation !== undefined && set.generation !== generation)) return;
    this.sets.delete(id);
    set.controller.abort();
    await Promise.all(
      [set.audio, set.retired, set.pending]
        .filter((copy): copy is TorrentAudioCopy => !!copy)
        .map((copy) => this.port.stop(copy.id, set.generation)),
    );
  }
}
