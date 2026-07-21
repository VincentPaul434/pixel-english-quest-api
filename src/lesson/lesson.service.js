import { HttpError } from '../shared/http.js';
import { clampInteger, cleanText, parseJson } from '../shared/data-utils.js';
import { studentDashboard } from '../dashboard/dashboard.service.js';
import {
  findProgress,
  findUserById,
  lessonQuestions,
  recordLessonAttempt
} from './lesson.repository.js';

export function isPublishedLesson(lesson) {
  return lesson?.status === 'published';
}

export async function lessonFromRow(db, row, includeAnswers = false) {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    moduleId: row.module_id,
    moduleTitle: row.module_title,
    category: row.category,
    title: row.title,
    eyebrow: row.eyebrow,
    icon: row.icon,
    minutes: row.minutes,
    difficulty: row.difficulty,
    passage: row.passage,
    audioText: row.audio_text,
    speakPhrase: row.speak_phrase,
    audioUrl: row.audio_url,
    videoUrl: row.video_url,
    resourceUrl: row.resource_url,
    objectives: parseJson(row.objectives_json, []),
    xpReward: row.xp_reward,
    masteryScore: row.mastery_score,
    attemptLimit: row.attempt_limit || 0,
    shuffleQuestions: Boolean(row.shuffle_questions),
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    publishAt: row.publish_at,
    version: row.version || 1,
    position: row.position,
    status: row.status,
    completed: row.progress_status === 'completed',
    progress: row.progress_status ? {
      status: row.progress_status,
      bestScore: row.best_score,
      lastScore: row.last_score,
      attempts: row.attempts,
      lastQuestion: row.last_question,
      draftAnswers: parseJson(row.draft_answers_json, []),
      bookmarked: Boolean(row.bookmarked),
      notes: row.notes || ''
    } : null,
    questions: await lessonQuestions(db, row.id, includeAnswers)
  };
}

export function normalizeQuestions(rawQuestions, publishing = false) {
  if (!Array.isArray(rawQuestions)) return [];
  const questions = rawQuestions.slice(0, 50).map((raw, index) => {
    const prompt = cleanText(raw.prompt, 500);
    const type = ['multiple_choice', 'true_false', 'fill_blank', 'essay', 'matching', 'ordering'].includes(raw.type) ? raw.type : 'multiple_choice';
    const choices = type === 'true_false' ? ['True', 'False'] : Array.isArray(raw.choices)
      ? raw.choices.map((item) => typeof item === 'object' ? item : cleanText(item, 200)).filter(Boolean).slice(0, 20) : [];
    const answer = ['fill_blank', 'essay'].includes(type) ? cleanText(raw.answer, 2000)
      : ['matching', 'ordering'].includes(type) ? (Array.isArray(raw.answer) ? raw.answer.slice(0, 20) : []) : Number(raw.answer);
    if (!prompt) throw new HttpError(400, `Question ${index + 1} needs a prompt.`);
    if (['multiple_choice', 'true_false'].includes(type) && (choices.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= choices.length)) {
      throw new HttpError(400, `Question ${index + 1} needs valid choices and a correct answer.`);
    }
    if (type === 'fill_blank' && !answer) throw new HttpError(400, `Question ${index + 1} needs a correct answer.`);
    if (['matching', 'ordering'].includes(type) && (choices.length < 2 || answer.length !== choices.length)) {
      throw new HttpError(400, `Question ${index + 1} needs a complete answer sequence.`);
    }
    return {
      prompt, type, choices, answer, explanation: cleanText(raw.explanation, 1000),
      points: clampInteger(raw.points, 1, 100, 1),
      settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {}
    };
  });
  if (publishing && questions.length === 0) throw new HttpError(400, 'A published lesson needs at least one question.');
  return questions;
}

export function normalizeLesson(body, publishing = false) {
  const lesson = {
    courseId: cleanText(body.courseId, 100),
    moduleId: cleanText(body.moduleId, 100) || null,
    title: cleanText(body.title, 120),
    category: ['reading', 'grammar', 'listening', 'speaking'].includes(body.category) ? body.category : 'reading',
    eyebrow: cleanText(body.eyebrow, 80) || 'English Quest',
    icon: cleanText(body.icon, 40) || body.category || 'book',
    minutes: clampInteger(body.minutes, 1, 240, 5),
    difficulty: cleanText(body.difficulty, 40) || 'Beginner',
    passage: cleanText(body.passage, 20000),
    audioText: cleanText(body.audioText, 10000) || null,
    speakPhrase: cleanText(body.speakPhrase, 2000) || null,
    audioUrl: cleanText(body.audioUrl, 2000) || null,
    videoUrl: cleanText(body.videoUrl, 2000) || null,
    resourceUrl: cleanText(body.resourceUrl, 2000) || null,
    objectives: Array.isArray(body.objectives) ? body.objectives.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 10) : [],
    xpReward: clampInteger(body.xpReward, 0, 5000, 100),
    masteryScore: clampInteger(body.masteryScore, 1, 100, 75),
    attemptLimit: clampInteger(body.attemptLimit, 0, 100, 0),
    shuffleQuestions: Boolean(body.shuffleQuestions),
    availableFrom: body.availableFrom ? new Date(body.availableFrom).toISOString() : null,
    availableUntil: body.availableUntil ? new Date(body.availableUntil).toISOString() : null,
    publishAt: body.publishAt ? new Date(body.publishAt).toISOString() : null,
    position: clampInteger(body.position, 0, 10000, 0),
    status: publishing || body.status === 'published' ? 'published' : 'draft',
    questions: normalizeQuestions(body.questions, publishing || body.status === 'published')
  };
  if (!lesson.courseId || !lesson.title || !lesson.passage) throw new HttpError(400, 'Course, title, and lesson content are required.');
  if (lesson.category === 'listening' && publishing && !lesson.audioText) throw new HttpError(400, 'A listening lesson needs an audio script.');
  if (lesson.category === 'speaking' && publishing && !lesson.speakPhrase) throw new HttpError(400, 'A speaking lesson needs a practice phrase.');
  return lesson;
}

export async function submitLessonAttempt(db, user, lesson, body) {
  const questions = await lessonQuestions(db, lesson.id, true);
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!questions.length || answers.length !== questions.length) throw new HttpError(400, 'Answer every question before submitting.');
  const timestamp = Date.now();
  if (lesson.available_from && timestamp < new Date(lesson.available_from).getTime()) throw new HttpError(403, 'This lesson is not available yet.');
  if (lesson.available_until && timestamp > new Date(lesson.available_until).getTime()) throw new HttpError(403, 'This lesson is no longer available.');
  const previous = await findProgress(db, user.id, lesson.id);
  if (lesson.attempt_limit > 0 && (previous?.attempts || 0) >= lesson.attempt_limit) throw new HttpError(409, 'You have reached the attempt limit for this lesson.');
  let correct = 0;
  let earnedPoints = 0;
  const totalPoints = questions.reduce((sum, question) => sum + (question.points || 1), 0);
  let requiresManualReview = false;
  const review = questions.map((question, index) => {
    const selected = answers[index];
    const valid = ['fill_blank', 'essay'].includes(question.type)
      ? typeof selected === 'string' && selected.trim().length > 0
      : ['matching', 'ordering'].includes(question.type)
        ? Array.isArray(selected) && selected.length === question.answer.length
      : Number.isInteger(selected) && selected >= 0 && selected < question.choices.length;
    if (!valid) throw new HttpError(400, `Question ${index + 1} has an invalid answer.`);
    const isCorrect = question.type === 'essay' ? true : question.type === 'fill_blank'
      ? selected.trim().toLocaleLowerCase() === String(question.answer).trim().toLocaleLowerCase()
      : ['matching', 'ordering'].includes(question.type)
        ? JSON.stringify(selected) === JSON.stringify(question.answer)
      : selected === question.answer;
    if (question.type === 'essay') requiresManualReview = true;
    if (isCorrect) {
      correct += 1;
      earnedPoints += question.points || 1;
    }
    return {
      prompt: question.prompt,
      type: question.type,
      selected,
      answer: question.answer,
      correct: isCorrect,
      explanation: question.explanation
    };
  });
  const score = Math.round((earnedPoints / totalPoints) * 100);
  const passed = score >= lesson.mastery_score;
  const firstCompletion = passed && previous?.status !== 'completed';
  const now = new Date().toISOString();
  const durationSeconds = clampInteger(body.durationSeconds, 0, 86400, 0);

  await recordLessonAttempt(db, {
    user,
    lesson,
    answers,
    score,
    correct,
    total: questions.length,
    passed,
    durationSeconds,
    firstCompletion,
    now
  });
  const { issueEligibleCertificates } = await import('../platform/platform.service.js');
  await issueEligibleCertificates(db, user.id);
  const freshUser = await findUserById(db, user.id);
  return { score, correct, total: questions.length, passed, requiresManualReview, masteryScore: lesson.mastery_score, firstCompletion, review, dashboard: await studentDashboard(db, freshUser) };
}

export function wordAccuracy(expected, transcript) {
  const words = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s']/gu, '').split(/\s+/).filter(Boolean);
  const target = words(expected);
  const heard = words(transcript);
  if (!target.length) return 0;
  const matches = target.reduce((count, word, index) => count + (heard[index] === word ? 1 : 0), 0);
  return Math.round((matches / target.length) * 100);
}
