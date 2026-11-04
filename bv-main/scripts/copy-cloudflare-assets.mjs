import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'dist');
const files = [
  'adminx.html',
  'app.js',
  'backend-config.js',
  'security.js',
  'styles.css',
  'ion-storm.js',
  'sw.js'
];

await mkdir(output, { recursive: true });
await Promise.all(files.map(file => copyFile(path.join(root, file), path.join(output, file))));
