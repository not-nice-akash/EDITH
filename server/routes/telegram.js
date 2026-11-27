/* ==========================================================================
   Telegram Bot Setup & Auto-Detect Routes (/api/telegram/*)
   ========================================================================== */

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const {
  detectTelegramChat,
  verifyTelegramConnection
} = require('../services/telegramCallService');
const { fetchRecentEmails, summarizeEmailsWithGemini } = require('../services/mailSummarizer');
const { sendTelegramBriefing } = require('../services/telegramBot');

const router = express.Router();

router.post('/link-token', requireAuth, (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET telegram_link_token = ? WHERE id = ?').run(token, req.user.id);

  const botUsername = (process.env.TELEGRAM_BOT_USERNAME || 'edith_briefing_bot').replace(/^@/, '');
  return res.json({
    url: `https://t.me/${botUsername}?start=${token}`,
    token,
    connected: Boolean(req.user.telegram_chat_id),
    telegramChatId: req.user.telegram_chat_id || ''
  });
});

router.post('/test', requireAuth, async (req, res) => {
  try {
    const sched = db.prepare('SELECT * FROM schedules WHERE user_id = ?').get(req.user.id);
    const summaryLength = sched ? sched.summary_length : 'Standard (3-4 minutes)';
    const lastCallAt = sched ? sched.last_call_at : null;

    const { emails } = await fetchRecentEmails(req.user.id, lastCallAt);
    const summary = await summarizeEmailsWithGemini(emails, summaryLength);

    const result = await sendTelegramBriefing(req.user.id, summary);
    if (!result.sent) {
      return res.status(400).json({ error: result.reason || 'Telegram is not connected yet.' });
    }

    const previewSource = summary.items[0]
      ? `${summary.items[0].title}${summary.items.length > 1 ? ` (+${summary.items.length - 1} more)` : ''}`
      : summary.spokenScript;

    db.prepare(
      `INSERT INTO call_history (
         user_id, emails_covered, status, telegram_chat_id, voice_used, summary_preview, spoken_greeting, spoken_script, summary_json
       ) VALUES (?, ?, 'Delivered', ?, 'google-tts-api', ?, ?, ?, ?)`
    ).run(
      req.user.id,
      emails.length,
      result.chatId,
      String(previewSource || '').slice(0, 120),
      summary.spokenGreeting,
      summary.spokenScript,
      JSON.stringify(summary.items)
    );

    return res.json({
      ok: true,
      chatId: result.chatId,
      emailsCovered: emails.length,
      summaryPreview: String(previewSource || '').slice(0, 120)
    });
  } catch (err) {
    console.error('POST /api/telegram/test error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send Telegram briefing.' });
  }
});

router.get('/detect-chat', requireAuth, async (req, res) => {
  try {
    const result = await detectTelegramChat(process.env.TELEGRAM_BOT_TOKEN);
    db.prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?').run(result.chatId, req.user.id);
    db.prepare(
      `INSERT INTO schedules (user_id, telegram_chat_id)
       VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET telegram_chat_id = excluded.telegram_chat_id, updated_at = datetime('now')`
    ).run(req.user.id, result.chatId);

    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not detect Telegram Chat ID.' });
  }
});

router.post('/verify', requireAuth, async (req, res) => {
  try {
    const chatId = String((req.body && req.body.chatId) || req.user.telegram_chat_id || '').trim();
    const ttsVoice = String((req.body && req.body.ttsVoice) || req.user.telegram_tts_voice || 'en-IN-NeerjaNeural').trim();

    const result = await verifyTelegramConnection(process.env.TELEGRAM_BOT_TOKEN, chatId);

    if (chatId) {
      db.prepare('UPDATE users SET telegram_chat_id = ?, telegram_tts_voice = ? WHERE id = ?').run(
        chatId,
        ttsVoice,
        req.user.id
      );
      db.prepare(
        `INSERT INTO schedules (user_id, telegram_chat_id, tts_voice)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           telegram_chat_id = excluded.telegram_chat_id,
           tts_voice = excluded.tts_voice,
           updated_at = datetime('now')`
      ).run(req.user.id, chatId, ttsVoice);
    }

    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Telegram verification failed.' });
  }
});

router.put('/settings', requireAuth, (req, res) => {
  const chatId = String((req.body && req.body.telegramChatId) || '').trim();
  const ttsVoice = String((req.body && req.body.ttsVoice) || 'en-IN-NeerjaNeural').trim();

  db.prepare('UPDATE users SET telegram_chat_id = ?, telegram_tts_voice = ? WHERE id = ?').run(
    chatId || null,
    ttsVoice,
    req.user.id
  );
  db.prepare(
    `INSERT INTO schedules (user_id, telegram_chat_id, tts_voice)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       telegram_chat_id = excluded.telegram_chat_id,
       tts_voice = excluded.tts_voice,
       updated_at = datetime('now')`
  ).run(req.user.id, chatId || null, ttsVoice);

  return res.json({
    ok: true,
    telegramChatId: chatId,
    ttsVoice
  });
});

module.exports = router;
