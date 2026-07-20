import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const stagedPath = resolve(root, 'styles', 'tailwind.generated.next.css');
const outputPath = resolve(root, 'styles', 'tailwind.generated.css');

const css = readFileSync(stagedPath);

// Publish the completed stylesheet in one write so a running Vite server never
// observes Tailwind's output file during its temporary truncated state.
writeFileSync(outputPath, css);
rmSync(stagedPath, { force: true });
