import {
  dashboard,
  profile,
  quickQuiz,
  quickQuizSubmit,
  reset,
  teacherDashboard,
  vocabularyCreate,
  vocabularyDelete
} from './student.controller.js';
import { createRouteGroup } from '../shared/routing.js';

const routes = [
  { method: 'GET', path: /^\/api\/dashboard$/, action: dashboard },
  { method: 'GET', path: /^\/api\/teacher\/dashboard$/, action: teacherDashboard },
  { method: 'PUT', path: /^\/api\/profile$/, action: profile },
  { method: 'POST', path: /^\/api\/reset$/, action: reset },
  { method: 'GET', path: /^\/api\/quick-quiz$/, action: quickQuiz },
  { method: 'POST', path: /^\/api\/quick-quiz\/submit$/, action: quickQuizSubmit },
  { method: 'POST', path: /^\/api\/vocabulary$/, action: vocabularyCreate },
  { method: 'DELETE', path: /^\/api\/vocabulary\/([^/]+)$/, action: vocabularyDelete, params: ([, id]) => ({ id: decodeURIComponent(id) }) }
];

export const handleStudentRoutes = createRouteGroup(routes);
