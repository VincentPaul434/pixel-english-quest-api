import {
  emailVerificationConfirm, emailVerificationRequest, getCurrentUser, loginUser, logoutUser,
  mfaDisable, mfaEnable, mfaRecoveryCodes, mfaSetup, passwordResetConfirm, passwordResetRequest, registerUser
} from './auth.controller.js';
import { createRouteGroup } from '../shared/routing.js';

const routes = [
  { method: 'POST', path: '/api/auth/register', action: registerUser },
  { method: 'POST', path: '/api/auth/login', action: loginUser },
  { method: 'POST', path: '/api/auth/logout', action: logoutUser },
  { method: 'POST', path: '/api/auth/password-reset/request', action: passwordResetRequest },
  { method: 'POST', path: '/api/auth/password-reset/confirm', action: passwordResetConfirm },
  { method: 'POST', path: '/api/auth/email-verification/request', action: emailVerificationRequest },
  { method: 'POST', path: '/api/auth/email-verification/confirm', action: emailVerificationConfirm },
  { method: 'POST', path: '/api/auth/mfa/setup', action: mfaSetup },
  { method: 'POST', path: '/api/auth/mfa/enable', action: mfaEnable },
  { method: 'POST', path: '/api/auth/mfa/recovery-codes', action: mfaRecoveryCodes },
  { method: 'POST', path: '/api/auth/mfa/disable', action: mfaDisable },
  { method: 'GET', path: '/api/me', action: getCurrentUser }
];

export const handleAuthRoutes = createRouteGroup(routes);
