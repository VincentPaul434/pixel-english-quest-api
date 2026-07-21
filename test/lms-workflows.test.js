import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DEMO_ACCOUNTS } from '../src/config/database.js';
import { createServer } from '../index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL || '';
const integrationTest = testDatabaseUrl ? test : test.skip;
const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function resetTestDatabase() {
  const ssl = process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false };
  const client = new pg.Client({ connectionString: testDatabaseUrl, ssl });
  await client.connect();
  try {
    await client.query('TRUNCATE TABLE users CASCADE');
  } finally {
    await client.end();
  }

  await new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(projectDirectory, 'scripts', 'setup-supabase.js')], {
      cwd: projectDirectory,
      env: { ...process.env, SUPABASE_DB_URL: testDatabaseUrl, DATABASE_URL: '' }
    }, (error) => error ? reject(error) : resolve());
  });
}

async function academy(t) {
  await resetTestDatabase();
  const server = createServer({ databaseUrl: testDatabaseUrl });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  const call = async (route, { token, method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { response, data };
  };
  const login = async (account) => {
    const { response, data } = await call('/api/auth/login', { method: 'POST', body: account });
    assert.equal(response.status, 200);
    return data;
  };
  return { call, login };
}

integrationTest('student sessions isolate progress and lesson mastery records every attempt', async (t) => {
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

integrationTest('quick quiz awards daily XP only once per question', async (t) => {
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

integrationTest('teacher can build, publish, assign, and analyze a lesson', async (t) => {
  const { call, login } = await academy(t);
  const teacher = await login(DEMO_ACCOUNTS.teacher);
  const student = await login(DEMO_ACCOUNTS.student);

  const createdCourses = await call('/api/teacher/courses', {
    token: teacher.token,
    method: 'POST',
    body: { title: 'Teacher Created Course', description: 'A complete authoring workflow.', difficulty: 'Intermediate', enrollmentMode: 'self' }
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

integrationTest('classroom, discussion, submission, grading, calendar, reports, and admin workflows are connected', async (t) => {
  const { call, login } = await academy(t);
  const teacher = await login(DEMO_ACCOUNTS.teacher);
  const student = await login(DEMO_ACCOUNTS.student);

  const classroom = await call('/api/teacher/classrooms', {
    token: teacher.token, method: 'POST', body: { courseId: 'course-english-foundations', name: 'Foundations A' }
  });
  assert.equal(classroom.response.status, 201);
  const classroomId = classroom.data.classrooms.find((item) => item.name === 'Foundations A').id;

  const roster = await call(`/api/teacher/classrooms/${classroomId}/students/${student.user.id}`, {
    token: teacher.token, method: 'POST'
  });
  assert.equal(roster.response.status, 200);
  assert(roster.data.rosters.find((item) => item.classroomId === classroomId).students.some((item) => item.id === student.user.id));

  const discussion = await call('/api/courses/course-english-foundations/discussions', {
    token: student.token, method: 'POST', body: { body: 'Can we review the moonlit map vocabulary?' }
  });
  assert.equal(discussion.response.status, 201);
  assert.equal(discussion.data.length, 1);

  const submission = await call('/api/assignments/assignment-welcome/submissions', {
    token: student.token, method: 'POST', body: { textContent: 'My completed reflection.' }
  });
  assert.equal(submission.response.status, 201);
  const submissionId = submission.data.submissions[0].id;

  const grade = await call(`/api/teacher/submissions/${submissionId}/grade`, {
    token: teacher.token, method: 'PUT', body: { score: 92, feedback: 'Clear and thoughtful.', rubric: [{ criterion: 'Clarity', points: 46 }] }
  });
  assert.equal(grade.response.status, 200);
  assert.equal(grade.data.submissions.find((item) => item.id === submissionId).score, 92);

  const calendar = await call('/api/teacher/calendar', {
    token: teacher.token, method: 'POST', body: {
      courseId: 'course-english-foundations', classroomId, title: 'Live review', startsAt: new Date(Date.now() + 86400000).toISOString()
    }
  });
  assert.equal(calendar.response.status, 201);
  assert(calendar.data.events.some((item) => item.title === 'Live review'));

  const bank = await call('/api/teacher/question-bank', {
    token: teacher.token, method: 'POST', body: { prompt: 'Arrange the words.', type: 'ordering', choices: ['I', 'learn', 'English'], answer: [0, 1, 2], tags: ['grammar'] }
  });
  assert.equal(bank.response.status, 201);
  assert(bank.data.questionBank.some((item) => item.type === 'ordering'));

  const report = await call('/api/teacher/reports.csv', { token: teacher.token });
  assert.equal(report.response.status, 200);
  assert.match(report.data, /course,student,email/i);

  const admin = await call('/api/admin/dashboard', { token: teacher.token });
  assert.equal(admin.response.status, 200);
  assert(admin.data.summary.users >= 2);
  assert(admin.data.logs.some((item) => item.entityType === 'submission'));
});

integrationTest('classroom invitations enforce approval, ownership, assignment scope, revocation, and leaving', async (t) => {
  const { call, login } = await academy(t);
  const teacher = await login(DEMO_ACCOUNTS.teacher);
  const student = await login(DEMO_ACCOUNTS.student);
  const otherTeacherResult = await call('/api/auth/register', {
    method: 'POST', body: { name: 'Other Teacher', email: 'other.teacher@example.com', password: 'OtherTeach123!', role: 'teacher' }
  });
  assert.equal(otherTeacherResult.response.status, 201);
  const otherTeacher = otherTeacherResult.data;

  const created = await call('/api/teacher/courses', {
    token: teacher.token, method: 'POST', body: { title: 'Invitation Only English', enrollmentMode: 'invite' }
  });
  const course = created.data.courses.find((item) => item.title === 'Invitation Only English');
  const lessonResult = await call('/api/teacher/lessons', {
    token: teacher.token, method: 'POST', body: {
      courseId: course.id, title: 'Private Classroom Lesson', category: 'grammar', passage: 'Choose the right word.', status: 'published',
      questions: [{ prompt: 'We ___ together.', type: 'fill_blank', answer: 'learn' }]
    }
  });
  const lessonId = lessonResult.data.lesson.id;
  await call(`/api/teacher/courses/${course.id}`, {
    token: teacher.token, method: 'PUT', body: { status: 'published', enrollmentMode: 'invite' }
  });
  const beforeInvite = await call('/api/dashboard', { token: student.token });
  assert(!beforeInvite.data.lessons.some((item) => item.id === lessonId));

  const assignmentResult = await call(`/api/teacher/lessons/${lessonId}/assign`, {
    token: teacher.token, method: 'POST', body: { title: 'Private Invitation Assignment', studentIds: [] }
  });
  assert.equal(assignmentResult.response.status, 201);
  const assignment = assignmentResult.data.assignments.find((item) => item.title === 'Private Invitation Assignment');

  const classroomResult = await call('/api/teacher/classrooms', {
    token: teacher.token, method: 'POST', body: { courseId: course.id, name: 'Invitation Room' }
  });
  const classroom = classroomResult.data.classrooms.find((item) => item.name === 'Invitation Room');
  const invitationResult = await call(`/api/teacher/classrooms/${classroom.id}/invitations`, {
    token: teacher.token, method: 'POST', body: { assignmentId: assignment.id, approvalRequired: true, usageLimit: 1, expiresAt: new Date(Date.now() + 86400000).toISOString() }
  });
  assert.equal(invitationResult.response.status, 201);
  const invitation = invitationResult.data.invitations[0];

  const preview = await call(`/api/invitations/${invitation.code}`, { token: student.token });
  assert.equal(preview.data.state, 'available');
  assert.equal(preview.data.teacherName, teacher.user.name);
  assert.equal(preview.data.assignmentTitle, assignment.title);

  const requested = await call(`/api/invitations/${invitation.code}/join`, { token: student.token, method: 'POST' });
  assert.equal(requested.response.status, 200);
  assert.equal(requested.data.invitationStates[0].status, 'pending');
  const stillPrivate = await call(`/api/assignments/${assignment.id}/submissions`, {
    token: student.token, method: 'POST', body: { textContent: 'I should not have access yet.' }
  });
  assert.equal(stillPrivate.response.status, 404);

  const pending = await call('/api/platform', { token: teacher.token });
  const joinRequest = pending.data.joinRequests.find((item) => item.status === 'pending');
  const crossTeacher = await call(`/api/teacher/join-requests/${joinRequest.id}`, {
    token: otherTeacher.token, method: 'PUT', body: { status: 'accepted' }
  });
  assert.equal(crossTeacher.response.status, 404);

  const approved = await call(`/api/teacher/join-requests/${joinRequest.id}`, {
    token: teacher.token, method: 'PUT', body: { status: 'accepted' }
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.data.invitations.find((item) => item.id === invitation.id).usesCount, 1);
  const afterApproval = await call('/api/dashboard', { token: student.token });
  assert(afterApproval.data.lessons.some((item) => item.id === lessonId));
  assert(afterApproval.data.assignments.some((item) => item.id === assignment.id));

  const left = await call(`/api/classrooms/${classroom.id}/membership`, { token: student.token, method: 'DELETE' });
  assert.equal(left.response.status, 200);
  const afterLeaving = await call('/api/dashboard', { token: student.token });
  assert(!afterLeaving.data.lessons.some((item) => item.id === lessonId));
  assert(!afterLeaving.data.assignments.some((item) => item.id === assignment.id));

  const revoked = await call(`/api/teacher/invitations/${invitation.id}`, { token: teacher.token, method: 'DELETE' });
  assert.equal(revoked.response.status, 200);
  const revokedPreview = await call(`/api/invitations/${invitation.code}`, { token: student.token });
  assert.equal(revokedPreview.data.state, 'revoked');
});

integrationTest('lesson versions, completion certificates, and account recovery work end to end', async (t) => {
  const { call, login } = await academy(t);
  const teacher = await login(DEMO_ACCOUNTS.teacher);
  const student = await login(DEMO_ACCOUNTS.student);

  const created = await call('/api/teacher/courses', {
    token: teacher.token, method: 'POST', body: { title: 'Certificate Sprint', catalogVisibility: 'public', enrollmentMode: 'self' }
  });
  const course = created.data.courses.find((item) => item.title === 'Certificate Sprint');
  const lessonResult = await call('/api/teacher/lessons', {
    token: teacher.token, method: 'POST', body: {
      courseId: course.id, title: 'One Step', category: 'grammar', passage: 'Finish the sentence.', status: 'published',
      questions: [
        { prompt: 'I ___ daily.', type: 'fill_blank', answer: 'learn', points: 2 },
        { prompt: 'Order the sentence.', type: 'ordering', choices: ['I', 'learn', 'daily'], answer: [0, 1, 2], points: 2 },
        { prompt: 'Match the sequence.', type: 'matching', choices: ['hello', 'greeting'], answer: [0, 1] },
        { prompt: 'How will you practise?', type: 'essay', answer: 'I will practise daily.', points: 3 }
      ]
    }
  });
  const lessonId = lessonResult.data.lesson.id;
  await call(`/api/teacher/courses/${course.id}`, {
    token: teacher.token, method: 'PUT', body: { status: 'published', catalogVisibility: 'public', enrollmentMode: 'self' }
  });

  const updated = await call(`/api/teacher/lessons/${lessonId}`, {
    token: teacher.token, method: 'PUT', body: { title: 'One Confident Step' }
  });
  assert.equal(updated.response.status, 200);
  const versions = await call(`/api/teacher/lessons/${lessonId}/versions`, { token: teacher.token });
  assert.equal(versions.response.status, 200);
  assert.equal(versions.data.length, 1);

  const completed = await call(`/api/lessons/${lessonId}/complete`, {
    token: student.token, method: 'POST', body: { answers: ['learn', [0, 1, 2], [0, 1], 'I will speak and read every day.'] }
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.data.requiresManualReview, true);
  assert.equal(completed.data.score, 100);
  const platform = await call('/api/platform', { token: student.token });
  const certificate = platform.data.certificates.find((item) => item.courseId === course.id);
  assert(certificate);
  const verified = await call(`/api/certificates/${certificate.verificationCode}`);
  assert.equal(verified.data.valid, true);
  assert.equal(verified.data.courseTitle, 'Certificate Sprint');

  const reset = await call('/api/auth/password-reset/request', { method: 'POST', body: { email: DEMO_ACCOUNTS.student.email } });
  assert.equal(reset.response.status, 200);
  assert(reset.data.developmentToken);
  const confirmed = await call('/api/auth/password-reset/confirm', {
    method: 'POST', body: { token: reset.data.developmentToken, password: 'NewLearn456!' }
  });
  assert.equal(confirmed.response.status, 200);
  const relogin = await login({ email: DEMO_ACCOUNTS.student.email, password: 'NewLearn456!' });
  assert.equal(relogin.user.id, student.user.id);
});
