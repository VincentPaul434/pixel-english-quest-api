import { quickQuestions } from '../lesson/lesson.seed.js';
import { studentDashboard, teacherDashboard } from '../dashboard/dashboard.service.js';
import { AppError } from '../shared/utils/appError.js';
import {
  addActivity,
  createVocabularyItem,
  deleteVocabularyItem,
  findUserById,
  hasAwardedQuickQuizToday,
  resetStudentProgress,
  saveQuickQuizAttempt,
  updateProfile
} from './student.repository.js';
import { validateProfileUpdate, validateQuickQuizAnswer, validateVocabulary } from './student.validator.js';

export function getStudentDashboard(db, user) {
  return studentDashboard(db, user);
}

export function getTeacherDashboard(db, teacher) {
  return teacherDashboard(db, teacher);
}

export function saveProfile(db, user, body) {
  const input = validateProfileUpdate(body, user);
  updateProfile(db, user.id, input);
  addActivity(db, user.id, {
    type: 'profile',
    icon: 'magic',
    title: 'Updated learner profile',
    detail: `${input.proficiency} - ${input.dailyGoal} minute daily goal`
  });
  const updated = findUserById(db, user.id);
  return updated.role === 'student' ? studentDashboard(db, updated) : teacherDashboard(db, updated);
}

export function resetProgress(db, user) {
  resetStudentProgress(db, user.id);
  return studentDashboard(db, findUserById(db, user.id));
}

export function getQuickQuizQuestion() {
  const index = Math.floor(Math.random() * quickQuestions.length);
  const { answer, explanation, ...question } = quickQuestions[index];
  return question;
}

export function submitQuickQuiz(db, user, body) {
  const question = quickQuestions.find((item) => item.id === body.questionId);
  if (!question) throw new AppError(404, 'Question not found.');
  const answer = validateQuickQuizAnswer(body, question);
  const correct = answer === question.answer;
  const today = new Date().toISOString().slice(0, 10);
  const xpAwarded = correct && !hasAwardedQuickQuizToday(db, user.id, question.id, today) ? 20 : 0;
  saveQuickQuizAttempt(db, {
    userId: user.id,
    question,
    answer,
    correct,
    xpAwarded,
    today,
    activity: {
      type: 'quiz',
      icon: correct ? 'zap' : 'brain',
      title: correct ? 'Won a pop-up quiz' : 'Practised a pop-up quiz',
      detail: xpAwarded ? '+20 XP - Correct answer' : correct ? 'Correct - Daily XP already claimed' : 'Keep going - New knowledge gained'
    }
  });
  const updated = findUserById(db, user.id);
  return { correct, answer: question.answer, explanation: question.explanation, xpAwarded, dashboard: studentDashboard(db, updated) };
}

export function addVocabulary(db, user, body) {
  return createVocabularyItem(db, user.id, validateVocabulary(body));
}

export function removeVocabulary(db, user, id) {
  deleteVocabularyItem(db, user.id, id);
  return { deleted: true };
}
