export function ensureRole(user, role) {
  return Boolean(user && (!role || user.role === role));
}
