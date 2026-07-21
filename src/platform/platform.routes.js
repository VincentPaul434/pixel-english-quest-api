import { createRouteGroup } from '../shared/routing.js';
import {
  adminGet, adminSet, assignmentSubmit, attendanceMark, calendarCreate, certificateVerify,
  classroomCreate, classroomStudentAdd, classroomStudentRemove, discussionCreate, discussions,
  enroll, lessonDuplicate, lessonsReorder, overview, questionBankCreate, readAllNotifications,
  readNotification, reportCsv, submissionGrade, uploadSign, versionRestore, versions
} from './platform.controller.js';

const decode = (value) => decodeURIComponent(value);
const routes = [
  { method: 'GET', path: '/api/platform', action: overview },
  { method: 'POST', path: '/api/uploads/sign', action: uploadSign },
  { method: 'POST', path: /^\/api\/catalog\/([^/]+)\/enroll$/, action: enroll, params: ([, courseId]) => ({ courseId: decode(courseId) }) },
  { method: 'PUT', path: '/api/notifications/read-all', action: readAllNotifications },
  { method: 'PUT', path: /^\/api\/notifications\/([^/]+)\/read$/, action: readNotification },
  { method: 'GET', path: /^\/api\/courses\/([^/]+)\/discussions$/, action: discussions, params: ([, courseId]) => ({ courseId: decode(courseId) }) },
  { method: 'POST', path: /^\/api\/courses\/([^/]+)\/discussions$/, action: discussionCreate, params: ([, courseId]) => ({ courseId: decode(courseId) }) },
  { method: 'POST', path: /^\/api\/assignments\/([^/]+)\/submissions$/, action: assignmentSubmit, params: ([, assignmentId]) => ({ assignmentId: decode(assignmentId) }) },
  { method: 'POST', path: '/api/teacher/classrooms', action: classroomCreate },
  { method: 'POST', path: /^\/api\/teacher\/classrooms\/([^/]+)\/students\/([^/]+)$/, action: classroomStudentAdd, params: ([, classroomId, studentId]) => ({ classroomId: decode(classroomId), studentId: decode(studentId) }) },
  { method: 'DELETE', path: /^\/api\/teacher\/classrooms\/([^/]+)\/students\/([^/]+)$/, action: classroomStudentRemove, params: ([, classroomId, studentId]) => ({ classroomId: decode(classroomId), studentId: decode(studentId) }) },
  { method: 'PUT', path: /^\/api\/teacher\/submissions\/([^/]+)\/grade$/, action: submissionGrade },
  { method: 'POST', path: '/api/teacher/calendar', action: calendarCreate },
  { method: 'PUT', path: /^\/api\/teacher\/calendar\/([^/]+)\/attendance$/, action: attendanceMark, params: ([, eventId]) => ({ eventId: decode(eventId) }) },
  { method: 'POST', path: '/api/teacher/question-bank', action: questionBankCreate },
  { method: 'POST', path: /^\/api\/teacher\/lessons\/([^/]+)\/duplicate$/, action: lessonDuplicate },
  { method: 'PUT', path: /^\/api\/teacher\/courses\/([^/]+)\/lessons\/reorder$/, action: lessonsReorder, params: ([, courseId]) => ({ courseId: decode(courseId) }) },
  { method: 'GET', path: /^\/api\/teacher\/lessons\/([^/]+)\/versions$/, action: versions },
  { method: 'POST', path: /^\/api\/teacher\/lessons\/([^/]+)\/versions\/([^/]+)\/restore$/, action: versionRestore, params: ([, lessonId, versionId]) => ({ lessonId: decode(lessonId), versionId: decode(versionId) }) },
  { method: 'GET', path: '/api/teacher/reports.csv', action: reportCsv },
  { method: 'GET', path: /^\/api\/certificates\/([^/]+)$/, action: certificateVerify, params: ([, code]) => ({ code: decode(code) }) },
  { method: 'GET', path: '/api/admin/dashboard', action: adminGet },
  { method: 'PUT', path: /^\/api\/admin\/users\/([^/]+)\/admin$/, action: adminSet }
];

export const handlePlatformRoutes = createRouteGroup(routes);
