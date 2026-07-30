const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'public', 'audio', 'audio-asset-manifest.json');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const inspectPcmWav = (buffer, fileName) => {
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'RIFF', `${fileName} should be a RIFF file`);
  assert.equal(buffer.subarray(8, 12).toString('ascii'), 'WAVE', `${fileName} should be a WAVE file`);

  let offset = 12;
  let format = null;
  let dataLength = null;
  let dataStart = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    assert.ok(chunkStart + chunkLength <= buffer.length, `${fileName} contains a truncated ${chunkId} chunk`);

    if (chunkId === 'fmt ') {
      assert.ok(chunkLength >= 16, `${fileName} should include a complete PCM format chunk`);
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRateHz: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitDepth: buffer.readUInt16LE(chunkStart + 14)
      };
    } else if (chunkId === 'data') {
      dataLength = chunkLength;
      dataStart = chunkStart;
    }

    offset = chunkStart + chunkLength + (chunkLength % 2);
  }

  assert.ok(format, `${fileName} should include a fmt chunk`);
  assert.notEqual(dataLength, null, `${fileName} should include a data chunk`);
  assert.equal(format.audioFormat, 1, `${fileName} should use uncompressed PCM`);
  assert.equal(
    format.byteRate,
    format.sampleRateHz * format.blockAlign,
    `${fileName} byte rate should match its PCM layout`
  );
  assert.equal(
    format.blockAlign,
    format.channels * (format.bitDepth / 8),
    `${fileName} block alignment should match its channel and bit-depth metadata`
  );

  let maxSample = 0;
  for (let sampleOffset = dataStart; sampleOffset + 1 < dataStart + dataLength; sampleOffset += 2) {
    maxSample = Math.max(maxSample, Math.abs(buffer.readInt16LE(sampleOffset)));
  }
  const measuredSamplePeakDbfs = 20 * Math.log10(maxSample / 32768);

  return {
    ...format,
    durationSeconds: dataLength / format.byteRate,
    measuredSamplePeakDbfs
  };
};

const inspectMp3 = (buffer, fileName) => {
  let offset = 0;
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') {
    assert.ok(buffer.length >= 10, `${fileName} should include a complete ID3 header`);
    const id3Size =
      (buffer[6] << 21) |
      (buffer[7] << 14) |
      (buffer[8] << 7) |
      buffer[9];
    offset = 10 + id3Size;
  }

  while (offset + 4 <= buffer.length && !(buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0)) {
    offset += 1;
  }
  assert.ok(offset + 4 <= buffer.length, `${fileName} should contain an MPEG audio frame`);

  const header = buffer.readUInt32BE(offset);
  const versionBits = (header >>> 19) & 0x3;
  const layerBits = (header >>> 17) & 0x3;
  const bitrateIndex = (header >>> 12) & 0xf;
  const sampleRateIndex = (header >>> 10) & 0x3;
  const channelMode = (header >>> 6) & 0x3;
  const mpeg1Layer3BitratesKbps = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg1SampleRates = [44100, 48000, 32000];

  assert.equal(versionBits, 0x3, `${fileName} should use MPEG-1 audio`);
  assert.equal(layerBits, 0x1, `${fileName} should use Layer III audio`);
  assert.ok(bitrateIndex > 0 && bitrateIndex < 15, `${fileName} should use a valid MP3 bitrate`);
  assert.ok(sampleRateIndex < 3, `${fileName} should use a valid MP3 sample rate`);

  return {
    bitRateBps: mpeg1Layer3BitratesKbps[bitrateIndex] * 1000,
    sampleRateHz: mpeg1SampleRates[sampleRateIndex],
    channels: channelMode === 0x3 ? 1 : 2
  };
};

test('audio manifest hashes, byte sizes, licenses, and WAV delivery metadata match checked-in assets', () => {
  assert.ok(fs.existsSync(manifestPath), 'the audio provenance manifest should be checked in');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.scope.assets, /14 production files/);
  assert.match(manifest.scope.notInventoried, /outside this import manifest/);
  assert.match(manifest.formatPolicy.music, /MP3 at 192 kb\/s CBR/);
  assert.ok(Array.isArray(manifest.assets));
  assert.equal(manifest.assets.length, 14);

  const ids = manifest.assets.map((asset) => asset.id);
  assert.equal(new Set(ids).size, ids.length, 'manifest asset ids should be unique');
  [
    'boss-warning',
    'boss-rotary-burst',
    'mission-launch',
    'ui-click',
    'ui-confirm',
    'ui-back',
    'ui-error',
    'ui-open',
    'ui-close',
    'music-home-stillness',
    'music-map-colony',
    'music-mission-racing',
    'music-boss-battle',
    'music-final-hour'
  ].forEach((id) => assert.ok(ids.includes(id), `${id} should be documented`));

  manifest.assets.forEach((asset) => {
    assert.match(asset.path, /^\/audio\//, `${asset.id} should use a public audio path`);
    assert.match(asset.sourcePage, /^https:\/\//, `${asset.id} should retain its source page`);
    assert.match(asset.licenseUrl, /^https:\/\//, `${asset.id} should retain its license URL`);
    assert.ok(asset.license, `${asset.id} should name its license`);
    if (asset.attributionRequired) {
      assert.ok(asset.attribution, `${asset.id} should include its required attribution text`);
    }

    const filePath = path.join(root, 'public', ...asset.path.split('/').filter(Boolean));
    assert.ok(fs.existsSync(filePath), `${asset.id} should exist at ${asset.path}`);
    const buffer = fs.readFileSync(filePath);
    assert.equal(buffer.length, asset.output.byteLength, `${asset.id} byte length should match the manifest`);
    assert.equal(sha256(buffer), asset.outputSha256, `${asset.id} SHA-256 should match the manifest`);

    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.wav') {
      const wav = inspectPcmWav(buffer, asset.id);
      assert.equal(wav.sampleRateHz, asset.output.sampleRateHz, `${asset.id} sample rate should match`);
      assert.equal(wav.channels, asset.output.channels, `${asset.id} channel count should match`);
      assert.equal(wav.bitDepth, asset.output.bitDepth, `${asset.id} bit depth should match`);
      assert.ok(
        Math.abs(wav.durationSeconds - asset.output.durationSeconds) <= 0.002,
        `${asset.id} duration should match the manifest`
      );
      assert.ok(
        Math.abs(wav.measuredSamplePeakDbfs - asset.processing.measuredSamplePeakDbfs) <= 0.001,
        `${asset.id} measured sample peak should match the rendered PCM`
      );
    } else if (extension === '.mp3') {
      const mp3 = inspectMp3(buffer, asset.id);
      assert.equal(asset.output.codec, 'MP3', `${asset.id} should declare MP3 delivery`);
      assert.equal(mp3.sampleRateHz, asset.output.sampleRateHz, `${asset.id} sample rate should match`);
      assert.equal(mp3.channels, asset.output.channels, `${asset.id} channel count should match`);
      assert.equal(mp3.bitRateBps, asset.output.bitRateBps, `${asset.id} bitrate should match`);
    } else {
      assert.fail(`${asset.id} uses an unsupported delivery extension: ${extension}`);
    }
  });
});

test('new music uses MP3 delivery while retaining the original OGG provenance hashes', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const music = manifest.assets.filter((asset) => asset.id.startsWith('music-'));
  assert.equal(music.length, 5);

  music.forEach((asset) => {
    assert.equal(path.extname(asset.path), '.mp3', `${asset.id} should ship in iPhone-compatible MP3 format`);
    assert.equal(asset.processing.sourceFormat, '44.1 kHz stereo OGG Vorbis');
    assert.match(asset.processing.encoder, /libmp3lame, 192 kb\/s CBR/);
    assert.notEqual(asset.sourceSha256, asset.outputSha256, `${asset.id} should distinguish source and delivery hashes`);
    assert.ok(asset.sourceByteLength > 0, `${asset.id} should retain its source byte length`);

    const oldOggPath = path.join(
      root,
      'public',
      'audio',
      'music',
      `${path.basename(asset.path, '.mp3')}.ogg`
    );
    assert.equal(fs.existsSync(oldOggPath), false, `${asset.id} should not double-ship the source OGG`);
  });
});

test('Sonniss assets distinguish official provenance from the third-party retrieval mirror', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sonnissAssets = manifest.assets.filter((asset) => asset.license === 'Sonniss GDC Bundle License');
  assert.equal(sonnissAssets.length, 3);

  sonnissAssets.forEach((asset) => {
    assert.match(asset.sourcePage, /^https:\/\/sonniss\.com\//, `${asset.id} should link official provenance`);
    assert.match(asset.licenseUrl, /^https:\/\/sonniss\.com\//, `${asset.id} should link the official license`);
    assert.match(asset.retrievalMirrorUrl, /^https:\/\/gamesounds\.xyz\//, `${asset.id} should label the retrieval mirror`);
    assert.match(asset.retrievalMirrorNote, /not operated by Sonniss/);
    assert.equal(Object.hasOwn(asset, 'downloadUrl'), false, `${asset.id} should not imply the mirror is an official download`);
  });
});

test('retained legacy songs are hash-pinned and explicitly marked unverified', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.legacyMusic.length, 3);

  manifest.legacyMusic.forEach((asset) => {
    assert.equal(asset.status, 'legacy-unverified');
    assert.equal(asset.license, 'Unknown');
    const filePath = path.join(root, 'public', ...asset.path.split('/').filter(Boolean));
    const buffer = fs.readFileSync(filePath);
    assert.equal(sha256(buffer), asset.sha256, `${asset.title} should remain byte-for-byte pinned`);
  });
});

test('the reachable More menu carries the required music credit and accurate modification notice', () => {
  const startScreen = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');

  assert.match(startScreen, /https:\/\/opengameart\.org\/node\/118190/);
  assert.match(startScreen, /"Outer Space Music Pack" by Leonardo Paz/);
  assert.match(startScreen, /CC BY 4\.0/);
  assert.match(startScreen, /source OGG tracks were converted[\s\S]*to MP3/);
  assert.match(startScreen, /renamed, and volume-balanced for Scicon Shooter/);
  assert.match(startScreen, /https:\/\/opengameart\.org\/content\/final-hour/);
  assert.match(startScreen, /"Final Hour" by isaiah658/);
  assert.match(startScreen, /creativecommons\.org\/publicdomain\/zero\/1\.0/);
});
