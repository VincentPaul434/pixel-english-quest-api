import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { defaultDatabaseFile, port, rateLimit } from './config/app-config.js';
import { createDatabase } from './config/database.js';
import { handleApiRequest } from './routes/index.js';
import { HttpError, json } from './shared/http.js';
import { handleError } from './shared/middleware/error.middleware.js';
import { logRequest } from './shared/utils/logger.js';

export { port };

export function createServer({ databaseFile = defaultDatabaseFile } = {}) {
  const db = createDatabase({ filename: databaseFile });
  const limits = new Map();
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    const started = Date.now();
    try {
      const key = req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const existing = limits.get(key);
      const current = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + rateLimit.windowMs } : existing;
      current.count += 1;
      limits.set(key, current);
      if (current.count > rateLimit.requests) throw new HttpError(429, 'Too many requests. Please wait a moment.');

      const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
      if (pathname.startsWith('/api/')) {
        await handleApiRequest(req, res, pathname, db, requestId);
      } else if (pathname === '/') {
        json(req, res, requestId, 200, { name: 'Pixel English Quest API', status: 'ok', health: '/api/health' });
      } else {
        json(req, res, requestId, 404, { error: 'Route not found.' });
      }
    } catch (error) {
      handleError(error, { req, res, requestId });
    } finally {
      logRequest({ requestId, method: req.method, path: req.url, status: res.statusCode, durationMs: Date.now() - started });
    }
  });
  server.on('close', () => db.close());
  return server;
}
