/* ==========================================================================
   EDITH Mail Bot - Backend API Client (fetch with credentials: "include")
   ========================================================================== */

(function (global) {
  'use strict';

  const EDITH = (global.EDITH = global.EDITH || {});
  const API_BASE = global.location.port === '4000' ? '' : 'http://localhost:4000';

  async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  EDITH.backend = {
    API_BASE,
    getGoogleAuthUrl(options = {}) {
      return options.switch ? `${API_BASE}/auth/google?switch=true` : `${API_BASE}/auth/google`;
    },
    getMe() {
      return request('/auth/me');
    },
    confirmDefaultEmail(accountId) {
      return request('/auth/default-email/confirm', {
        method: 'POST',
        body: JSON.stringify({ accountId })
      });
    },
    signup(email, password, name) {
      return request('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, name })
      });
    },
    login(email, password) {
      return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
    },
    logout() {
      return request('/auth/logout', { method: 'POST' });
    },
    sendOtp(countryCode, phoneNumber) {
      return request('/auth/phone/send-otp', {
        method: 'POST',
        body: JSON.stringify({ countryCode, phoneNumber })
      });
    },
    verifyOtp(countryCode, phoneNumber, code, callConsent) {
      return request('/auth/phone/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ countryCode, phoneNumber, code, callConsent })
      });
    },
    completeOnboarding() {
      return request('/auth/onboarding/complete', { method: 'POST' });
    },
    getSchedule() {
      return request('/api/schedule');
    },
    saveSchedule(payload) {
      return request('/api/schedule', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    },
    getUnreadCount() {
      return request('/api/emails/unread-count');
    },
    getCalls() {
      return request('/api/calls');
    },
    simulateCall() {
      return request('/api/calls/simulate', { method: 'POST' });
    },
    testBotCall(chatId, voice) {
      return request('/api/call/test', {
        method: 'POST',
        body: JSON.stringify({ chatId, voice })
      });
    },
    detectTelegramChat() {
      return request('/api/telegram/detect-chat');
    },
    verifyTelegram(chatId, ttsVoice) {
      return request('/api/telegram/verify', {
        method: 'POST',
        body: JSON.stringify({ chatId, ttsVoice })
      });
    },
    saveTelegramSettings(telegramChatId, ttsVoice) {
      return request('/api/telegram/settings', {
        method: 'PUT',
        body: JSON.stringify({ telegramChatId, ttsVoice })
      });
    },
    createTelegramLinkToken() {
      return request('/api/telegram/link-token', { method: 'POST' });
    },
    sendTelegramTestBriefing() {
      return request('/api/telegram/test', { method: 'POST' });
    }
  };
})(window);
