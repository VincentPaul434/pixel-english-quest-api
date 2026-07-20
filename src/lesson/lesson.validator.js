import { clampInteger, cleanText } from '../shared/data-utils.js';
import { AppError } from '../shared/utils/appError.js';

export function validateCheckpoint(body) {
  return {
    lastQuestion: clampInteger(body.lastQuestion, 0, 100, 0),
    draftAnswers: Array.isArray(body.draftAnswers) ? body.draftAnswers.slice(0, 100) : []
  };
}

export function validateStudy(body) {
  return {
    notes: cleanText(body.notes, 5000),
    bookmarked: Boolean(body.bookmarked)
  };
}

export function validateTranscript(body) {
  const transcript = cleanText(body.transcript, 2000);
  if (!transcript) throw new AppError(400, 'No speech transcript was received.');
  return transcript;
}
