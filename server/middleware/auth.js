/* ==========================================================================
   JWT Session Middleware (HttpOnly Cookie: edith_session)
   ========================================================================== */

const jwt = require('jsonwebtoken');
const db = require('../db');

const COOKIE_NAME = 'edith_session';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'edith_dev_fallback_secret';
}

function signSessionToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

function setSessionCookie(res, user) {
  const token = signSessionToken(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Session user not found.' });
    }
    req.user = user;
    next();
  } catch (err) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

module.exports = {
  COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  requireAuth
};
