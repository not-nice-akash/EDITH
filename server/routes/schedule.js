/* ==========================================================================
   Schedule & Preferences Routes (/api/schedule)
   ========================================================================== */

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function ensureScheduleRow(userId) {
  let row = db.prepare('SELECT * FROM schedules WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO schedules (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM schedules WHERE user_id = ?').get(userId);
  }
  return row;
}

function formatSchedule(row) {
  let customTimes = ['09:00', '18:00'];
  try {
    const parsed = JSON.parse(row.custom_times_json);
    if (Array.isArray(parsed) && parsed.length > 0) customTimes = parsed;
  } catch (err) {
    // Keep default
  }

  return {
    isActive: Boolean(row.is_active),
    lastCallAt: row.last_call_at || null,
    telegramChatId: row.telegram_chat_id || '',
    ttsVoice: row.tts_voice || process.env.TELEGRAM_TTS_VOICE || 'en-IN-NeerjaNeural',
    schedule: {
      mode: row.mode,
      preferredTime: row.preferred_time,
      intervalHours: Number(row.interval_hours) || 4,
      customTimes
    },
    settings: {
      callingWindowEnabled: Boolean(row.calling_window_enabled),
      windowStart: row.window_start,
      windowEnd: row.window_end,
      maxCallsEnabled: Number(row.max_calls_per_day) > 0,
      maxCallsPerDay: Number(row.max_calls_per_day) || 4,
      skipIfEmpty: Boolean(row.skip_if_empty),
      includeWeekends: Boolean(row.include_weekends),
      summaryLength: row.summary_length,
      timezone: row.timezone
    }
  };
}

router.get('/schedule', requireAuth, (req, res) => {
  const row = ensureScheduleRow(req.user.id);
  return res.json(formatSchedule(row));
});

router.put('/schedule', requireAuth, (req, res) => {
  const current = ensureScheduleRow(req.user.id);
  const body = req.body || {};
  const sched = body.schedule || {};
  const settings = body.settings || {};

  const isActive =
    typeof body.isActive === 'boolean' ? (body.isActive ? 1 : 0) : current.is_active;
  const mode = ['once', 'interval', 'custom'].includes(sched.mode) ? sched.mode : current.mode;
  const preferredTime = sched.preferredTime || current.preferred_time;
  const intervalHours = Number(sched.intervalHours) || current.interval_hours;
  const customTimesJson = Array.isArray(sched.customTimes)
    ? JSON.stringify(sched.customTimes)
    : current.custom_times_json;

  const callingWindowEnabled =
    typeof settings.callingWindowEnabled === 'boolean'
      ? settings.callingWindowEnabled ? 1 : 0
      : current.calling_window_enabled;
  const windowStart = settings.windowStart || current.window_start;
  const windowEnd = settings.windowEnd || current.window_end;
  const maxCallsPerDay =
    settings.maxCallsEnabled === false
      ? 0
      : Number(settings.maxCallsPerDay) || current.max_calls_per_day || 4;
  const skipIfEmpty =
    typeof settings.skipIfEmpty === 'boolean'
      ? settings.skipIfEmpty ? 1 : 0
      : current.skip_if_empty;
  const includeWeekends =
    typeof settings.includeWeekends === 'boolean'
      ? settings.includeWeekends ? 1 : 0
      : current.include_weekends;
  const summaryLength = settings.summaryLength || current.summary_length;
  const timezone = settings.timezone || current.timezone;

  db.prepare(
    `UPDATE schedules
     SET is_active = ?,
         mode = ?,
         preferred_time = ?,
         interval_hours = ?,
         custom_times_json = ?,
         calling_window_enabled = ?,
         window_start = ?,
         window_end = ?,
         max_calls_per_day = ?,
         skip_if_empty = ?,
         include_weekends = ?,
         summary_length = ?,
         timezone = ?,
         updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(
    isActive,
    mode,
    preferredTime,
    intervalHours,
    customTimesJson,
    callingWindowEnabled,
    windowStart,
    windowEnd,
    maxCallsPerDay,
    skipIfEmpty,
    includeWeekends,
    summaryLength,
    timezone,
    req.user.id
  );

  const updated = db.prepare('SELECT * FROM schedules WHERE user_id = ?').get(req.user.id);
  return res.json(formatSchedule(updated));
});

module.exports = router;
