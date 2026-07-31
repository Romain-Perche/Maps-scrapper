// lib/zip.js — écriture d'archives ZIP sans dépendance.

// Construit un buffer ZIP avec la méthode STORED (aucune compression, idéal pour du JPEG).
// files: Array<{ filename: string, data: Buffer }>
function buildZip(files) {
  const localHeaders = [];
  const chunks = [];
  let offset = 0;

  for (const { filename, data } of files) {
    const name   = Buffer.from(filename, 'utf8');
    const crc    = crc32(data);
    const size   = data.length;
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0);   // local file header signature
    header.writeUInt16LE(20, 4);            // version needed
    header.writeUInt16LE(0, 6);             // general purpose bit flag
    header.writeUInt16LE(0, 8);             // compression method: STORED
    header.writeUInt16LE(0, 10);            // last mod time
    header.writeUInt16LE(0, 12);            // last mod date
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(size, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    name.copy(header, 30);

    localHeaders.push({ name, crc, size, offset });
    chunks.push(header, data);
    offset += header.length + size;
  }

  // Central directory
  const cdChunks = [];
  let cdSize = 0;
  for (const { name, crc, size, offset: lhOffset } of localHeaders) {
    const cd = Buffer.alloc(46 + name.length);
    cd.writeUInt32LE(0x02014b50, 0);   // central directory signature
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(lhOffset, 42);
    name.copy(cd, 46);
    cdChunks.push(cd);
    cdSize += cd.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...cdChunks, eocd]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

module.exports = { buildZip, crc32 };
