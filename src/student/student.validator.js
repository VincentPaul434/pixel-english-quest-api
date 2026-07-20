import { clampInteger, cleanText } from '../shared/data-utils.js';
import { AppError } from '../shared/utils/appError.js';

export function validateProfileUpdate(body, user) {
  const name = cleanText(body.name ?? user.name, 40);
  const proficiency = ['Beginner', 'Intermediate', 'Advanced'].includes(body.proficiency) ? body.proficiency : user.proficiency;
  const learningGoal = cleanText(body.learningGoal ?? user.learning_goal, 300);
  const dailyGoal = clampInteger(body.dailyGoal, 5, 180, user.daily_goal);
  if (name.length < 2) throw new AppError(400, 'Name must contain at least 2 characters.');
  return { name, proficiency, learningGoal, dailyGoal };
}

export function validateQuickQuizAnswer(body, question) {
  if (!Number.isInteger(body.answer) || body.answer < 0 || body.answer >= question.choices.length) {
    throw new AppError(400, 'Choose a valid answer.');
  }
  return body.answer;
}

export function validateVocabulary(body) {
  const term = cleanText(body.term, 100);
  const definition = cleanText(body.definition, 1000);
  if (!term) throw new AppError(400, 'Enter a vocabulary word.');
  return { term, definition };
}
