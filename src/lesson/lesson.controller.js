import { requireUser } from '../shared/middleware/auth.middleware.js';
import { bodyOf, HttpError, ok } from '../shared/http.js';
import {
  lessonFromRow,
  submitLessonAttempt,
  wordAccuracy
} from './lesson.service.js';
import {
  addLessonActivity,
  createSpeakingAttempt,
  ownedLesson,
  publishedLessonRow,
  saveCheckpoint,
  saveStudyNotes
} from './lesson.repository.js';
import { validateCheckpoint, validateStudy, validateTranscript } from './lesson.validator.js';

export async function getLesson(context) {
  const user = await requireUser(context.req, context.db);
  const row = user.role === 'student'
    ? await publishedLessonRow(context.db, context.params.id, user.id)
    : await ownedLesson(context.db, context.params.id, user.id);
  if (!row) throw new HttpError(404, 'Lesson not found.');
  ok(context, await lessonFromRow(context.db, row, user.role === 'teacher'));
}

export async function completeLesson(context) {
  const user = await requireUser(context.req, context.db, 'student');
  const row = await publishedLessonRow(context.db, context.params.id, user.id);
  if (!row) throw new HttpError(404, 'Lesson not found.');
  ok(context, await submitLessonAttempt(context.db, user, row, await bodyOf(context.req)));
}

export async function checkpointLesson(context) {
  const user = await requireUser(context.req, context.db, 'student');
  if (!await publishedLessonRow(context.db, context.params.id, user.id)) throw new HttpError(404, 'Lesson not found.');
  ok(context, await saveCheckpoint(context.db, user.id, context.params.id, validateCheckpoint(await bodyOf(context.req))));
}

export async function studyLesson(context) {
  const user = await requireUser(context.req, context.db, 'student');
  if (!await publishedLessonRow(context.db, context.params.id, user.id)) throw new HttpError(404, 'Lesson not found.');
  ok(context, await saveStudyNotes(context.db, user.id, context.params.id, validateStudy(await bodyOf(context.req))));
}

export async function speakingAttempt(context) {
  const user = await requireUser(context.req, context.db, 'student');
  const row = await publishedLessonRow(context.db, context.params.id, user.id);
  if (!row || !row.speak_phrase) throw new HttpError(404, 'Speaking exercise not found.');
  const transcript = validateTranscript(await bodyOf(context.req));
  const accuracy = wordAccuracy(row.speak_phrase, transcript);
  await createSpeakingAttempt(context.db, user.id, row.id, transcript, accuracy);
  await addLessonActivity(context.db, user.id, { type: 'speaking', icon: 'mic', title: `Practised ${row.title}`, detail: `${accuracy}% phrase accuracy` });
  ok(context, {
    transcript,
    accuracy,
    target: row.speak_phrase,
    feedback: accuracy >= 80 ? 'Clear pronunciation - excellent work!' : accuracy >= 55 ? 'Good start. Slow down and try once more.' : 'Listen again, then practise one phrase at a time.'
  });
}
