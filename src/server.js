import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, port } from './app.js';

export { createServer, port };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(port, () => {
    console.log(`Pixel English Quest API listening on http://localhost:${port}`);
  });
}
