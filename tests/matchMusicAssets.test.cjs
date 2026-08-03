const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packDirectory = path.join(root, 'public', 'audio', 'scicon-match-music-v1');
const manifestPath = path.join(packDirectory, 'manifest.json');

const expectedTracks = [
  {
    id: 'open-orbit-relay',
    title: 'Open Orbit Relay',
    url: '/audio/scicon-match-music-v1/music-open-orbit-relay.wav'
  },
  {
    id: 'ion-veil-pursuit',
    title: 'Ion Veil Pursuit',
    url: '/audio/scicon-match-music-v1/music-ion-veil-pursuit.wav'
  },
  {
    id: 'event-horizon-run',
    title: 'Event Horizon Run',
    url: '/audio/scicon-match-music-v1/music-event-horizon-run.wav'
  }
];

const readManifest = () => {
  assert.ok(fs.existsSync(manifestPath), 'the match-music manifest should exist');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
};

const publicUrlToFile = (url) => path.join(root, 'public', ...url.split('/').filter(Boolean));

const inspectPcmWav = (buffer, trackId) => {
  assert.ok(buffer.length >= 12, `${trackId} should include a complete RIFF/WAVE header`);
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'RIFF', `${trackId} should be a RIFF file`);
  assert.equal(buffer.subarray(8, 12).toString('ascii'), 'WAVE', `${trackId} should be a WAVE file`);

  const riffEnd = buffer.readUInt32LE(4) + 8;
  assert.equal(riffEnd, buffer.length, `${trackId} RIFF size should match the file length`);

  let format = null;
  let dataLength = null;
  let offset = 12;
  while (offset + 8 <= riffEnd) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    assert.ok(chunkEnd <= riffEnd, `${trackId} contains a truncated ${chunkId} chunk`);

    if (chunkId === 'fmt ') {
      assert.equal(format, null, `${trackId} should contain only one fmt chunk`);
      assert.ok(chunkLength >= 16, `${trackId} should include a complete PCM fmt chunk`);
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRateHz: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitDepth: buffer.readUInt16LE(chunkStart + 14)
      };
    } else if (chunkId === 'data') {
      assert.equal(dataLength, null, `${trackId} should contain only one data chunk`);
      dataLength = chunkLength;
    }

    offset = chunkEnd + (chunkLength % 2);
    assert.ok(offset <= riffEnd, `${trackId} has an invalid padded ${chunkId} chunk`);
  }

  assert.equal(offset, riffEnd, `${trackId} should not contain a partial trailing chunk`);
  assert.ok(format, `${trackId} should include a fmt chunk`);
  assert.notEqual(dataLength, null, `${trackId} should include a data chunk`);
  assert.equal(format.audioFormat, 1, `${trackId} should use uncompressed PCM`);
  assert.equal(
    format.blockAlign,
    format.channels * (format.bitDepth / 8),
    `${trackId} block alignment should match its channel and bit-depth metadata`
  );
  assert.equal(
    format.byteRate,
    format.sampleRateHz * format.blockAlign,
    `${trackId} byte rate should match its PCM layout`
  );
  assert.equal(dataLength % format.blockAlign, 0, `${trackId} data should contain whole sample frames`);

  return {
    ...format,
    dataLength,
    durationSeconds: dataLength / format.byteRate
  };
};

test('match-music manifest preserves the three original track identities and public paths', () => {
  const manifest = readManifest();

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, 'scicon-match-music-v1');
  assert.ok(Array.isArray(manifest.tracks));
  assert.deepEqual(
    manifest.tracks.map(({ id, title, url }) => ({ id, title, url })),
    expectedTracks
  );
  assert.equal(new Set(manifest.tracks.map(({ id }) => id)).size, expectedTracks.length);
});

test('match-music files are intact mono 32 kHz 16-bit PCM WAVE assets', () => {
  const manifest = readManifest();

  for (const track of manifest.tracks) {
    const filePath = publicUrlToFile(track.url);
    assert.ok(fs.existsSync(filePath), `${track.id} should exist at ${track.url}`);
    assert.ok(fs.statSync(filePath).isFile(), `${track.id} should resolve to a file`);

    const buffer = fs.readFileSync(filePath);
    const wav = inspectPcmWav(buffer, track.id);
    assert.equal(wav.channels, 1, `${track.id} should be mono`);
    assert.equal(wav.sampleRateHz, 32_000, `${track.id} should use a 32 kHz sample rate`);
    assert.equal(wav.bitDepth, 16, `${track.id} should use 16-bit samples`);

    assert.equal(track.channels, wav.channels, `${track.id} channel metadata should match the WAV`);
    assert.equal(track.sampleRateHz, wav.sampleRateHz, `${track.id} sample-rate metadata should match the WAV`);
    assert.equal(track.bitDepth, wav.bitDepth, `${track.id} bit-depth metadata should match the WAV`);
    assert.equal(track.byteLength, buffer.length, `${track.id} byte-length metadata should match the file`);
    assert.ok(
      Math.abs(track.durationSeconds - wav.durationSeconds) <= 0.001,
      `${track.id} duration metadata should match the WAV`
    );
    assert.match(track.sha256, /^[a-f0-9]{64}$/, `${track.id} should declare a SHA-256 digest`);
    assert.equal(
      crypto.createHash('sha256').update(buffer).digest('hex'),
      track.sha256,
      `${track.id} SHA-256 metadata should match the file`
    );
  }
});

test('match-music loop timing is coherent and its declared generator is present', () => {
  const manifest = readManifest();
  const { bpm, bars, meter, loop } = manifest.sharedTiming;

  assert.equal(bpm, 148);
  assert.equal(bars, 8);
  assert.equal(meter, '4/4');
  assert.equal(loop, true);

  const beatsPerBar = Number(meter.split('/')[0]);
  const gridDurationSeconds = bars * beatsPerBar * (60 / bpm);
  for (const track of manifest.tracks) {
    assert.equal(track.loop, true, `${track.id} should be marked as loopable`);
    assert.ok(track.durationSeconds >= 8 && track.durationSeconds <= 30, `${track.id} should have a sensible loop duration`);
    assert.ok(
      Math.abs(track.durationSeconds - gridDurationSeconds) <= 0.002,
      `${track.id} should span the shared eight-bar timing grid`
    );
    assert.ok(Number.isInteger(track.seamEndpointDelta), `${track.id} should measure its loop seam`);
    assert.ok(track.seamEndpointDelta >= 0 && track.seamEndpointDelta <= 1, `${track.id} should have a quiet sample seam`);
  }

  assert.ok(manifest.mixPolicy.seamFadeMilliseconds > 0);
  assert.ok(manifest.mixPolicy.seamFadeMilliseconds <= 20);
  assert.equal(manifest.generator, 'tools/generate-match-music.mjs');

  const generatorPath = path.join(root, ...manifest.generator.split('/'));
  assert.ok(fs.existsSync(generatorPath), 'the declared match-music generator should exist');
  assert.ok(fs.statSync(generatorPath).isFile(), 'the declared match-music generator should be a file');

  const generatorSource = fs.readFileSync(generatorPath, 'utf8');
  for (const { id } of expectedTracks) {
    assert.ok(generatorSource.includes(`id: '${id}'`), `the generator should define ${id}`);
  }
});
