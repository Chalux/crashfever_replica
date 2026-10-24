import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = path.join(projectRoot, 'reverse/original-apk/unpacked/assets/00_common');
const outputRoot = path.join(projectRoot, 'assets/resources/ui/common/dialog/art');
const manifestPath = path.join(projectRoot, 'reverse/original-apk/dialog-assets-manifest.json');

// Recovered from known PNG structure; verified independently against every chunk
// CRC of the selected files. This is a resource-byte inference, not native-code analysis.
const xorKey = Buffer.from('f01374af4c0d4819cbf6fb584478b4f29a0810509cd52cadf833351565e620147c', 'hex');
const prefixLength = 1280;
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const filenames = [
    'bgi_DialogFrame.png',
    'bgi_DialogFrame_100.png',
    'bgi_DialogTitle.png',
    'bgi_DialogTitle_L.png',
    'btn_DialogBlue.png',
    'btn_DialogGreen.png',
    'btn_DialogRed.png',
    'btn_DialogClose.png',
    'btn_DialogBlue02.png',
    'btn_DialogRed02.png',
];

const crcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return crc >>> 0;
});

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function verifyPng(bytes) {
    assert(bytes.subarray(0, 8).equals(signature), 'Invalid PNG signature');
    const chunks = [];
    const idat = [];
    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const size = bytes.readUInt32BE(offset);
        assert(size <= bytes.length - offset - 12, 'Truncated PNG chunk');
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + size)), bytes.readUInt32BE(offset + 8 + size), `${type} CRC mismatch`);
        chunks.push(type);
        if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + size));
        offset += size + 12;
        if (type === 'IEND') break;
    }
    assert.equal(offset, bytes.length, 'Unconsumed PNG bytes');
    assert.equal(chunks[0], 'IHDR');
    assert.equal(chunks.at(-1), 'IEND');
    assert.equal(bytes.readUInt32BE(8), 13);
    const colorType = bytes[25];
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    assert(channels, 'Unsupported PNG color type');
    assert.equal(bytes[26], 0);
    assert.equal(bytes[27], 0);
    assert.equal(bytes[28], 0, 'Interlaced PNG not supported by this verifier');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const bitDepth = bytes[24];
    assert([1, 2, 4, 8, 16].includes(bitDepth));
    assert(width > 0 && height > 0);
    const rowLength = Math.ceil(width * bitDepth * channels / 8) + 1;
    const pixels = inflateSync(Buffer.concat(idat));
    assert.equal(pixels.length, rowLength * height, 'Unexpected decoded scanline size');
    for (let row = 0; row < height; row++) {
        assert(pixels[row * rowLength] <= 4, 'Invalid PNG scanline filter');
    }
    return { width, height, bitDepth, colorType, chunks, chunkCrcsVerified: true, zlibVerified: true };
}

// Validate the entire batch before writing any output.
const entries = filenames.map(filename => {
    const input = fs.readFileSync(path.join(sourceRoot, filename));
    const decoded = Buffer.from(input);
    for (let index = 0; index < Math.min(prefixLength, decoded.length); index++) {
        decoded[index] ^= xorKey[index % xorKey.length];
    }
    const verification = verifyPng(decoded);
    const destination = path.join(outputRoot, filename);
    // Never replace a manually changed image when rerunning the decoder.
    if (fs.existsSync(destination)) {
        assert(fs.readFileSync(destination).equals(decoded), `Existing output differs: ${filename}`);
    }
    return {
        filename,
        decoded,
        record: {
            source: path.relative(projectRoot, path.join(sourceRoot, filename)).replaceAll('\\', '/'),
            output: path.relative(projectRoot, destination).replaceAll('\\', '/'),
            sourceSha256: sha256(input),
            outputSha256: sha256(decoded),
            bytes: decoded.length,
            ...verification,
        },
    };
});

fs.mkdirSync(outputRoot, { recursive: true });
for (const entry of entries) {
    const destination = path.join(outputRoot, entry.filename);
    if (!fs.existsSync(destination)) fs.writeFileSync(destination, entry.decoded, { flag: 'wx' });
    console.log(`${entry.filename}: ${entry.record.width} x ${entry.record.height}, CRC and zlib OK`);
}
fs.writeFileSync(manifestPath, JSON.stringify({
    evidenceType: 'offline-resource-bytes',
    sourceApkSha256: '295a40799271d65f38acb7dbbfc5d200be3955acc1101809d354b21764b73497',
    algorithm: { kind: 'repeating-xor-prefix', prefixLength, xorKeyHex: xorKey.toString('hex') },
    limitations: ['Only the listed resource files were verified.', 'Original layout, nine-slice insets, and runtime button roles are not established by PNG decoding.'],
    entries: entries.map(entry => entry.record),
}, null, 2) + '\n');
