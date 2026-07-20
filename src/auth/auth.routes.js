import { getCurrentUser, loginUser, logoutUser, registerUser } from './auth.controller.js';
import { createRouteGroup } from '../shared/routing.js';

const routes = [
  { method: 'POST', path: '/api/auth/register', action: registerUser },
  { method: 'POST', path: '/api/auth/login', action: loginUser },
  { method: 'POST', path: '/api/auth/logout', action: logoutUser },
  { method: 'GET', path: '/api/me', action: getCurrentUser }
];

export const handleAuthRoutes = createRouteGroup(routes);
