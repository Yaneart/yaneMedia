import type { MediaSourceOption } from './mediaSource';

export const demoMediaSources = [
  {
    sourceRef: 'demo:source:kodik-dub-1080',
    provider: 'kodik',
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
    url: 'https://demo.invalid/embed/kodik',
    availability: 'available',
    browserSupported: true,
  },
  {
    sourceRef: 'demo:source:collaps-lostfilm-1080',
    provider: 'collaps',
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
    url: 'https://demo.invalid/embed/collaps',
    availability: 'available',
    browserSupported: true,
  },
  {
    sourceRef: 'demo:source:videocdn-multivoice',
    provider: 'videocdn',
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
    url: 'https://demo.invalid/embed/videocdn',
    availability: 'available',
    browserSupported: true,
  },
] satisfies readonly MediaSourceOption[];
