export type SupportedImage = {
  extension: 'jpg' | 'png' | 'webp';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
};

const readUInt24LE = (buffer: Buffer, offset: number) =>
  buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

function jpegDimensions(buffer: Buffer): Pick<SupportedImage, 'width' | 'height'> | undefined {
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;
    while (buffer[offset] === 0xff) offset += 1;

    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) return undefined;
    if (offset + 2 > buffer.length) return undefined;

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return undefined;

    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      if (length < 7) return undefined;
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }

    offset += length;
  }

  return undefined;
}

export function inspectImage(buffer: Buffer): SupportedImage | undefined {
  if (
    buffer.length >= 45 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buffer.readUInt32BE(8) === 13 &&
    buffer.subarray(12, 16).toString('ascii') === 'IHDR' &&
    buffer.readUInt32BE(buffer.length - 12) === 0 &&
    buffer.subarray(buffer.length - 8, buffer.length - 4).toString('ascii') === 'IEND'
  ) {
    return {
      extension: 'png',
      mimeType: 'image/png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (
    buffer.length >= 10 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  ) {
    const dimensions = jpegDimensions(buffer);
    return dimensions && { extension: 'jpg', mimeType: 'image/jpeg', ...dimensions };
  }

  if (
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP' &&
    buffer.readUInt32LE(4) + 8 === buffer.length
  ) {
    const kind = buffer.subarray(12, 16).toString('ascii');
    if (kind === 'VP8X') {
      return {
        extension: 'webp',
        mimeType: 'image/webp',
        width: readUInt24LE(buffer, 24) + 1,
        height: readUInt24LE(buffer, 27) + 1,
      };
    }
    if (kind === 'VP8 ' && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return {
        extension: 'webp',
        mimeType: 'image/webp',
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (kind === 'VP8L' && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return {
        extension: 'webp',
        mimeType: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
  }

  return undefined;
}
