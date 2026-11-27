# EDITH Mail Bot

AI-powered email-to-voice-call assistant with Google OAuth 2.0, Gemini AI email summarization, free Telegram Bot (`@edith_briefing_bot`) voice briefings, and optional Twilio SMS OTP / Programmable Voice support.

## Prerequisites
- **Node.js 22.5+** (uses built-in `node:sqlite` for zero-compile SQLite storage)

## Quick Start (Local Development)

1. **Install dependencies:**
   ```bash
   npm install
   ```
   *(Automatically installs `server/` dependencies via `postinstall`, or run `cd server && npm install`.)*

2. **Configure environment variables:**
   Copy `server/.env.example` to `server/.env` and fill in your credentials:
   ```bash
   cp server/.env.example server/.env
   ```

   **Required / Recommended Variables (`server/.env`):**
   - `PORT=4000`
   - `FRONTEND_URL=http://localhost:4000`
   - `JWT_SECRET` — Long random string for `HttpOnly` session cookies
   - `ENCRYPTION_KEY` — 64-character hex string (32 bytes) for AES-256-GCM OAuth token encryption
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — Google OAuth 2.0 (`gmail.readonly` scope)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` — Telegram Bot API token & handle (`edith_briefing_bot`)
   - `GEMINI_API_KEY` — Google Gemini API key (falls back to rule-based summary if blank)
   - *(Optional)* `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SID`, `TWILIO_PHONE_NUMBER`, `PUBLIC_BASE_URL` — Enables Twilio SMS OTP & outbound voice calls; falls back to dev OTP & Telegram when blank.

3. **Start the server:**
   ```bash
   npm start
   ```
   Open [http://localhost:4000](http://localhost:4000).

## Deployment Notes
- **PaaS (Render / Railway / Fly.io):** Set the root `Start Command` to `npm start` (`node server/server.js`) and configure the environment variables above in your host dashboard.
- **Vercel:** `vercel.json` routes all requests to `server/server.js` (which exports `app` when imported as a module). Note that serverless deployments should use an external persistent database and webhook-based Telegram updates instead of long-polling if deployed on ephemeral filesystem functions.
