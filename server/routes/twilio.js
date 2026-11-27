/* ==========================================================================
   Twilio Programmable Voice TwiML & Status Webhooks (/api/twilio/*)
   ========================================================================== */

const express = require('express');
const db = require('../db');

const router = express.Router();

const VOICE = 'Google.en-IN-Neural2-A';

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getBaseUrl(req) {
  const configured = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

function handleGreeting(req, res) {
  const callId = req.query.callId;
  const row = callId ? db.prepare('SELECT * FROM call_history WHERE id = ?').get(callId) : null;

  const greeting =
    (row && row.spoken_greeting) ||
    'Hello! This is EDITH Mail Bot. You have new emails waiting in your inbox.';

  const baseUrl = getBaseUrl(req);
  const summaryAction = `${baseUrl}/api/twilio/voice/summary?callId=${encodeURIComponent(callId || '')}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf speech" numDigits="1" timeout="6" action="${escapeXml(summaryAction)}" method="POST">
    <Say voice="${VOICE}">${escapeXml(greeting)} Press 1 or say yes to hear your summary.</Say>
  </Gather>
  <Redirect method="POST">${escapeXml(summaryAction)}</Redirect>
</Response>`;

  res.type('text/xml').send(twiml);
}

function handleSummary(req, res) {
  const callId = req.query.callId;
  const row = callId ? db.prepare('SELECT * FROM call_history WHERE id = ?').get(callId) : null;

  const script =
    (row && row.spoken_script) ||
    'You have no unread email summaries available at this moment.';

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}">${escapeXml(script)}</Say>
  <Say voice="${VOICE}">That's all for your new emails. Have a great day!</Say>
  <Hangup/>
</Response>`;

  res.type('text/xml').send(twiml);
}

router.get('/voice/greeting', handleGreeting);
router.post('/voice/greeting', handleGreeting);

router.get('/voice/summary', handleSummary);
router.post('/voice/summary', handleSummary);

router.post('/status', (req, res) => {
  const callId = req.query.callId;
  const callStatus = String((req.body && req.body.CallStatus) || '').toLowerCase();

  if (callId && callStatus) {
    let mappedStatus = null;
    if (callStatus === 'completed') {
      mappedStatus = 'Completed';
    } else if (['busy', 'no-answer', 'failed', 'canceled'].includes(callStatus)) {
      mappedStatus = 'Failed';
    } else if (['initiated', 'ringing', 'in-progress', 'answered'].includes(callStatus)) {
      mappedStatus = 'In Progress';
    }

    if (mappedStatus) {
      db.prepare('UPDATE call_history SET status = ? WHERE id = ?').run(mappedStatus, callId);
    }
  }

  res.status(200).send('OK');
});

module.exports = router;

