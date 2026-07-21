import { json } from '../shared/http.js';
import { handleAuthRoutes } from '../auth/auth.routes.js';
import { handleLessonRoutes } from '../lesson/lesson.routes.js';
import { handleStudentRoutes } from '../student/student.routes.js';
import { handleTeacherRoutes } from '../teacher/teacher.routes.js';
import { handlePlatformRoutes } from '../platform/platform.routes.js';

const routeGroups = [
  handleAuthRoutes,
  handleStudentRoutes,
  handleLessonRoutes,
  handleTeacherRoutes,
  handlePlatformRoutes
];

export async function handleApiRequest(req, res, pathname, db, requestId) {
  if (req.method === 'OPTIONS') {
    json(req, res, requestId, 204, {});
    return;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    const database = (await db.prepare('SELECT 1 AS ok').get()).ok === 1;
    json(req, res, requestId, 200, { status: 'ok', service: 'pixel-english-quest-api', database });
    return;
  }

  const context = { req, res, pathname, db, requestId };
  for (const handleRouteGroup of routeGroups) {
    if (await handleRouteGroup(context)) return;
  }

  json(req, res, requestId, 404, { error: 'Route not found.' });
}
