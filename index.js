import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessons, quickQuestions } from './content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.AFK_DATA_FILE || path.join(__dirname, 'data.json');
const port = Number(process.env.PORT) || 3001;

const initialData = {
  profile: { name: 'Urbano', level: 1, xp: 0 },
  completedLessons: [],
  readingMinutes: 0,
  quickQuizWins: 0,
  activities: []
};

async function loadData() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch {
    await saveData(initialData);
    return structuredClone(initialData);
  }
}

async function saveData(data) {
  await writeFile(dataFile, JSON.stringify(data, null, 2));
}

function achievementList(data) {
  const total = data.completedLessons.length;
  return [
    { id: 'first-step', icon: '🌟', title: 'First Step', description: 'Complete your first lesson', unlocked: total >= 1 },
    { id: 'page-turner', icon: '📚', title: 'Page Turner', description: 'Complete both reading quests', unlocked: lessons.filter((lesson) => lesson.category === 'reading' && data.completedLessons.includes(lesson.id)).length >= 2 },
    { id: 'quiz-whiz', icon: '⚡', title: 'Quiz Whiz', description: 'Win 3 pop-up quizzes', unlocked: data.quickQuizWins >= 3 },
    { id: 'academy-hero', icon: '🏆', title: 'Academy Hero', description: 'Complete every lesson', unlocked: total === lessons.length }
  ];
}

function dashboard(data) {
  const achievements = achievementList(data);
  const completed = data.completedLessons.length;
  return {
    profile: data.profile,
    stats: {
      completed,
      total: lessons.length,
      progress: Math.round((completed / lessons.length) * 100),
      readingMinutes: data.readingMinutes,
      achievements: achievements.filter((item) => item.unlocked).length,
      quickQuizWins: data.quickQuizWins
    },
    lessons: lessons.map(({ questions, passage, audioText, speakPhrase, ...lesson }) => ({
      ...lesson,
      completed: data.completedLessons.includes(lesson.id)
    })),
    achievements,
    activities: data.activities.slice(0, 8)
  };
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
  });
  res.end(JSON.stringify(body));
}

async function bodyOf(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON body');
  }
}

function addActivity(data, activity) {
  data.activities.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    ...activity
  });
  data.activities = data.activities.slice(0, 30);
}

async function api(req, res, pathname) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const data = await loadData();

  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { status: 'ok', service: 'pixel-english-quest-api' });
  }

  if (req.method === 'GET' && pathname === '/api/dashboard') {
    return json(res, 200, dashboard(data));
  }

  const lessonMatch = pathname.match(/^\/api\/lessons\/([^/]+)$/);
  if (req.method === 'GET' && lessonMatch) {
    const lesson = lessons.find((item) => item.id === lessonMatch[1]);
    if (!lesson) return json(res, 404, { error: 'Lesson not found' });
    const safeLesson = {
      ...lesson,
      questions: lesson.questions.map(({ answer, ...question }) => question),
      completed: data.completedLessons.includes(lesson.id)
    };
    return json(res, 200, safeLesson);
  }

  const completeMatch = pathname.match(/^\/api\/lessons\/([^/]+)\/complete$/);
  if (req.method === 'POST' && completeMatch) {
    const lesson = lessons.find((item) => item.id === completeMatch[1]);
    if (!lesson) return json(res, 404, { error: 'Lesson not found' });
    const body = await bodyOf(req);
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const correct = lesson.questions.reduce((score, question, index) => score + (answers[index] === question.answer ? 1 : 0), 0);
    const score = Math.round((correct / lesson.questions.length) * 100);
    const firstCompletion = !data.completedLessons.includes(lesson.id);
    if (firstCompletion) {
      data.completedLessons.push(lesson.id);
      data.readingMinutes += lesson.minutes;
      data.profile.xp += 50 + correct * 25;
      data.profile.level = Math.floor(data.profile.xp / 250) + 1;
    }
    addActivity(data, {
      type: 'lesson',
      icon: lesson.icon,
      title: firstCompletion ? `Completed ${lesson.title}` : `Practised ${lesson.title}`,
      detail: `${score}% score · ${correct}/${lesson.questions.length} correct`
    });
    await saveData(data);
    return json(res, 200, { score, correct, total: lesson.questions.length, firstCompletion, dashboard: dashboard(data) });
  }

  if (req.method === 'GET' && pathname === '/api/quick-quiz') {
    const index = Math.floor(Math.random() * quickQuestions.length);
    const { answer, explanation, ...question } = quickQuestions[index];
    return json(res, 200, question);
  }

  if (req.method === 'POST' && pathname === '/api/quick-quiz/submit') {
    const body = await bodyOf(req);
    const question = quickQuestions.find((item) => item.id === body.questionId);
    if (!question) return json(res, 404, { error: 'Question not found' });
    const correct = body.answer === question.answer;
    if (correct) {
      data.quickQuizWins += 1;
      data.profile.xp += 20;
      data.profile.level = Math.floor(data.profile.xp / 250) + 1;
    }
    addActivity(data, {
      type: 'quiz',
      icon: correct ? '⚡' : '🧠',
      title: correct ? 'Won a pop-up quiz' : 'Practised a pop-up quiz',
      detail: correct ? '+20 XP · Correct answer' : 'Keep going · New knowledge gained'
    });
    await saveData(data);
    return json(res, 200, { correct, answer: question.answer, explanation: question.explanation, dashboard: dashboard(data) });
  }

  if (req.method === 'PUT' && pathname === '/api/profile') {
    const body = await bodyOf(req);
    const name = String(body.name || '').trim().slice(0, 18);
    if (name.length < 2) return json(res, 400, { error: 'Name must contain at least 2 characters.' });
    data.profile.name = name;
    addActivity(data, { type: 'profile', icon: '🪄', title: 'Updated adventurer profile', detail: `Now exploring as ${name}` });
    await saveData(data);
    return json(res, 200, dashboard(data));
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    await saveData(structuredClone(initialData));
    return json(res, 200, dashboard(structuredClone(initialData)));
  }

  return json(res, 404, { error: 'Route not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (pathname === '/') {
      return json(res, 200, {
        name: 'Pixel English Quest API',
        status: 'ok',
        health: '/api/health'
      });
    }
    return json(res, 404, { error: 'Route not found' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(port, () => {
  console.log(`Pixel English Quest API listening on http://localhost:${port}`);
});
