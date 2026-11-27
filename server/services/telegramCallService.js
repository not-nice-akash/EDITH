/* ==========================================================================
   Telegram Bot API + Edge TTS Voice Note Service (100% Free, Zero FFmpeg)
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { EdgeTTS } = require('node-edge-tts');

const TMP_DIR = path.join(__dirname, '..', 'tmp');

function cleanForTts(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*#_`~>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveLangFromVoice(voice) {
  const parts = String(voice || 'en-IN-NeerjaNeural').split('-');
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return 'en-IN';
}

function truncateCaption(text, maxLen = 1000) {
  const cleaned = String(text || '').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 3)}...`;
}

async function sendTelegramVoiceCall({ summaryText, chatId, emailCount = 0, voice }) {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const targetChatId = String(chatId || process.env.TELEGRAM_CHAT_ID || '').trim();
  const ttsVoice = String(voice || process.env.TELEGRAM_TTS_VOICE || 'en-IN-NeerjaNeural').trim();

  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured in server/.env.');
  }
  if (!targetChatId) {
    throw new Error('Telegram Chat ID is missing. Configure it in Settings or Auto-Detect after sending /start.');
  }

  const cleanedBody = cleanForTts(summaryText);
  const countPhrase =
    emailCount > 0 ? `You have ${emailCount} unread email${emailCount === 1 ? '' : 's'}. ` : '';
  const spokenInput = `Hello, this is EDITH with your inbox briefing. ${countPhrase}${cleanedBody}`;

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tmpFilePath = path.join(TMP_DIR, `edith-voice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);

  try {
    const tts = new EdgeTTS({
      voice: ttsVoice,
      lang: deriveLangFromVoice(ttsVoice),
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
    });

    await tts.ttsPromise(spokenInput, tmpFilePath);

    const audioBuffer = fs.readFileSync(tmpFilePath);
    const form = new FormData();
    form.append('chat_id', targetChatId);
    form.append('voice', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'edith-briefing.mp3');
    form.append(
      'caption',
      truncateCaption(`🤖 EDITH Mail Bot (${emailCount} email${emailCount === 1 ? '' : 's'})\n\n${cleanedBody}`, 1020)
    );

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, {
      method: 'POST',
      body: form
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.description || `Telegram sendVoice failed (${res.status})`);
    }

    return {
      ok: true,
      messageId: String(data.result && data.result.message_id ? data.result.message_id : ''),
      chatId: targetChatId,
      voiceUsed: ttsVoice
    };
  } finally {
    try {
      if (fs.existsSync(tmpFilePath)) {
        fs.unlinkSync(tmpFilePath);
      }
    } catch (cleanupErr) {
      // Ignore temp cleanup errors
    }
  }
}

async function verifyTelegramConnection(botToken, chatId) {
  const token = String(botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const targetChatId = String(chatId || process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured in server/.env.');
  }

  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meData = await meRes.json();
  if (!meRes.ok || !meData.ok) {
    throw new Error(meData.description || 'Invalid TELEGRAM_BOT_TOKEN.');
  }

  let messageId = null;
  if (targetChatId) {
    const msgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: '✅ EDITH Mail Bot is connected! You will receive AI voice briefings here.'
      })
    });
    const msgData = await msgRes.json();
    if (!msgRes.ok || !msgData.ok) {
      throw new Error(msgData.description || 'Failed to send test message to this Chat ID.');
    }
    messageId = String(msgData.result.message_id);
  }

  return {
    ok: true,
    bot: {
      id: meData.result.id,
      username: meData.result.username,
      firstName: meData.result.first_name
    },
    chatId: targetChatId,
    messageId
  };
}

async function detectTelegramChat(botToken) {
  const token = String(botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured in server/.env.');
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20&offset=-20`);
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || 'Failed to query Telegram getUpdates.');
  }

  const updates = Array.isArray(data.result) ? data.result : [];
  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const msg = updates[i].message || updates[i].edited_message || updates[i].my_chat_member;
    if (msg && msg.chat && msg.chat.id) {
      return {
        ok: true,
        chatId: String(msg.chat.id),
        username: msg.chat.username || '',
        firstName: msg.chat.first_name || ''
      };
    }
  }

  throw new Error('No recent messages found. Open your Telegram bot, tap /start, and try Auto-Detect again.');
}

module.exports = {
  cleanForTts,
  sendTelegramVoiceCall,
  verifyTelegramConnection,
  detectTelegramChat
};
