import { allowedOriginHosts, allowedOrigins, maxBodyBytes } from '../config/app-config.js';
import { AppError } from './utils/appError.js';

export { AppError, AppError as HttpError };

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;
  try {
    return allowedOriginHosts.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function responseHeaders(req, requestId) {
  const origin = req.headers.origin;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'X-Request-Id': requestId
  };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

export function json(req, res, requestId, status, body) {
  res.writeHead(status, responseHeaders(req, requestId));
  res.end(JSON.stringify(body));
}

export function send(context, status, body) {
  json(context.req, context.res, context.requestId, status, body);
}

export function ok(context, body) {
  send(context, 200, body);
}

export function created(context, body) {
  send(context, 201, body);
}

function csvCell(value) {
  const normalized = String(value ?? '');
  return /[",\r\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

export function csv(context, filename, rows) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const content = [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
  context.res.writeHead(200, {
    ...responseHeaders(context.req, context.requestId),
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`
  });
  context.res.end(content);
}

export async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}
