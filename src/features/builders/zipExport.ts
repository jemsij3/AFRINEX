import type { BuilderFile } from '../../../shared/types.ts';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

export function buildZipBlob(files: BuilderFile[]): Blob {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const cleanPath = file.path.replace(/^\/+/, '');
    const nameBytes = encoder.encode(cleanPath);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32LE(localView, 0, 0x04034b50); // Signature
    writeUint16LE(localView, 4, 20); // Version needed
    writeUint16LE(localView, 6, 0x0800); // UTF-8 filename flag
    writeUint16LE(localView, 8, 0); // Store method (no compression)
    writeUint16LE(localView, 10, 0); // Mod time
    writeUint16LE(localView, 12, 0); // Mod date
    writeUint32LE(localView, 14, checksum);
    writeUint32LE(localView, 18, contentBytes.length);
    writeUint32LE(localView, 22, contentBytes.length);
    writeUint16LE(localView, 26, nameBytes.length);
    writeUint16LE(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, contentBytes);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32LE(centralView, 0, 0x02014b50);
    writeUint16LE(centralView, 4, 20);
    writeUint16LE(centralView, 6, 20);
    writeUint16LE(centralView, 8, 0x0800);
    writeUint16LE(centralView, 10, 0);
    writeUint16LE(centralView, 12, 0);
    writeUint16LE(centralView, 14, 0);
    writeUint32LE(centralView, 16, checksum);
    writeUint32LE(centralView, 20, contentBytes.length);
    writeUint32LE(centralView, 24, contentBytes.length);
    writeUint16LE(centralView, 28, nameBytes.length);
    writeUint16LE(centralView, 30, 0);
    writeUint16LE(centralView, 32, 0);
    writeUint16LE(centralView, 34, 0);
    writeUint16LE(centralView, 36, 0);
    writeUint32LE(centralView, 38, 0);
    writeUint32LE(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  }

  let centralSize = 0;
  for (const chunk of centralChunks) {
    centralSize += chunk.length;
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32LE(endView, 0, 0x06054b50);
  writeUint16LE(endView, 4, 0);
  writeUint16LE(endView, 6, 0);
  writeUint16LE(endView, 8, files.length);
  writeUint16LE(endView, 10, files.length);
  writeUint32LE(endView, 12, centralSize);
  writeUint32LE(endView, 16, offset);
  writeUint16LE(endView, 20, 0);

  const totalLength = offset + centralSize + endRecord.length;
  const archive = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of [...localChunks, ...centralChunks, endRecord]) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }

  return new Blob([archive], { type: 'application/zip' });
}

export function downloadProjectZip(projectName: string, files: BuilderFile[]): void {
  if (files.length === 0 || typeof document === 'undefined') return;
  const slug =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'afrinex-project';

  const blob = buildZipBlob(files);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug}.zip`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
