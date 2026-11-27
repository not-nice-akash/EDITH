/* ==========================================================================
   Background Call Scheduler (node-cron every minute -> Telegram Voice Notes)
   ========================================================================== */

const cron = require('node-cron');
const db = require('../db');
const { executeTelegramCallForUser } = require('../routes/mail');

const TIMEZONE_MAP = {
  '(GMT+5:30) India Standard Time': 'Asia/Kolkata',
  '(GMT+0:00) UTC / London': 'UTC',
  '(GMT-5:00) Eastern Time (US & Canada)': 'America/New_York',
  '(GMT-8:00) Pacific Time (US & Canada)': 'America/Los_Angeles',
  '(GMT+1:00) Central European Time': 'Europe/Berlin',
  '(GMT+8:00) Singapore / Hong Kong': 'Asia/Singapore',
  '(GMT+10:00) Sydney / Melbourne': 'Australia/Sydney'
};

const lastTriggeredMinute = new Map();

function resolveIanaTimezone(tzLabel) {
  if (!tzLabel) return 'Asia/Kolkata';
  if (TIMEZONE_MAP[tzLabel]) return TIMEZONE_MAP[tzLabel];
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tzLabel });
    return tzLabel;
  } catch (err) {
    return 'Asia/Kolkata';
  }
}

function getLocalClock(now, tzLabel) {
  const timeZone = resolveIanaTimezone(tzLabel);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);

  const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  const minute = get('minute');
  const hhmm = `${hour}:${minute}`;
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const weekday = get('weekday');
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';

  return { hhmm, dateStr, isWeekend };
}

function isWithinWindow(hhmm, start, end) {
  if (!start || !end) return true;
  if (start <= end) {
    return hhmm >= start && hhmm <= end;
  }
  return hhmm >= start || hhmm <= end;
}

function matchesSchedule(row, hhmm, now) {
  if (row.mode === 'once') {
    return hhmm === row.preferred_time;
  }

  if (row.mode === 'custom') {
    try {
      const slots = JSON.parse(row.custom_times_json || '[]');
      return Array.isArray(slots) && slots.includes(hhmm);
    } catch (err) {
      return false;
    }
  }

  if (row.mode === 'interval') {
    const hours = Number(row.interval_hours) || 4;
    if (!row.last_call_at) {
      return hhmm === row.preferred_time;
    }
    const lastMs = new Date(
      row.last_call_at.includes('T') ? row.last_call_at : `${row.last_call_at}Z`
    ).getTime();
    if (Number.isNaN(lastMs)) return false;
    return now.getTime() - lastMs >= hours * 60 * 60 * 1000;
  }

  return false;
}

async function runSchedulerTick() {
  const now = new Date();
  const rows = db
    .prepare(
      `SELECT s.*, u.id AS uid, u.telegram_chat_id AS user_chat_id
       FROM schedules s
       JOIN users u ON u.id = s.user_id
       WHERE s.is_active = 1`
    )
    .all();

  for (const row of rows) {
    try {
      const targetChat = row.telegram_chat_id || row.user_chat_id || process.env.TELEGRAM_CHAT_ID;
      if (!targetChat) continue;

      const { hhmm, dateStr, isWeekend } = getLocalClock(now, row.timezone);
      const minuteKey = `${dateStr} ${hhmm}`;

      if (lastTriggeredMinute.get(row.uid) === minuteKey) continue;
      if (!row.include_weekends && isWeekend) continue;
      if (row.calling_window_enabled && !isWithinWindow(hhmm, row.window_start, row.window_end)) {
        continue;
      }

      if (Number(row.max_calls_per_day) > 0) {
        const todayCountRow = db
          .prepare(
            `SELECT COUNT(*) AS cnt
             FROM call_history
             WHERE user_id = ?
               AND date(called_at) = date('now')
               AND status IN ('Delivered', 'Completed')`
          )
          .get(row.uid);
        if (todayCountRow && Number(todayCountRow.cnt) >= Number(row.max_calls_per_day)) {
          continue;
        }
      }

      if (!matchesSchedule(row, hhmm, now)) continue;

      lastTriggeredMinute.set(row.uid, minuteKey);
      console.log(`[Scheduler] Sending Telegram voice briefing for user ${row.uid} at ${minuteKey}`);
      await executeTelegramCallForUser(row.uid);
    } catch (err) {
      console.error(`[Scheduler] Error for user ${row.uid}:`, err.message);
    }
  }
}

function startScheduler() {
  const task = cron.schedule('* * * * *', () => {
    runSchedulerTick().catch((err) => console.error('[Scheduler] Tick error:', err));
  });
  console.log('EDITH Telegram voice scheduler started (every minute).');
  return task;
}

module.exports = { startScheduler, runSchedulerTick };
