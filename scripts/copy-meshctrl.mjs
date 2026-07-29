import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await copyFile('meshctrl.js', 'dist/meshctrl.js');
