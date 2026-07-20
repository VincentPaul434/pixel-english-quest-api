import { cleanText, optionalIsoDate } from '../shared/data-utils.js';
import { HttpError } from '../shared/http.js';

export function validateCourseCreate(body) {
  const title = cleanText(body.title, 120);
  if (!title) throw new HttpError(400, 'Course title is required.');
  return {
    title,
    description: cleanText(body.description, 2000),
    difficulty: cleanText(body.difficulty, 40) || 'Beginner'
  };
}

export function validateCourseUpdate(body, course) {
  const title = cleanText(body.title ?? course.title, 120);
  if (!title) throw new HttpError(400, 'Course title is required.');
  return {
    title,
    description: cleanText(body.description ?? course.description, 2000),
    difficulty: cleanText(body.difficulty ?? course.difficulty, 40),
    status: ['draft', 'published', 'archived'].includes(body.status) ? body.status : course.status
  };
}

export function validateModuleCreate(body) {
  const title = cleanText(body.title, 120);
  if (!title) throw new HttpError(400, 'Module title is required.');
  return { title };
}

export function validateAssignment(body, eligible, lesson) {
  const requestedIds = Array.isArray(body.studentIds) ? body.studentIds.map(String) : [];
  const studentIds = requestedIds.length ? requestedIds.filter((id) => eligible.includes(id)) : eligible;
  if (!studentIds.length) throw new HttpError(400, 'Select at least one enrolled student.');
  return {
    studentIds,
    title: cleanText(body.title, 160) || lesson.title,
    dueAt: optionalIsoDate(body.dueAt)
  };
}

export function validateAnnouncement(body) {
  const courseId = cleanText(body.courseId, 100);
  const title = cleanText(body.title, 160);
  const message = cleanText(body.body, 5000);
  if (!title || !message) throw new HttpError(400, 'Announcement title and message are required.');
  return { courseId, title, body: message };
}
