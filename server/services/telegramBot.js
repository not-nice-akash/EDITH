/* ==========================================================================
   Telegram Bot Service (@edith_briefing_bot) using node-telegram-bot-api v2
   - Handles /start <linkToken>, /summary, /unread
   - Sends formatted email highlights + google-tts-api audio briefings
   ========================================================================== */

const tgPkg = require('node-telegram-bot-api');
const Bot = tgPkg.Bot || tgPkg.default || tgPkg;
const InputFile = tgPkg.InputFile;
const googleTTS = require('google-tts-api');
const db = require('../db');
const { fetchRecentEmails, summarizeEmailsWithGemini } = require('./mailSummarizer');

let botInstance = null;

function formatCategoryIcon(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'security alert') return '🛡️';
  if (c === 'important') return '❗';
  if (c === 'promotional') return '🏷️';
  if (c === 'newsletter') return '📰';
  return '📩';
}

function formatSummaryMessage(summaryData) {
  const items = Array.isArray(summaryData.items) ? summaryData.items : [];
  const header = `🤖 *EDITH Mail Bot — Inbox Briefing*\n${summaryData.spokenGreeting || ''}\n`;

  if (items.length === 0) {
    return `${header}\n✨ No unread emails right now.`;
  }

  const lines = items.map((item, idx) => {
    const icon = formatCategoryIcon(item.category);
    const title = String(item.title || '').replace(/[*_`]/g, '');
    const sender = String(item.sender || '').replace(/[*_`]/g, '');
    const body = String(item.shortLine || item.summary || '').replace(/[*_`]/g, '');
    return `${idx + 1}. ${icon} *[${item.category || 'Update'}]* ${title}\n   _From:_ ${sender}\n   ${body}`;
  });

  return `${header}\n${lines.join('\n\n')}`.slice(0, 3900);
}

async function synthesizeGoogleTtsBuffer(text) {
  const cleanText = String(text || '')
    .replace(/[*#_`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) return null;

  const chunks = await googleTTS.getAllAudioBase64(cleanText, {
    lang: 'en',
    slow: false,
    host: 'https://translate.google.com',
    timeout: 15000
  });

  const buffers = chunks.map((c) => Buffer.from(c.base64, 'base64'));
  return Buffer.concat(buffers);
}

async function sendTelegramBriefing(userId, summaryData) {
  if (!botInstance) {
    return { sent: false, reason: 'Telegram bot not initialized (TELEGRAM_BOT_TOKEN missing).' };
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const chatId = (user && user.telegram_chat_id) || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    return { sent: false, reason: 'User has not linked a Telegram chat yet.' };
  }

  const textMessage = formatSummaryMessage(summaryData);
  await botInstance.api
    .sendMessage({ chat_id: chatId, text: textMessage, parse_mode: 'Markdown' })
    .catch(() =>
      botInstance.api.sendMessage({ chat_id: chatId, text: textMessage.replace(/[*_]/g, '') })
    );

  const spokenText = summaryData.spokenScript || summaryData.spokenGreeting;
  if (spokenText) {
    try {
      const audioBuffer = await synthesizeGoogleTtsBuffer(spokenText);
      if (audioBuffer && audioBuffer.length > 0) {
        const audioFile = InputFile
          ? new InputFile(audioBuffer, { filename: 'edith-briefing.mp3', contentType: 'audio/mpeg' })
          : audioBuffer;
        await botInstance.api.sendAudio({
          chat_id: chatId,
          audio: audioFile,
          title: 'EDITH Inbox Voice Briefing',
          performer: 'EDITH Mail Bot'
        });
      }
    } catch (ttsErr) {
      console.error('[TelegramBot] Audio synthesis/send error:', ttsErr.message);
    }
  }

  return { sent: true, chatId };
}

function initTelegramBot() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) {
    console.log('Telegram Bot polling skipped (TELEGRAM_BOT_TOKEN not set).');
    return null;
  }

  if (botInstance) return botInstance;

  botInstance = new Bot(token);

  botInstance.catch((err) => {
    console.error('[TelegramBot] Handler error:', err.message);
  });

  // /start <linkToken>
  botInstance.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const rawText = (ctx.message && ctx.message.text) || '';
    const linkToken = rawText.replace(/^\/start(?:@\w+)?\s*/, '').trim();

    if (linkToken) {
      const user = db
        .prepare('SELECT * FROM users WHERE telegram_link_token = ?')
        .get(linkToken);

      if (user) {
        db.prepare(
          `UPDATE users
           SET telegram_chat_id = ?, telegram_link_token = NULL
           WHERE id = ?`
        ).run(chatId, user.id);

        db.prepare(
          `INSERT INTO schedules (user_id, telegram_chat_id)
           VALUES (?, ?)
           ON CONFLICT(user_id) DO UPDATE SET telegram_chat_id = excluded.telegram_chat_id, updated_at = datetime('now')`
        ).run(user.id, chatId);

        await ctx.reply(
          'Connected! Your EDITH Mail Bot summaries and voice briefings will arrive here.'
        );
        return;
      }

      await ctx.reply(
        'That link token has expired or is invalid. Please generate a new link from your EDITH Mail Bot dashboard.'
      );
      return;
    }

    await ctx.reply(
      '👋 Welcome to EDITH Mail Bot! Link your account from the EDITH dashboard, or send /summary anytime once connected.'
    );
  });

  // /summary and /unread
  const handleSummaryCommand = async (ctx) => {
    const chatId = String(ctx.chat.id);
    const user = db.prepare('SELECT * FROM users WHERE telegram_chat_id = ?').get(chatId);

    if (!user) {
      await ctx.reply(
        'Your Telegram account is not linked to EDITH Mail Bot yet. Click "Connect Telegram" in your EDITH dashboard first.'
      );
      return;
    }

    await ctx.reply('⏳ Fetching your latest emails and preparing your briefing...');

    try {
      const sched = db.prepare('SELECT * FROM schedules WHERE user_id = ?').get(user.id);
      const summaryLength = sched ? sched.summary_length : 'Standard (3-4 minutes)';
      const lastCallAt = sched ? sched.last_call_at : null;

      const { emails } = await fetchRecentEmails(user.id, lastCallAt);
      const summary = await summarizeEmailsWithGemini(emails, summaryLength);

      await sendTelegramBriefing(user.id, summary);
    } catch (err) {
      console.error('[TelegramBot] /summary error:', err);
      await ctx.reply('Sorry, I could not generate your briefing right now.');
    }
  };

  botInstance.command('summary', handleSummaryCommand);
  botInstance.command('unread', handleSummaryCommand);

  botInstance.startPolling().catch((err) => {
    console.error('[TelegramBot] Polling error:', err.message);
  });

  console.log(`Telegram Bot (@${process.env.TELEGRAM_BOT_USERNAME || 'edith_briefing_bot'}) polling started.`);
  return botInstance;
}

module.exports = {
  initTelegramBot,
  sendTelegramBriefing
};
