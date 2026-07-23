import { requireUser } from '../shared/middleware/auth.middleware.js';
import { bodyOf, created, ok, csv } from '../shared/http.js';
import {
  addClassroomStudent, addClassroomStudentByEmail, addQuestionBankItem, adminDashboard, createCalendarEvent, createClassroom,
  createClassroomInvitation, createDiscussion, duplicateLesson, gradeSubmission, joinClassroom,
  leaveClassroom, lessonVersions, listCourseDiscussions, previewClassroomInvitation, resolveJoinRequest,
  markAllNotificationsRead, markAttendance, markNotificationRead, platformOverview, removeClassroomStudent, removeClassroomStudents,
  deleteQuestionBankItem, reorderLessons, restoreLessonVersion, revokeClassroomInvitation, selfEnroll, setAccountStatus, setAdminStatus, setUserRole, submitAssignment, teacherReport,
  updateQuestionBankItem,
  updateNotificationPreferences,
  verifyCertificate, signUpload
} from './platform.service.js';

export async function overview(context) { ok(context, await platformOverview(context.db, await requireUser(context.req, context.db))); }
export async function enroll(context) { ok(context, await selfEnroll(context.db, await requireUser(context.req, context.db, 'student'), context.params.courseId)); }
export async function readNotification(context) { ok(context, await markNotificationRead(context.db, await requireUser(context.req, context.db), context.params.id)); }
export async function readAllNotifications(context) { ok(context, await markAllNotificationsRead(context.db, await requireUser(context.req, context.db))); }
export async function notificationPreferencesUpdate(context) { ok(context, await updateNotificationPreferences(context.db, await requireUser(context.req, context.db), await bodyOf(context.req))); }
export async function discussions(context) { ok(context, await listCourseDiscussions(context.db, await requireUser(context.req, context.db), context.params.courseId)); }
export async function discussionCreate(context) { created(context, await createDiscussion(context.db, await requireUser(context.req, context.db), context.params.courseId, await bodyOf(context.req))); }
export async function assignmentSubmit(context) { created(context, await submitAssignment(context.db, await requireUser(context.req, context.db, 'student'), context.params.assignmentId, await bodyOf(context.req))); }
export async function classroomCreate(context) { created(context, await createClassroom(context.db, await requireUser(context.req, context.db, 'teacher'), await bodyOf(context.req))); }
export async function classroomStudentAdd(context) { ok(context, await addClassroomStudent(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.classroomId, context.params.studentId)); }
export async function classroomStudentAddByEmail(context) { ok(context, await addClassroomStudentByEmail(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.classroomId, await bodyOf(context.req))); }
export async function classroomStudentRemove(context) { ok(context, await removeClassroomStudent(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.classroomId, context.params.studentId)); }
export async function classroomStudentsRemove(context) { ok(context, await removeClassroomStudents(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.classroomId, await bodyOf(context.req))); }
export async function classroomInvitationCreate(context) { created(context, await createClassroomInvitation(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.classroomId, await bodyOf(context.req))); }
export async function classroomInvitationRevoke(context) { ok(context, await revokeClassroomInvitation(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.invitationId)); }
export async function classroomInvitationPreview(context) { ok(context, await previewClassroomInvitation(context.db, await requireUser(context.req, context.db, 'student'), context.params.code)); }
export async function classroomJoin(context) { ok(context, await joinClassroom(context.db, await requireUser(context.req, context.db, 'student'), context.params.code)); }
export async function classroomJoinResolve(context) { ok(context, await resolveJoinRequest(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.requestId, await bodyOf(context.req))); }
export async function classroomLeave(context) { ok(context, await leaveClassroom(context.db, await requireUser(context.req, context.db, 'student'), context.params.classroomId)); }
export async function submissionGrade(context) { ok(context, await gradeSubmission(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.id, await bodyOf(context.req))); }
export async function calendarCreate(context) { created(context, await createCalendarEvent(context.db, await requireUser(context.req, context.db, 'teacher'), await bodyOf(context.req))); }
export async function attendanceMark(context) { ok(context, await markAttendance(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.eventId, await bodyOf(context.req))); }
export async function questionBankCreate(context) { created(context, await addQuestionBankItem(context.db, await requireUser(context.req, context.db, 'teacher'), await bodyOf(context.req))); }
export async function questionBankUpdate(context) { ok(context, await updateQuestionBankItem(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.id, await bodyOf(context.req))); }
export async function questionBankDelete(context) { ok(context, await deleteQuestionBankItem(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.id)); }
export async function lessonDuplicate(context) { created(context, await duplicateLesson(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.id)); }
export async function lessonsReorder(context) { ok(context, await reorderLessons(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.courseId, await bodyOf(context.req))); }
export async function versions(context) { ok(context, await lessonVersions(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.id)); }
export async function versionRestore(context) { ok(context, await restoreLessonVersion(context.db, await requireUser(context.req, context.db, 'teacher'), context.params.lessonId, context.params.versionId)); }
export async function reportCsv(context) { const teacher = await requireUser(context.req, context.db, 'teacher'); const params = new URL(context.req.url || '/', `http://${context.req.headers.host || 'localhost'}`).searchParams; csv(context, 'learning-report.csv', await teacherReport(context.db, teacher, { courseId: params.get('courseId'), from: params.get('from'), to: params.get('to') })); }
export async function certificateVerify(context) { ok(context, await verifyCertificate(context.db, context.params.code)); }
export async function adminGet(context) { ok(context, await adminDashboard(context.db, await requireUser(context.req, context.db))); }
export async function adminSet(context) { ok(context, await setAdminStatus(context.db, await requireUser(context.req, context.db), context.params.id, await bodyOf(context.req))); }
export async function adminRoleSet(context) { ok(context, await setUserRole(context.db, await requireUser(context.req, context.db), context.params.id, await bodyOf(context.req))); }
export async function adminStatusSet(context) { ok(context, await setAccountStatus(context.db, await requireUser(context.req, context.db), context.params.id, await bodyOf(context.req))); }
export async function uploadSign(context) { created(context, await signUpload(context.db, await requireUser(context.req, context.db), await bodyOf(context.req))); }
