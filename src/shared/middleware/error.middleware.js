import { json } from '../http.js';
import { AppError } from '../utils/appError.js';
import { logError } from '../utils/logger.js';

export function handleError(error, { req, res, requestId }) {
  const status = error instanceof AppError ? error.status : 500;
  if (!res.headersSent) {
    json(req, res, requestId, status, {
      error: status === 500 ? 'Internal server error.' : error.message,
      requestId
    });
  }
  if (status === 500) logError({ requestId, error });
}
