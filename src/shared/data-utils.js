import { HttpError } from './http.js';

export function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

export function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function optionalIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Enter a valid date and time.');
  return date.toISOString();
}
