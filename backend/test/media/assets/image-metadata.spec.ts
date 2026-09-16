import { inspectImage } from '../../../src/media/assets/image-metadata';

describe('inspectImage', () => {
  it('reads dimensions from structurally complete JPEG and WebP headers', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]);
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'ascii');
    webp.writeUInt32LE(22, 4);
    webp.write('WEBPVP8X', 8, 'ascii');
    webp.writeUIntLE(2, 24, 3);
    webp.writeUIntLE(1, 27, 3);

    expect(inspectImage(jpeg)).toEqual({
      extension: 'jpg',
      mimeType: 'image/jpeg',
      width: 3,
      height: 2,
    });
    expect(inspectImage(webp)).toEqual({
      extension: 'webp',
      mimeType: 'image/webp',
      width: 3,
      height: 2,
    });
  });

  it('rejects SVG and truncated image headers', () => {
    expect(inspectImage(Buffer.from('<svg/>'))).toBeUndefined();
    expect(inspectImage(Buffer.from([0xff, 0xd8, 0xff, 0xc0]))).toBeUndefined();
    expect(inspectImage(Buffer.from('RIFFxxxxWEBPVP8X'))).toBeUndefined();
  });
});
