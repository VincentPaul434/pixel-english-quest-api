import {
  archiveLesson,
  assignLesson,
  createAnnouncement,
  createCourse,
  createLesson,
  createModule,
  getLessonAnalytics,
  publishLesson,
  updateCourse,
  updateLesson
} from './teacher.controller.js';
import { createRouteGroup } from '../shared/routing.js';

const routes = [
  { method: 'POST', path: /^\/api\/teacher\/courses$/, action: createCourse },
  { method: 'PUT', path: /^\/api\/teacher\/courses\/([^/]+)$/, action: updateCourse, params: ([, id]) => ({ id: decodeURIComponent(id) }) },
  { method: 'POST', path: /^\/api\/teacher\/courses\/([^/]+)\/modules$/, action: createModule, params: ([, courseId]) => ({ courseId: decodeURIComponent(courseId) }) },
  { method: 'POST', path: /^\/api\/teacher\/lessons$/, action: createLesson },
  { method: 'PUT', path: /^\/api\/teacher\/lessons\/([^/]+)$/, action: updateLesson, params: ([, id]) => ({ id: decodeURIComponent(id) }) },
  { method: 'DELETE', path: /^\/api\/teacher\/lessons\/([^/]+)$/, action: archiveLesson, params: ([, id]) => ({ id: decodeURIComponent(id) }) },
  { method: 'POST', path: /^\/api\/teacher\/lessons\/([^/]+)\/publish$/, action: publishLesson, params: ([, id]) => ({ id: decodeURIComponent(id) }) },
  { method: 'POST', path: /^\/api\/teacher\/lessons\/([^/]+)\/assign$/, action: assignLesson, params: ([, id]) => ({ id: decodeURIComponent(id) }) },
  { method: 'GET', path: /^\/api\/teacher\/lessons\/([^/]+)\/analytics$/, action: getLessonAnalytics, params: ([, id]) => ({ id: decodeURIComponent(id) }) },
  { method: 'POST', path: /^\/api\/teacher\/announcements$/, action: createAnnouncement }
];

export const handleTeacherRoutes = createRouteGroup(routes);
