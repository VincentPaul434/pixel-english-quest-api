import { checkpointLesson, completeLesson, getLesson, speakingAttempt, studyLesson } from './lesson.controller.js';
import { createRouteGroup } from '../shared/routing.js';

const routes = [
  { method: 'GET', path: /^\/api\/lessons\/([^/]+)$/, action: getLesson },
  { method: 'POST', path: /^\/api\/lessons\/([^/]+)\/complete$/, action: completeLesson },
  { method: 'PUT', path: /^\/api\/lessons\/([^/]+)\/checkpoint$/, action: checkpointLesson },
  { method: 'PUT', path: /^\/api\/lessons\/([^/]+)\/study$/, action: studyLesson },
  { method: 'POST', path: /^\/api\/lessons\/([^/]+)\/speaking-attempt$/, action: speakingAttempt }
];

export const handleLessonRoutes = createRouteGroup(routes);
