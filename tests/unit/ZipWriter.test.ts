import { describe, expect, it } from 'vitest';
import { createZip, crc32 } from '../../src/export/ZipWriter';

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('createZip', () => {
  it('writes local headers, central directory and end record', () => {
    const zip = createZip([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'b.bin', data: new Uint8Array([1, 2, 3]) },
    ]);
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 10, true)).toBe(2); // entry count
    const centralStart = dv.getUint32(end + 16, true);
    expect(dv.getUint32(centralStart, true)).toBe(0x02014b50);
  });
});
