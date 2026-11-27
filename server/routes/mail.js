/* ==========================================================================
   Mail & Telegram Bot Call Routes (/api/emails/*, /api/calls/*, /api/call/test)
   ========================================================================== */

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const {
  getUnreadCount,
  fetchRecentEmails,
  summarizeEmailsWithGemini
} = require('../services/mailSummarizer');
const { sendTelegramVoiceCall } = require('../services/telegramCallService');
const { sendTelegramBriefing } = require('../services/telegramBot');
const { triggerRealPhoneCall } = require('../services/voiceCaller');

const router = express.Router();

function categoryToBadgeClass(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'important' || c === 'security alert') return 'badge-danger';
  if (c === 'promotional') return 'badge-warning';
  if (c === 'newsletter') return 'badge-info';
  return 'badge-primary';
}

function formatCallRow(row) {
  let items = [];
  try {
    items = JSON.parse(row.summary_json || '[]');
  } catch (err) {
    items = [];
  }

  const summaryEmails = items.map((item, idx) => ({
    id: `sum-${row.id}-${idx}`,
    title: item.title,
    sender: item.sender,
    category: item.category || 'Update',
    badgeClass: categoryToBadgeClass(item.category),
    shortLine: item.summary,
    fullSummary: item.summary
  }));

  const d = new Date(row.called_at.includes('T') ? row.called_at : `${row.called_at}Z`);
  const dateTime = Number.isNaN(d.getTime())
    ? row.called_at
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return {
    id: `call-${row.id}`,
    dbId: row.id,
    dateTime,
    calledAt: row.called_at,
    emailsCovered: Number(row.emails_covered) || 0,
    status: row.status,
    telegramChatId: row.telegram_chat_id || '',
    voiceUsed: row.voice_used || '',
    summaryPreview: row.summary_preview || '',
    telegramMessageId: row.telegram_message_id || '',
    spokenScript: row.spoken_script || '',
    summaryEmails
  };
}

async function executeTelegramCallForUser(userId, override = {}) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('User not found.');
  }

  const sched = db.prepare('SELECT * FROM schedules WHERE user_id = ?').get(userId);
  const skipIfEmpty = sched ? Boolean(sched.skip_if_empty) : true;
  const summaryLength = sched ? sched.summary_length : 'Standard (3-4 minutes)';
  const lastCallAt = sched ? sched.last_call_at : null;

  const chatId = String(
    override.chatId ||
      (sched && sched.telegram_chat_id) ||
      user.telegram_chat_id ||
      process.env.TELEGRAM_CHAT_ID ||
      ''
  ).trim();

  const voice = String(
    override.voice ||
      (sched && sched.tts_voice) ||
      user.telegram_tts_voice ||
      process.env.TELEGRAM_TTS_VOICE ||
      'en-IN-NeerjaNeural'
  ).trim();

  const { emails, source } = await fetchRecentEmails(userId, lastCallAt);

  if (emails.length === 0 && skipIfEmpty && !override.force) {
    const info = db
      .prepare(
        `INSERT INTO call_history (
           user_id, emails_covered, status, telegram_chat_id, voice_used, summary_preview, spoken_greeting, spoken_script, summary_json
         ) VALUES (?, 0, 'Skipped', ?, ?, 'No new unread emails.', ?, '', '[]')`
      )
      .run(userId, chatId || null, voice, 'No new unread emails since your last briefing.');

    const row = db.prepare('SELECT * FROM call_history WHERE id = ?').get(info.lastInsertRowid);
    return {
      ok: true,
      skipped: true,
      source,
      status: 'Skipped',
      call: formatCallRow(row)
    };
  }

  const summary = await summarizeEmailsWithGemini(emails, summaryLength);
  const previewSource = summary.items[0]
    ? `${summary.items[0].title}${summary.items.length > 1 ? ` (+${summary.items.length - 1} more)` : ''}`
    : summary.spokenScript;
  const summaryPreview = String(previewSource || '').slice(0, 120);

  let deliveryStatus = 'Delivered';
  let messageId = '';
  let deliveryError = null;

  try {
    const sent = await sendTelegramVoiceCall({
      summaryText: summary.spokenScript || summary.spokenGreeting,
      chatId,
      emailCount: emails.length,
      voice
    });
    messageId = sent.messageId || '';
  } catch (err) {
    deliveryStatus = 'Failed';
    deliveryError = err.message;
  }

  const info = db
    .prepare(
      `INSERT INTO call_history (
         user_id, emails_covered, status, telegram_chat_id, voice_used, summary_preview, telegram_message_id, spoken_greeting, spoken_script, summary_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      emails.length,
      deliveryStatus,
      chatId || null,
      voice,
      summaryPreview,
      messageId || null,
      summary.spokenGreeting,
      summary.spokenScript,
      JSON.stringify(summary.items)
    );

  if (deliveryStatus === 'Delivered') {
    db.prepare(
      `INSERT INTO schedules (user_id, last_call_at)
       VALUES (?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET last_call_at = datetime('now'), updated_at = datetime('now')`
    ).run(userId);
  }

  const row = db.prepare('SELECT * FROM call_history WHERE id = ?').get(info.lastInsertRowid);
  const formattedCall = formatCallRow(row);

  return {
    ok: deliveryStatus === 'Delivered',
    status: deliveryStatus,
    error: deliveryError,
    source,
    messageId,
    chatId,
    voiceUsed: voice,
    summaryPreview,
    spokenGreeting: summary.spokenGreeting,
    spokenScript: summary.spokenScript,
    items: formattedCall.summaryEmails,
    call: formattedCall
  };
}

router.get('/emails/unread-count', requireAuth, async (req, res) => {
  const result = await getUnreadCount(req.user.id);
  return res.json(result);
});

router.get('/calls', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM call_history WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(req.user.id);
  return res.json({ calls: rows.map(formatCallRow) });
});

router.post('/call/test', requireAuth, async (req, res) => {
  try {
    const { chatId, voice } = req.body || {};
    const result = await executeTelegramCallForUser(req.user.id, { chatId, voice, force: true });
    if (!result.ok) {
      return res.status(400).json({
        error: result.error || 'Failed to send Telegram voice note.',
        call: result.call
      });
    }
    return res.json(result);
  } catch (err) {
    console.error('Telegram Test Bot Call error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send Telegram voice note.' });
  }
});

router.post('/calls/simulate', requireAuth, async (req, res) => {
  try {
    const sched = db.prepare('SELECT * FROM schedules WHERE user_id = ?').get(req.user.id);
    const summaryLength = sched ? sched.summary_length : 'Standard (3-4 minutes)';
    const lastCallAt = sched ? sched.last_call_at : null;
    const { emails, source } = await fetchRecentEmails(req.user.id, lastCallAt);
    const summary = await summarizeEmailsWithGemini(emails, summaryLength);

    // Push Stage 15/16 summary + audio briefing to linked Telegram chat (best-effort)
    sendTelegramBriefing(req.user.id, summary).catch(() => {});

    return res.json({
      source,
      spokenGreeting: summary.spokenGreeting,
      spokenScript: summary.spokenScript,
      items: summary.items.map((item, idx) => ({
        id: `sim-${idx}`,
        title: item.title,
        sender: item.sender,
        category: item.category || 'Update',
        badgeClass: categoryToBadgeClass(item.category),
        shortLine: item.summary,
        fullSummary: item.summary
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to preview email briefing.' });
  }
});

router.post('/calls/real', requireAuth, async (req, res) => {
  const result = await triggerRealPhoneCall(req.user.id);
  if (!result.ok) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  return res.json(result);
});

module.exports = router;
module.exports.executeTelegramCallForUser = executeTelegramCallForUser;
