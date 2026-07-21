import { cleanText, optionalIsoDate } from '../shared/data-utils.js';
import { HttpError } from '../shared/http.js';

export function validateCourseCreate(body) {
  const title = cleanText(body.title, 120);
  if (!title) throw new HttpError(400, 'Course title is required.');
  return {
    title,
    description: cleanText(body.description, 2000),
    difficulty: cleanText(body.difficulty, 40) || 'Beginner',
    catalogVisibility: body.catalogVisibility === 'public' ? 'public' : 'private',
    enrollmentMode: ['invite', 'self'].includes(body.enrollmentMode) ? body.enrollmentMode : 'invite',
    certificateEnabled: body.certificateEnabled !== false,
    prerequisiteCourseId: cleanText(body.prerequisiteCourseId, 100) || null
  };
}

export function validateCourseUpdate(body, course) {
  const title = cleanText(body.title ?? course.title, 120);
  if (!title) throw new HttpError(400, 'Course title is required.');
  return {
    title,
    description: cleanText(body.description ?? course.description, 2000),
    difficulty: cleanText(body.difficulty ?? course.difficulty, 40),
    status: ['draft', 'published', 'archived'].includes(body.status) ? body.status : course.status,
    catalogVisibility: ['private', 'public'].includes(body.catalogVisibility) ? body.catalogVisibility : course.catalog_visibility,
    enrollmentMode: ['invite', 'self'].includes(body.enrollmentMode) ? body.enrollmentMode : course.enrollment_mode,
    certificateEnabled: body.certificateEnabled === undefined ? Boolean(course.certificate_enabled) : Boolean(body.certificateEnabled),
    prerequisiteCourseId: body.prerequisiteCourseId === undefined ? course.prerequisite_course_id : cleanText(body.prerequisiteCourseId, 100) || null
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
    dueAt: optionalIsoDate(body.dueAt),
    instructions: cleanText(body.instructions, 5000),
    submissionType: ['quiz', 'text', 'file', 'mixed'].includes(body.submissionType) ? body.submissionType : 'quiz',
    maxScore: Math.min(1000, Math.max(1, Number(body.maxScore) || 100)),
    allowResubmission: body.allowResubmission !== false
  };
}

export function validateAnnouncement(body) {
  const courseId = cleanText(body.courseId, 100);
  const title = cleanText(body.title, 160);
  const message = cleanText(body.body, 5000);
  if (!title || !message) throw new HttpError(400, 'Announcement title and message are required.');
  return { courseId, title, body: message };
}
