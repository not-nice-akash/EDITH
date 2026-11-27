/* ==========================================================================
   Gmail Fetcher & Gemini 2.5 Flash Email Summarizer Service
   ========================================================================== */

const { google } = require('googleapis');
const { GoogleGenAI } = require('@google/genai');
const db = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');

const FALLBACK_SAMPLE_EMAILS = [
  {
    id: 'demo-1',
    from: 'registrar@college.edu',
    subject: 'Winter 2026 Examination Timetable Published',
    date: new Date().toISOString(),
    body: 'The Office of the Registrar released the Winter 2026 examination schedule. Hall tickets are available on the student portal starting Monday.'
  },
  {
    id: 'demo-2',
    from: 'careers@tcs.com',
    subject: 'TCS Prime Role Technical Interview Invitation',
    date: new Date().toISOString(),
    body: 'Congratulations! You have been shortlisted for the TCS technical interview this Thursday at 11:00 AM. Join 15 minutes early with your ID.'
  },
  {
    id: 'demo-3',
    from: 'offers@amazon.in',
    subject: 'Lightning Deals on Electronics in Your Cart',
    date: new Date().toISOString(),
    body: 'Save up to 40% on noise-canceling headphones and USB-C accessories. Offer ends tonight at 11:59 PM.'
  },
  {
    id: 'demo-4',
    from: 'no-reply@google.com',
    subject: 'Security alert: New sign-in on Windows Chrome',
    date: new Date().toISOString(),
    body: 'Your Google account was accessed from a new Windows device in Bengaluru. Review your security activity if this was not you.'
  },
  {
    id: 'demo-5',
    from: 'updates@geeksforgeeks.org',
    subject: 'Weekly DSA & System Design Digest',
    date: new Date().toISOString(),
    body: 'Top 20 Dynamic Programming patterns, distributed rate limiter architecture notes, and weekend coding contest alerts.'
  }
];

function getGmailAccountRow(userId) {
  return db
    .prepare(
      `SELECT * FROM email_accounts
       WHERE user_id = ? AND lower(provider) = 'gmail'
         AND (encrypted_access_token IS NOT NULL OR encrypted_refresh_token IS NOT NULL)
       ORDER BY is_default DESC, id ASC
       LIMIT 1`
    )
    .get(userId);
}

function getGmailClientForUser(userId) {
  const account = getGmailAccountRow(userId);
  if (!account) return null;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback';

  if (!clientId || !clientSecret) return null;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const accessToken = account.encrypted_access_token ? decrypt(account.encrypted_access_token) : undefined;
  const refreshToken = account.encrypted_refresh_token ? decrypt(account.encrypted_refresh_token) : undefined;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: account.token_expiry || undefined
  });

  // Persist refreshed tokens automatically
  oauth2Client.on('tokens', (tokens) => {
    try {
      const newEncAccess = tokens.access_token ? encrypt(tokens.access_token) : null;
      const newEncRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
      const newExpiry = tokens.expiry_date || null;

      db.prepare(
        `UPDATE email_accounts
         SET encrypted_access_token = COALESCE(?, encrypted_access_token),
             encrypted_refresh_token = COALESCE(?, encrypted_refresh_token),
             token_expiry = COALESCE(?, token_expiry)
         WHERE id = ?`
      ).run(newEncAccess, newEncRefresh, newExpiry, account.id);
    } catch (err) {
      console.error('Failed to persist refreshed Gmail tokens:', err);
    }
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return { gmail, account };
}

function decodeBase64Url(data) {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const found = extractPlainText(part);
      if (found) return found;
    }
  }
  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, ' ');
  }
  return '';
}

function cleanText(text) {
  return String(text || '')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

async function getUnreadCount(userId) {
  const clientInfo = getGmailClientForUser(userId);
  if (!clientInfo) {
    return { unreadCount: null, source: 'no_gmail_tokens' };
  }

  try {
    const { gmail } = clientInfo;
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox is:unread',
      maxResults: 100
    });
    const count = Array.isArray(res.data.messages) ? res.data.messages.length : (res.data.resultSizeEstimate || 0);
    return { unreadCount: count, source: 'gmail' };
  } catch (err) {
    console.error('Gmail unread count error:', err.message);
    return { unreadCount: null, source: 'gmail_error' };
  }
}

async function fetchRecentEmails(userId, lastCallAt) {
  const clientInfo = getGmailClientForUser(userId);
  if (!clientInfo) {
    return { emails: FALLBACK_SAMPLE_EMAILS, source: 'demo_fallback' };
  }

  const { gmail } = clientInfo;
  let q = 'in:inbox is:unread';
  if (lastCallAt) {
    const epochSec = Math.floor(new Date(lastCallAt).getTime() / 1000);
    if (!Number.isNaN(epochSec) && epochSec > 0) {
      q = `in:inbox is:unread after:${epochSec}`;
    }
  }

  let listRes = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: 10
  });

  let messageRefs = listRes.data.messages || [];
  if (messageRefs.length === 0 && lastCallAt) {
    // Fallback to general unread inbox messages if none arrived since last_call_at
    listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox is:unread',
      maxResults: 10
    });
    messageRefs = listRes.data.messages || [];
  }

  if (messageRefs.length === 0) {
    return { emails: [], source: 'gmail' };
  }

  const emails = await Promise.all(
    messageRefs.slice(0, 10).map(async (ref) => {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: ref.id,
        format: 'full'
      });
      const headers = (msgRes.data.payload && msgRes.data.payload.headers) || [];
      const getHeader = (name) => {
        const h = headers.find((item) => item.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
      };
      const rawBody = extractPlainText(msgRes.data.payload) || msgRes.data.snippet || '';
      return {
        id: ref.id,
        from: getHeader('From') || 'unknown@sender.com',
        subject: getHeader('Subject') || '(No Subject)',
        date: getHeader('Date') || '',
        body: cleanText(rawBody || msgRes.data.snippet)
      };
    })
  );

  return { emails, source: 'gmail' };
}

function classifyRuleBased(email) {
  const text = `${email.subject} ${email.from} ${email.body}`.toLowerCase();
  if (/security|sign-in|password|otp|verify|alert/.test(text)) return 'Security Alert';
  if (/interview|exam|notice|urgent|deadline|invoice|offer letter/.test(text)) return 'Important';
  if (/deal|discount|sale|offer|promo|off\b|cart/.test(text)) return 'Promotional';
  if (/digest|newsletter|weekly|updates@|unsubscribe/.test(text)) return 'Newsletter';
  return 'Update';
}

function buildRuleBasedSummary(emails, summaryLength = 'Standard (3-4 minutes)') {
  const count = emails.length;
  if (count === 0) {
    return {
      spokenGreeting: 'Hello! This is EDITH Mail Bot. You have no new unread emails right now.',
      spokenScript: 'Your inbox is completely clear. Have a great day!',
      items: []
    };
  }

  const items = emails.map((e) => ({
    title: e.subject,
    category: classifyRuleBased(e),
    sender: e.from,
    summary: e.body || e.subject
  }));

  const isBrief = String(summaryLength).toLowerCase().startsWith('brief');
  const highlights = items
    .slice(0, isBrief ? 3 : items.length)
    .map((item, idx) => `Email ${idx + 1}, ${item.category}: ${item.title}. ${item.summary.slice(0, 120)}`)
    .join(' ');

  return {
    spokenGreeting: `Hello! This is EDITH Mail Bot. You have ${count} new email${count === 1 ? '' : 's'} since your last briefing. Would you like to hear the summary?`,
    spokenScript: `${highlights} That's all for your new emails. Have a great day!`,
    items
  };
}

async function summarizeEmailsWithGemini(emails, summaryLength = 'Standard (3-4 minutes)') {
  if (!emails || emails.length === 0) {
    return buildRuleBasedSummary([], summaryLength);
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return buildRuleBasedSummary(emails, summaryLength);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      'You are EDITH Mail Bot, an AI voice assistant summarizing unread emails for a phone call.',
      `Target summary length: ${summaryLength}.`,
      'Return ONLY valid JSON matching this exact schema:',
      '{',
      '  "spokenGreeting": "short opening line mentioning the exact email count",',
      '  "spokenScript": "natural, conversational voice briefing summarizing the emails",',
      '  "items": [',
      '    {',
      '      "title": "short email headline",',
      '      "category": "Important" | "Promotional" | "Security Alert" | "Newsletter" | "Update",',
      '      "sender": "sender email or name",',
      '      "summary": "concise 1-2 sentence summary"',
      '    }',
      '  ]',
      '}',
      '',
      `Emails (${emails.length} total):`,
      JSON.stringify(emails, null, 2)
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse(response.text);
    if (!parsed || !Array.isArray(parsed.items)) {
      return buildRuleBasedSummary(emails, summaryLength);
    }

    return {
      spokenGreeting:
        parsed.spokenGreeting ||
        `Hello! This is EDITH Mail Bot. You have ${emails.length} new emails since your last briefing.`,
      spokenScript: parsed.spokenScript || '',
      items: parsed.items
    };
  } catch (err) {
    console.error('Gemini summarization error (falling back to rule-based):', err.message);
    return buildRuleBasedSummary(emails, summaryLength);
  }
}

module.exports = {
  getUnreadCount,
  fetchRecentEmails,
  summarizeEmailsWithGemini
};
