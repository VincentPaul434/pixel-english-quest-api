import 'dotenv/config';
import { createDatabase } from '../src/config/database.js';
import { studentDashboard, teacherDashboard } from '../src/dashboard/dashboard.service.js';
import { platformOverview } from '../src/platform/platform.service.js';

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SUPABASE_DB_URL or DATABASE_URL is required.');

const db = createDatabase({ databaseUrl });
try {
  const teacher = await db.prepare("SELECT * FROM users WHERE role = 'teacher' ORDER BY created_at LIMIT 1").get();
  const student = await db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY created_at LIMIT 1").get();
  if (!teacher || !student) throw new Error('A teacher and student are required for verification.');
  const [teacherData, studentData, teacherPlatform, studentPlatform] = await Promise.all([
    teacherDashboard(db, teacher), studentDashboard(db, student), platformOverview(db, teacher), platformOverview(db, student)
  ]);
  console.log(JSON.stringify({
    database: 'supabase',
    teacherCourses: teacherData.courses.length,
    studentLessons: studentData.lessons.length,
    teacherClassrooms: teacherPlatform.classrooms.length,
    studentNotifications: studentPlatform.notifications.length,
    adminEnabled: Boolean(teacherData.profile.isAdmin)
  }));
} finally {
  await db.close();
}
