export function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    proficiency: user.proficiency,
    learningGoal: user.learning_goal,
    dailyGoal: user.daily_goal,
    onboardingComplete: Boolean(user.onboarding_complete),
    xp: user.xp,
    level: Math.floor(user.xp / 250) + 1,
    createdAt: user.created_at
  };
}
