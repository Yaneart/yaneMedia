import type { MediaSourceOption } from './mediaSource';

export const demoMediaSources = [
  {
    sourceRef: 'demo:source:kodik-dub-1080',
    kind: 'embed',
    label: 'Kodik',
    translation: {
      title: 'Дублированный',
      type: 'dub',
      language: 'ru',
    },
    quality: {
      label: '1080p',
      height: 1080,
    },
    availability: 'available',
  },
  {
    sourceRef: 'demo:source:collaps-lostfilm-1080',
    kind: 'embed',
    label: 'Collaps',
    translation: {
      title: 'LostFilm',
      type: 'voiceover',
      language: 'ru',
    },
    quality: {
      label: '1080p',
      height: 1080,
    },
    availability: 'available',
  },
  {
    sourceRef: 'demo:source:videocdn-multivoice',
    kind: 'embed',
    label: 'VideoCDN',
    translation: {
      title: 'Многоголосый закадровый',
      type: 'voiceover',
      language: 'ru',
    },
    quality: {
      label: 'Авто',
    },
    availability: 'available',
  },
] satisfies readonly MediaSourceOption[];
