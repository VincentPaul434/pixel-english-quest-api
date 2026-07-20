export function serializeLessonSummary(lesson) {
  return {
    id: lesson.id,
    title: lesson.title,
    category: lesson.category,
    difficulty: lesson.difficulty,
    minutes: lesson.minutes
  };
}
