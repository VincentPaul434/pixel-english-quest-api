import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEMO_ACCOUNTS } from '../database.js';
import { createServer } from '../index.js';

async function academy(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pixel-academy-'));
  const server = createServer({ databaseFile: path.join(directory, 'test.db') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });

  const call = async (route, { token, method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    return { response, data };
  };
  const login = async (account) => {
    const { response, data } = await call('/api/auth/login', { method: 'POST', body: account });
    assert.equal(response.status, 200);
    return data;
  };
  return { call, login };
}

test('student sessions isolate progress and lesson mastery records every attempt', async (t) => {
  const { call, login } = await academy(t);

  const health = await call('/api/health', { headers: { Origin: 'http://127.0.0.1:5173' } });
  assert.equal(health.response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');

  const anonymousReset = await call('/api/reset', { method: 'POST' });
  assert.equal(anonymousReset.response.status, 401);

  const student = await login(DEMO_ACCOUNTS.student);
  assert.equal(student.user.role, 'student');

  const dashboard = await call('/api/dashboard', { token: student.token });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.data.stats.total, 6);
  assert.equal(dashboard.data.profile.xp, 0);

  const invalid = await call('/api/lessons/moonlit-map/complete', {
    token: student.token, method: 'POST', body: { answers: [1] }
  });
  assert.equal(invalid.response.status, 400);

  const failed = await call('/api/lessons/moonlit-map/complete', {
    token: student.token, method: 'POST', body: { answers: [0, 1], durationSeconds: 90 }
  });
  assert.equal(failed.response.status, 200);
  assert.equal(failed.data.passed, false);
  assert.equal(failed.data.score, 0);
  assert.equal(failed.data.dashboard.stats.completed, 0);

  const passed = await call('/api/lessons/moonlit-map/complete', {
    token: student.token, method: 'POST', body: { answers: [1, 0], durationSeconds: 120 }
  });
  assert.equal(passed.response.status, 200);
  assert.equal(passed.data.passed, true);
  assert.equal(passed.data.firstCompletion, true);
  assert.equal(passed.data.dashboard.profile.xp, 100);
  assert.equal(passed.data.dashboard.stats.learningMinutes, 4);
  assert.deepEqual(passed.data.review.map((item) => item.correct), [true, true]);

  const repeat = await call('/api/lessons/moonlit-map/complete', {
    token: student.token, method: 'POST', body: { answers: [1, 0], durationSeconds: 30 }
  });
  assert.equal(repeat.data.firstCompletion, false);
  assert.equal(repeat.data.dashboard.profile.xp, 100);
  assert.equal(repeat.data.dashboard.lessons.find((lesson) => lesson.id === 'moonlit-map').progress.attempts, 3);
});

test('quick quiz awards daily XP only once per question', async (t) => {
  const { call, login } = await academy(t);
  const student = await login(DEMO_ACCOUNTS.student);
  const question = (await call('/api/quick-quiz', { token: student.token })).data;

  let correctAnswer = -1;
  let firstAward = null;
  for (let answer = 0; answer < question.choices.length; answer += 1) {
    const attempt = await call('/api/quick-quiz/submit', {
      token: student.token, method: 'POST', body: { questionId: question.id, answer }
    });
    if (attempt.data.correct) {
      correctAnswer = answer;
      firstAward = attempt.data;
      break;
    }
  }
  assert.notEqual(correctAnswer, -1);
  assert.equal(firstAward.xpAwarded, 20);

  const replay = await call('/api/quick-quiz/submit', {
    token: student.token, method: 'POST', body: { questionId: question.id, answer: correctAnswer }
  });
  assert.equal(replay.data.correct, true);
  assert.equal(replay.data.xpAwarded, 0);
  assert.equal(replay.data.dashboard.profile.xp, 20);
});

test('teacher can build, publish, assign, and analyze a lesson', async (t) => {
  const { call, login } = await academy(t);
  const teacher = await login(DEMO_ACCOUNTS.teacher);
  const student = await login(DEMO_ACCOUNTS.student);

  const createdCourses = await call('/api/teacher/courses', {
    token: teacher.token,
    method: 'POST',
    body: { title: 'Teacher Created Course', description: 'A complete authoring workflow.', difficulty: 'Intermediate' }
  });
  assert.equal(createdCourses.response.status, 201);
  const course = createdCourses.data.courses.find((item) => item.title === 'Teacher Created Course');
  assert(course);
  assert.equal(course.status, 'draft');

  const withModule = await call(`/api/teacher/courses/${course.id}/modules`, {
    token: teacher.token, method: 'POST', body: { title: 'Teacher Module' }
  });
  assert.equal(withModule.response.status, 201);
  const updatedCourse = withModule.data.courses.find((item) => item.id === course.id);
  const moduleId = updatedCourse.modules[0].id;

  const createdLesson = await call('/api/teacher/lessons', {
    token: teacher.token,
    method: 'POST',
    body: {
      courseId: course.id,
      moduleId,
      title: 'A Teacher Made Quest',
      category: 'grammar',
      difficulty: 'Intermediate',
      minutes: 8,
      passage: 'Use the word learn to complete the sentence.',
      objectives: ['Use the target verb accurately'],
      xpReward: 125,
      masteryScore: 75,
      status: 'published',
      questions: [{ prompt: 'We ___ English.', type: 'fill_blank', choices: [], answer: 'learn', explanation: 'Use the base form after we.' }]
    }
  });
  assert.equal(createdLesson.response.status, 201);
  const lessonId = createdLesson.data.lesson.id;

  const publishedCourse = await call(`/api/teacher/courses/${course.id}`, {
    token: teacher.token, method: 'PUT', body: { status: 'published' }
  });
  assert.equal(publishedCourse.response.status, 200);
  assert.equal(publishedCourse.data.courses.find((item) => item.id === course.id).studentCount, 1);

  const assignment = await call(`/api/teacher/lessons/${lessonId}/assign`, {
    token: teacher.token, method: 'POST', body: { title: 'Complete the teacher quest', studentIds: [student.user.id] }
  });
  assert.equal(assignment.response.status, 201);

  const studentDashboard = await call('/api/dashboard', { token: student.token });
  assert(studentDashboard.data.lessons.some((lesson) => lesson.id === lessonId));
  assert(studentDashboard.data.assignments.some((item) => item.lessonId === lessonId));

  const completed = await call(`/api/lessons/${lessonId}/complete`, {
    token: student.token, method: 'POST', body: { answers: ['learn'], durationSeconds: 45 }
  });
  assert.equal(completed.data.score, 100);
  assert.equal(completed.data.dashboard.profile.xp, 125);
  assert.equal(completed.data.dashboard.assignments.find((item) => item.lessonId === lessonId).status, 'completed');

  const analytics = await call(`/api/teacher/lessons/${lessonId}/analytics`, { token: teacher.token });
  assert.equal(analytics.response.status, 200);
  assert.equal(analytics.data.summary.attempts, 1);
  assert.equal(analytics.data.summary.averageScore, 100);
  assert.equal(analytics.data.questions[0].correctRate, 100);
});
