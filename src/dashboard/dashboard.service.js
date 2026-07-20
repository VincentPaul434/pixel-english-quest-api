import { publicUser } from '../config/database.js';
import { lessonFromRow } from '../lesson/lesson.service.js';

function learningStreak(db, userId) {
  const rows = db.prepare(`SELECT created_at FROM lesson_attempts WHERE user_id = ?
    UNION ALL SELECT created_at FROM quick_attempts WHERE user_id = ? ORDER BY created_at DESC`).all(userId, userId);
  const days = [...new Set(rows.map((row) => row.created_at.slice(0, 10)))].sort().reverse();
  if (!days.length) return 0;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  if (days[0] !== todayKey && days[0] !== yesterdayKey) return 0;
  let streak = 1;
  let cursor = new Date(`${days[0]}T00:00:00.000Z`);
  for (let index = 1; index < days.length; index += 1) {
    cursor = new Date(cursor.getTime() - 86400000);
    if (days[index] !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
  }
  return streak;
}

function achievementsFor(db, userId, completed, total) {
  const reading = db.prepare(`SELECT COUNT(*) AS count FROM progress p JOIN lessons l ON l.id = p.lesson_id
    WHERE p.user_id = ? AND p.status = 'completed' AND l.category = 'reading'`).get(userId).count;
  const quickWins = db.prepare('SELECT COUNT(*) AS count FROM quick_attempts WHERE user_id = ? AND correct = 1').get(userId).count;
  const streak = learningStreak(db, userId);
  return [
    { id: 'first-step', icon: 'star', title: 'First Step', description: 'Complete your first lesson', unlocked: completed >= 1 },
    { id: 'page-turner', icon: 'book', title: 'Page Turner', description: 'Complete two reading quests', unlocked: reading >= 2 },
    { id: 'quiz-whiz', icon: 'zap', title: 'Quiz Whiz', description: 'Answer 3 quick quizzes correctly', unlocked: quickWins >= 3 },
    { id: 'streak-keeper', icon: 'flame', title: 'Streak Keeper', description: 'Learn on 3 consecutive days', unlocked: streak >= 3 },
    { id: 'academy-hero', icon: 'trophy', title: 'English Pixel Hero', description: 'Complete every enrolled lesson', unlocked: total > 0 && completed >= total }
  ];
}

export function studentDashboard(db, user) {
  const rows = db.prepare(`SELECT l.*, c.title AS course_title, m.title AS module_title,
      p.status AS progress_status, p.best_score, p.last_score, p.attempts, p.last_question,
      p.draft_answers_json, p.bookmarked, p.notes
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
    LEFT JOIN modules m ON m.id = l.module_id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.status = 'published' AND c.status = 'published'
    ORDER BY c.created_at, m.position, l.position, l.created_at`).all(user.id, user.id);
  const lessons = rows.map((row) => {
    const lesson = lessonFromRow(db, row);
    delete lesson.passage;
    delete lesson.audioText;
    delete lesson.speakPhrase;
    delete lesson.questions;
    return lesson;
  });
  const completed = lessons.filter((lesson) => lesson.completed).length;
  const total = lessons.length;
  const focusSeconds = db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) AS seconds FROM lesson_attempts WHERE user_id = ?').get(user.id).seconds;
  const achievements = achievementsFor(db, user.id, completed, total);
  const activities = db.prepare(`SELECT id, type, icon, title, detail, created_at AS timestamp
    FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 12`).all(user.id);
  const assignments = db.prepare(`SELECT a.id, a.title, a.due_at AS dueAt, a.lesson_id AS lessonId,
      l.title AS lessonTitle, c.title AS courseTitle, ast.status
    FROM assignment_students ast
    JOIN assignments a ON a.id = ast.assignment_id
    JOIN lessons l ON l.id = a.lesson_id
    JOIN courses c ON c.id = a.course_id
    WHERE ast.student_id = ? ORDER BY ast.status, a.due_at`).all(user.id);
  const announcements = db.prepare(`SELECT DISTINCT a.id, a.title, a.body, a.published_at AS publishedAt,
      c.title AS courseTitle, u.name AS teacherName
    FROM announcements a JOIN courses c ON c.id = a.course_id
    JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
    JOIN users u ON u.id = a.teacher_id
    ORDER BY a.published_at DESC LIMIT 8`).all(user.id);
  const vocabulary = db.prepare('SELECT id, term, definition, created_at AS createdAt FROM vocabulary WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
  const quickQuizWins = db.prepare('SELECT COUNT(*) AS count FROM quick_attempts WHERE user_id = ? AND correct = 1').get(user.id).count;
  const recommendation = lessons.find((lesson) => lesson.progress?.status === 'in_progress')
    || lessons.find((lesson) => !lesson.completed) || null;
  const skillMastery = ['reading', 'grammar', 'listening', 'speaking'].map((category) => {
    const categoryLessons = lessons.filter((lesson) => lesson.category === category);
    const score = categoryLessons.length
      ? Math.round(categoryLessons.reduce((sum, lesson) => sum + (lesson.progress?.bestScore || 0), 0) / categoryLessons.length)
      : 0;
    return { category, score };
  });
  return {
    profile: publicUser(user),
    stats: {
      completed,
      total,
      progress: total ? Math.round((completed / total) * 100) : 0,
      learningMinutes: Math.round(focusSeconds / 60),
      achievements: achievements.filter((item) => item.unlocked).length,
      quickQuizWins,
      streak: learningStreak(db, user.id)
    },
    lessons,
    achievements,
    activities,
    assignments,
    announcements,
    vocabulary,
    recommendation,
    skillMastery
  };
}

export function teacherDashboard(db, teacher) {
  const courses = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS moduleCount,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.status != 'archived') AS lessonCount,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS studentCount
    FROM courses c WHERE c.teacher_id = ? AND c.status != 'archived' ORDER BY c.updated_at DESC`).all(teacher.id).map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty,
      status: course.status,
      moduleCount: course.moduleCount,
      lessonCount: course.lessonCount,
      studentCount: course.studentCount,
      modules: db.prepare('SELECT id, title, position FROM modules WHERE course_id = ? ORDER BY position').all(course.id),
      lessons: db.prepare(`SELECT l.id, l.title, l.category, l.difficulty, l.minutes, l.status, l.module_id AS moduleId,
        l.mastery_score AS masteryScore, COUNT(q.id) AS questionCount
        FROM lessons l LEFT JOIN questions q ON q.lesson_id = l.id
        WHERE l.course_id = ? AND l.status != 'archived'
        GROUP BY l.id ORDER BY l.position, l.created_at`).all(course.id)
    }));
  const students = db.prepare(`SELECT u.id, u.name, u.email, u.proficiency, u.xp,
      COUNT(DISTINCT e.course_id) AS courseCount,
      COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.lesson_id END) AS completedLessons,
      COALESCE(ROUND(AVG(CASE WHEN p.attempts > 0 THEN p.best_score END)), 0) AS averageScore
    FROM users u JOIN enrollments e ON e.user_id = u.id
    JOIN courses c ON c.id = e.course_id AND c.teacher_id = ?
    LEFT JOIN progress p ON p.user_id = u.id
    GROUP BY u.id ORDER BY u.name`).all(teacher.id);
  const assignments = db.prepare(`SELECT a.id, a.title, a.due_at AS dueAt, l.title AS lessonTitle, c.title AS courseTitle,
      COUNT(ast.student_id) AS studentCount,
      SUM(CASE WHEN ast.status = 'completed' THEN 1 ELSE 0 END) AS completedCount
    FROM assignments a JOIN lessons l ON l.id = a.lesson_id JOIN courses c ON c.id = a.course_id
    LEFT JOIN assignment_students ast ON ast.assignment_id = a.id
    WHERE a.teacher_id = ? GROUP BY a.id ORDER BY a.created_at DESC`).all(teacher.id);
  const announcements = db.prepare(`SELECT a.id, a.title, a.body, a.published_at AS publishedAt, c.title AS courseTitle
    FROM announcements a JOIN courses c ON c.id = a.course_id WHERE a.teacher_id = ? ORDER BY a.published_at DESC`).all(teacher.id);
  const totalAttempts = db.prepare(`SELECT COUNT(*) AS count FROM lesson_attempts la JOIN lessons l ON l.id = la.lesson_id
    JOIN courses c ON c.id = l.course_id WHERE c.teacher_id = ?`).get(teacher.id).count;
  return {
    profile: publicUser(teacher), courses, students, assignments, announcements,
    stats: {
      courses: courses.length,
      publishedLessons: courses.reduce((sum, course) => sum + course.lessons.filter((lesson) => lesson.status === 'published').length, 0),
      students: students.length,
      attempts: totalAttempts
    }
  };
}
