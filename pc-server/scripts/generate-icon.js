const fs = require('fs');
const path = require('path');

// Create a valid 256x256 RGBA PNG file
function createValidPng(width, height) {
  const zlib = require('zlib');
  
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw pixel data: width * 4 + 1 filter byte per line
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 4 + 1);
    rawData[offset] = 0; // filter byte: None
    for (let x = 0; x < width; x++) {
      const pxOffset = offset + 1 + x * 4;
      // Vibrant blue/purple icon color
      rawData[pxOffset] = 99;    // R
      rawData[pxOffset + 1] = 102; // G
      rawData[pxOffset + 2] = 241; // B
      rawData[pxOffset + 3] = 255; // A
    }
  }

  const idatData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);
  const crc = crc32(buf.slice(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

// CRC32 calculation for PNG chunks
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const pngBuffer = createValidPng(256, 256);
const iconPath = path.join(__dirname, '..', 'public', 'icon.png');
fs.writeFileSync(iconPath, pngBuffer);
console.log('Successfully generated 256x256 valid PNG icon at public/icon.png');
