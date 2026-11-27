/* ==========================================================================
   Outbound Voice Call Service (Twilio Programmable Voice - Ready When Configured)
   ========================================================================== */

const db = require('../db');
const { fetchRecentEmails, summarizeEmailsWithGemini } = require('./mailSummarizer');

function getPublicBaseUrl() {
  const port = process.env.PORT || 4000;
  const raw = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).trim();
  return raw.replace(/\/$/, '');
}

async function triggerRealPhoneCall(userId) {
  const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const fromNumber = (process.env.TWILIO_PHONE_NUMBER || '').trim();

  if (!sid || !token || !fromNumber || sid === 'your_twilio_account_sid') {
    return {
      ok: false,
      status: 400,
      error: 'Twilio Voice is not configured yet. Use Test Bot Call or Telegram Briefing for now.'
    };
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { ok: false, status: 404, error: 'User not found.' };
  }

  if (!user.phone_verified || !user.phone_number) {
    return { ok: false, status: 400, error: 'Phone number is not verified yet.' };
  }

  if (!user.call_consent) {
    return { ok: false, status: 400, error: 'Automated call consent has not been granted.' };
  }

  const sched = db.prepare('SELECT * FROM schedules WHERE user_id = ?').get(userId);
  const skipIfEmpty = sched ? Boolean(sched.skip_if_empty) : true;
  const summaryLength = sched ? sched.summary_length : 'Standard (3-4 minutes)';
  const lastCallAt = sched ? sched.last_call_at : null;

  const { emails } = await fetchRecentEmails(userId, lastCallAt);

  if (emails.length === 0 && skipIfEmpty) {
    db.prepare(
      `INSERT INTO call_history (user_id, emails_covered, status, spoken_greeting, spoken_script, summary_json)
       VALUES (?, 0, 'Skipped', ?, '', '[]')`
    ).run(userId, 'No new unread emails since your last call.');

    return { ok: true, skipped: true, message: 'No new emails; call skipped per schedule settings.' };
  }

  const summary = await summarizeEmailsWithGemini(emails, summaryLength);

  const info = db
    .prepare(
      `INSERT INTO call_history (user_id, emails_covered, status, spoken_greeting, spoken_script, summary_json)
       VALUES (?, ?, 'Queued', ?, ?, ?)`
    )
    .run(
      userId,
      emails.length,
      summary.spokenGreeting,
      summary.spokenScript,
      JSON.stringify(summary.items)
    );

  const callId = Number(info.lastInsertRowid);
  const publicBaseUrl = getPublicBaseUrl();

  try {
    const twilio = require('twilio');
    const client = twilio(sid, token);
    const call = await client.calls.create({
      to: user.phone_number,
      from: fromNumber,
      url: `${publicBaseUrl}/api/twilio/voice/greeting?callId=${callId}`,
      statusCallback: `${publicBaseUrl}/api/twilio/status?callId=${callId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    db.prepare(
      `INSERT INTO schedules (user_id, last_call_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET last_call_at = datetime('now'), updated_at = datetime('now')`
    ).run(userId);

    return { ok: true, callId, sid: call.sid };
  } catch (err) {
    db.prepare(`UPDATE call_history SET status = 'Failed' WHERE id = ?`).run(callId);
    console.error('Twilio calls.create error:', err.message);
    return { ok: false, status: 502, error: err.message || 'Failed to place Twilio voice call.' };
  }
}

module.exports = { triggerRealPhoneCall };
