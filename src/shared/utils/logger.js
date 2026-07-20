export function logRequest({ requestId, method, path, status, durationMs }) {
  console.log(JSON.stringify({ requestId, method, path, status, durationMs }));
}

export function logError({ requestId, error }) {
  console.error(JSON.stringify({ requestId, error: error?.stack || String(error) }));
}
