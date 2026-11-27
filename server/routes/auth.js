/* ==========================================================================
   Authentication, OAuth 2.0 & Phone OTP Routes (/auth)
   ========================================================================== */

const express = require('express');
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');
const db = require('../db');
const { encrypt } = require('../utils/crypto');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');

const router = express.Router();

function getFrontendUrl(req) {
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

function getGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback';

  if (!clientId || !clientSecret || clientId === 'your_google_client_id') {
    return null;
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function formatUserResponse(user) {
  const accounts = db
    .prepare(
      `SELECT id, provider, email, is_default, confirmed, created_at
       FROM email_accounts
       WHERE user_id = ?
       ORDER BY is_default DESC, id ASC`
    )
    .all(user.id)
    .map((acc) => ({
      id: `acc-${acc.id}`,
      dbId: acc.id,
      provider: acc.provider,
      email: acc.email,
      is_default: Boolean(acc.is_default),
      isDefault: Boolean(acc.is_default),
      confirmed: Boolean(acc.confirmed),
      connected: true
    }));

  const defaultEmail = accounts.find((a) => a.is_default) || accounts[0] || null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture || null,
      authMethod: user.auth_provider
    },
    defaultEmail,
    telegramChatId: user.telegram_chat_id || '',
    telegramTtsVoice: user.telegram_tts_voice || process.env.TELEGRAM_TTS_VOICE || 'en-IN-NeerjaNeural',
    phoneVerified: Boolean(user.phone_verified),
    phoneNumber: user.phone_number || '',
    callConsent: Boolean(user.call_consent),
    onboardingComplete: Boolean(user.onboarding_complete),
    emailAccounts: accounts
  };
}

function normalizeE164(countryCode, phoneNumber) {
  const cc = (countryCode || '+91').trim();
  const raw = String(phoneNumber || '').replace(/[\s\-()]/g, '');
  if (raw.startsWith('+')) return raw;
  const ccDigits = cc.startsWith('+') ? cc : `+${cc}`;
  return `${ccDigits}${raw}`;
}

/* --------------------------------------------------------------------------
   1. Google OAuth 2.0 (Stages 2, 3 & 5)
   -------------------------------------------------------------------------- */
router.get('/google', (req, res) => {
  const oauth2Client = getGoogleOAuthClient();
  if (!oauth2Client) {
    const frontendUrl = getFrontendUrl(req);
    return res.redirect(
      `${frontendUrl}/?auth_error=${encodeURIComponent(
        'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env.'
      )}`
    );
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: req.query.switch === 'true' ? 'select_account consent' : 'consent select_account',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly'
    ]
  });

  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const frontendUrl = getFrontendUrl(req);
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(
      `${frontendUrl}/?auth_error=${encodeURIComponent(error || 'Google sign-in was cancelled.')}`
    );
  }

  const oauth2Client = getGoogleOAuthClient();
  if (!oauth2Client) {
    return res.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent('Google OAuth not configured.')}`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    const email = (profile.email || '').toLowerCase();
    const name = profile.name || email.split('@')[0] || 'User';
    const picture = profile.picture || null;

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      const info = db
        .prepare(
          `INSERT INTO users (name, email, picture, auth_provider)
           VALUES (?, ?, ?, 'google')`
        )
        .run(name, email, picture);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    } else {
      db.prepare(`UPDATE users SET name = ?, picture = ?, auth_provider = 'google' WHERE id = ?`).run(
        name,
        picture,
        user.id
      );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    const encAccess = encrypt(tokens.access_token);
    const encRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    const expiry = tokens.expiry_date || null;

    db.prepare('UPDATE email_accounts SET is_default = 0 WHERE user_id = ?').run(user.id);

    const existingAcc = db
      .prepare('SELECT * FROM email_accounts WHERE user_id = ? AND email = ?')
      .get(user.id, email);

    if (existingAcc) {
      db.prepare(
        `UPDATE email_accounts
         SET provider = 'gmail',
             encrypted_access_token = ?,
             encrypted_refresh_token = COALESCE(?, encrypted_refresh_token),
             token_expiry = ?,
             is_default = 1
         WHERE id = ?`
      ).run(encAccess, encRefresh, expiry, existingAcc.id);
    } else {
      db.prepare(
        `INSERT INTO email_accounts (user_id, provider, email, encrypted_access_token, encrypted_refresh_token, token_expiry, is_default)
         VALUES (?, 'gmail', ?, ?, ?, ?, 1)`
      ).run(user.id, email, encAccess, encRefresh, expiry);
    }

    setSessionCookie(res, user);
    const nextStep = user.onboarding_complete ? 'dashboard' : 'default-email';
    return res.redirect(`${frontendUrl}/?step=${nextStep}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return res.redirect(
      `${frontendUrl}/?auth_error=${encodeURIComponent('Failed to complete Google sign-in.')}`
    );
  }
});

/* --------------------------------------------------------------------------
   2. Email & Password Auth (Stage 2)
   -------------------------------------------------------------------------- */
router.post('/signup', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const rawName = String(req.body.name || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const derivedName = rawName || email.split('@')[0].replace(/[^a-zA-Z0-9 ]/g, ' ').trim() || 'User';
    const displayName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);

    const info = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, auth_provider)
         VALUES (?, ?, ?, 'Email')`
      )
      .run(displayName, email, passwordHash);

    db.prepare(
      `INSERT INTO email_accounts (user_id, provider, email, is_default)
       VALUES (?, 'IMAP/SMTP', ?, 1)`
    ).run(info.lastInsertRowid, email);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    setSessionCookie(res, user);
    return res.status(201).json(formatUserResponse(user));
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Unable to create account right now.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    setSessionCookie(res, user);
    return res.json(formatUserResponse(user));
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Unable to sign in right now.' });
  }
});

/* --------------------------------------------------------------------------
   4. Session & Logout
   -------------------------------------------------------------------------- */
router.get('/me', requireAuth, (req, res) => {
  return res.json(formatUserResponse(req.user));
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

/* --------------------------------------------------------------------------
   4b. Confirm Default Email (Stage 3)
   -------------------------------------------------------------------------- */
router.post('/default-email/confirm', requireAuth, (req, res) => {
  const { accountId } = req.body || {};
  let targetAcc = null;

  if (accountId) {
    const numericId = String(accountId).replace(/^acc-/, '');
    targetAcc = db
      .prepare('SELECT * FROM email_accounts WHERE id = ? AND user_id = ?')
      .get(numericId, req.user.id);
  } else {
    targetAcc = db
      .prepare('SELECT * FROM email_accounts WHERE user_id = ? ORDER BY is_default DESC, id ASC LIMIT 1')
      .get(req.user.id);
  }

  if (!targetAcc) {
    return res.status(404).json({ error: 'No connected email account found to confirm.' });
  }

  db.prepare('UPDATE email_accounts SET is_default = 0 WHERE user_id = ?').run(req.user.id);
  db.prepare('UPDATE email_accounts SET is_default = 1, confirmed = 1 WHERE id = ?').run(targetAcc.id);

  const payload = formatUserResponse(req.user);
  return res.json({
    ok: true,
    defaultEmail: payload.defaultEmail,
    emailAccounts: payload.emailAccounts
  });
});

function isTwilioVerifyEnabled() {
  const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const verifySid = (process.env.TWILIO_VERIFY_SID || '').trim();
  return (
    process.env.OTP_DEV_MODE !== 'true' &&
    Boolean(sid && token && verifySid) &&
    sid !== 'your_twilio_account_sid'
  );
}

/* --------------------------------------------------------------------------
   5. Phone Number & OTP Verification (Stage 4)
   -------------------------------------------------------------------------- */
router.post('/phone/send-otp', requireAuth, async (req, res) => {
  try {
    const { countryCode = '+91', phoneNumber } = req.body;
    const e164 = normalizeE164(countryCode, phoneNumber);

    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      return res.status(400).json({ error: 'Please enter a valid phone number in E.164 format (e.g. +919876543210).' });
    }

    if (isTwilioVerifyEnabled()) {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.verify.v2.services(process.env.TWILIO_VERIFY_SID).verifications.create({
        to: e164,
        channel: 'sms'
      });

      return res.json({
        ok: true,
        sent: true,
        devMode: false,
        phoneNumber: e164,
        message: 'Verification code sent via SMS.'
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare('DELETE FROM otp_codes WHERE user_id = ? AND verified = 0').run(req.user.id);
    db.prepare(
      `INSERT INTO otp_codes (user_id, phone_number, code_hash, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run(req.user.id, e164, codeHash, expiresAt);

    console.log(`[OTP_DEV_MODE] OTP for ${e164} (user ${req.user.email}): ${code}`);

    return res.json({
      ok: true,
      sent: true,
      devMode: true,
      devCode: code,
      phoneNumber: e164
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    return res.status(500).json({ error: 'Failed to send verification code.' });
  }
});

router.post('/phone/verify-otp', requireAuth, async (req, res) => {
  try {
    const { countryCode = '+91', phoneNumber, code, callConsent } = req.body;
    const e164 = normalizeE164(countryCode, phoneNumber);

    if (callConsent !== true) {
      return res.status(400).json({ error: 'You must agree to receive automated calls to continue.' });
    }
    if (!/^\d{6}$/.test(String(code || '').trim())) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit verification code.' });
    }

    if (isTwilioVerifyEnabled()) {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const check = await client.verify.v2
        .services(process.env.TWILIO_VERIFY_SID)
        .verificationChecks.create({ to: e164, code: String(code).trim() });

      if (check.status !== 'approved') {
        return res.status(400).json({ error: 'Invalid or expired verification code.' });
      }
    } else {
      const record = db
        .prepare(
          `SELECT * FROM otp_codes
           WHERE user_id = ? AND phone_number = ? AND verified = 0
           ORDER BY id DESC LIMIT 1`
        )
        .get(req.user.id, e164);

      if (!record) {
        return res.status(400).json({ error: 'No pending OTP found. Please request a new code.' });
      }
      if (new Date(record.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      }

      const match = await bcrypt.compare(String(code).trim(), record.code_hash);
      if (!match) {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }

      db.prepare('UPDATE otp_codes SET verified = 1 WHERE id = ?').run(record.id);
    }

    const consentTimestamp = new Date().toISOString();
    db.prepare(
      `UPDATE users
       SET phone_number = ?, phone_verified = 1, call_consent = 1, consent_timestamp = ?
       WHERE id = ?`
    ).run(e164, consentTimestamp, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    return res.json({
      verified: true,
      ...formatUserResponse(updated)
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: 'Failed to verify OTP code.' });
  }
});

/* --------------------------------------------------------------------------
   6. Onboarding Completion
   -------------------------------------------------------------------------- */
router.post('/onboarding/complete', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET onboarding_complete = 1 WHERE id = ?').run(req.user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json(formatUserResponse(updated));
});

module.exports = router;
