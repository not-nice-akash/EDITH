/* ==========================================================================
   EDITH Mail Bot - Express Backend Server
   ========================================================================== */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedule');
const mailRoutes = require('./routes/mail');
const telegramRoutes = require('./routes/telegram');
const twilioRoutes = require('./routes/twilio');
const { startScheduler } = require('./services/scheduler');
const { initTelegramBot } = require('./services/telegramBot');

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'edith-mail-bot-api' });
});

// Auth, OAuth & OTP routes
app.use('/auth', authRoutes);

// Schedule, Mail, Telegram & Call History API routes
app.use('/api', scheduleRoutes);
app.use('/api', mailRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/twilio', twilioRoutes);

// Serve the static frontend from the project root
const frontendRoot = path.join(__dirname, '..');
app.use(express.static(frontendRoot));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendRoot, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`EDITH Mail Bot server running at http://localhost:${PORT}`);
    initTelegramBot();
    startScheduler();
  });
}

module.exports = app;
