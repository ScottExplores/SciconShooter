import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const directorRoot = path.resolve(testDirectory, '..');

test('Review notes stay inside the game-first level editor and annotate the actual game surface', async () => {
  const source = await readFile(path.join(directorRoot, 'src', 'editor', 'LevelEditorApp.tsx'), 'utf8');

  assert.doesNotMatch(source, /\/studio\?section=review/);
  assert.match(source, /\/level-editor\?surface=review/);
  assert.match(source, /surfaceMode === 'review' \|\| annotationMode/);
  assert.match(source, /<GameEditorCanvas/);
  assert.match(source, /<ReviewNotesPanel/);
});
