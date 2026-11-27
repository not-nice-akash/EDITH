/* ==========================================================================
   EDITH Mail Bot - Core Router, Utilities, Modals & Backend API Hooks
   ========================================================================== */

(function (global) {
  'use strict';

  const EDITH = global.EDITH;

  /**
   * Placeholder API layer for future backend integration.
   * Replace simulated Promises with fetch() calls to your REST/GraphQL backend.
   */
  EDITH.api = {
    async signInWithOAuth(provider) {
      // TODO: Redirect to /api/auth/oauth/:provider
      return { provider, email: 'akash2004@gmail.com', name: 'Akash' };
    },
    async signInWithEmail(email) {
      // TODO: POST /api/auth/login
      const namePart = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim();
      const name = namePart ? namePart.charAt(0).toUpperCase() + namePart.slice(1) : 'User';
      return { provider: 'Email', email, name };
    },
    async sendOtp(countryCode, number) {
      // TODO: POST /api/phone/send-otp
      const code = String(Math.floor(100000 + Math.random() * 900000));
      return { sent: true, demoCode: code, phone: `${countryCode} ${number}` };
    },
    async verifyOtp(inputCode, expectedCode) {
      // TODO: POST /api/phone/verify-otp
      return inputCode.trim() === expectedCode;
    },
    async connectEmailAccount(account) {
      // TODO: POST /api/accounts/connect
      return { ...account, id: `acc-${Date.now()}`, connected: true };
    },
    async saveScheduleAndPreferences(payload) {
      // TODO: PUT /api/user/preferences
      return { ok: true, payload };
    },
    async toggleBotStatus(active) {
      // TODO: PATCH /api/bot/status
      return { active };
    },
    async logCallResult(entry) {
      // TODO: POST /api/calls/history
      return entry;
    }
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 180ms ease';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  function renderProviderIcon(provider) {
    const p = String(provider || '').toLowerCase();
    if (p === 'gmail' || p === 'google') {
      return '<span aria-hidden="true" style="font-weight:800;color:#EA4335;">G</span>';
    }
    return '<span aria-hidden="true">✉️</span>';
  }

  function navigateToView(viewName) {
    EDITH.state.currentView = viewName;
    EDITH.saveState();

    document.getElementById('view-landing').classList.toggle('hidden', viewName !== 'landing');
    document.getElementById('view-onboarding').classList.toggle('hidden', viewName !== 'onboarding');
    document.getElementById('view-dashboard').classList.toggle('hidden', viewName !== 'dashboard');

    if (viewName === 'onboarding' && typeof EDITH.renderOnboarding === 'function') {
      EDITH.renderOnboarding();
    } else if (viewName === 'dashboard' && typeof EDITH.renderDashboard === 'function') {
      EDITH.renderDashboard();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ========================================================================
     Shared Modal: Connect Email Account (Stages 5 & 9)
     ======================================================================== */
  function openConnectEmailModal(defaultProvider, onAdded) {
    const modal = document.getElementById('modal-connect-email');
    const body = document.getElementById('connect-modal-body');
    const provider = defaultProvider || 'Gmail';

    body.innerHTML = `
      <form id="form-connect-email">
        <div class="form-group">
          <label class="form-label" for="connect-provider">Email Provider</label>
          <select id="connect-provider" class="select">
            <option value="Gmail" ${provider === 'Gmail' ? 'selected' : ''}>Gmail (Google OAuth)</option>
            <option value="IMAP" ${provider === 'IMAP' ? 'selected' : ''}>Other Provider (IMAP / SMTP)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="connect-email-input">Email Address</label>
          <input id="connect-email-input" type="email" class="input" placeholder="name@company.com" required />
        </div>
        <div id="imap-fields" class="${provider === 'IMAP' ? '' : 'hidden'}">
          <div class="form-group">
            <label class="form-label" for="connect-imap-host">IMAP Server Host</label>
            <input id="connect-imap-host" type="text" class="input" placeholder="imap.mailprovider.com" />
          </div>
          <div class="form-group">
            <label class="form-label" for="connect-imap-pass">App Password</label>
            <input id="connect-imap-pass" type="password" class="input" placeholder="••••••••••••" />
          </div>
        </div>
        <div class="onboarding-actions" style="margin-top:1.25rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-connect">Cancel</button>
          <button type="submit" class="btn btn-primary">Authorize &amp; Connect</button>
        </div>
      </form>
    `;

    const selectEl = document.getElementById('connect-provider');
    const imapFields = document.getElementById('imap-fields');
    selectEl.addEventListener('change', () => {
      imapFields.classList.toggle('hidden', selectEl.value !== 'IMAP');
    });

    document.getElementById('btn-cancel-connect').addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    document.getElementById('form-connect-email').addEventListener('submit', async (e) => {
      e.preventDefault();
      const chosenProvider = selectEl.value;
      const email = document.getElementById('connect-email-input').value.trim();
      if (!email) return;

      const duplicate = EDITH.state.accounts.some((a) => a.email.toLowerCase() === email.toLowerCase());
      if (duplicate) {
        showToast('This email address is already connected.', 'danger');
        return;
      }

      const newAcc = await EDITH.api.connectEmailAccount({
        provider: chosenProvider === 'IMAP' ? 'IMAP/SMTP' : chosenProvider,
        email,
        isDefault: false
      });

      EDITH.state.accounts.push(newAcc);
      EDITH.saveState();
      modal.classList.add('hidden');
      showToast(`Connected ${email}`, 'success');
      if (typeof onAdded === 'function') onAdded();
    });

    modal.classList.remove('hidden');
  }

  /* ========================================================================
     Shared Modal: Detailed Call Summary (Stage 10 & Stage 16)
     ======================================================================== */
  function openCallSummaryModal(callRecord) {
    const modal = document.getElementById('modal-call-summary');
    const titleEl = document.getElementById('summary-modal-title');
    const subEl = document.getElementById('summary-modal-subtitle');
    const bodyEl = document.getElementById('summary-modal-body');

    const emails = callRecord.summaryEmails && callRecord.summaryEmails.length
      ? callRecord.summaryEmails
      : EDITH.SIMULATOR_EMAILS;

    titleEl.textContent = `Call Summary — ${callRecord.dateTime}`;
    subEl.textContent = `${callRecord.emailsCovered || 7} Emails Summarized • Status: ${callRecord.status}`;

    bodyEl.innerHTML = emails
      .map((item, idx) => `
        <article class="summary-email-item">
          <div class="summary-email-header">
            <div style="display:flex;align-items:center;gap:0.65rem;">
              <span class="summary-num">${idx + 1}</span>
              <div>
                <div style="font-weight:700;font-size:0.95rem;">${escapeHtml(item.title)}</div>
                <div class="summary-sender">${escapeHtml(item.sender)}</div>
              </div>
            </div>
            <span class="badge ${item.badgeClass}">${escapeHtml(item.category)}</span>
          </div>
          <p class="summary-body">${escapeHtml(item.shortLine)}</p>
          <div class="summary-details-extra hidden" id="extra-${idx}">
            ${escapeHtml(item.fullSummary)}
          </div>
          <div style="margin-top:0.5rem;">
            <button type="button" class="btn btn-ghost btn-sm toggle-extra-btn" data-target="extra-${idx}">
              Show full details
            </button>
          </div>
        </article>
      `)
      .join('');

    bodyEl.querySelectorAll('.toggle-extra-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const isHidden = target.classList.toggle('hidden');
        btn.textContent = isHidden ? 'Show full details' : 'Hide details';
      });
    });

    modal.classList.remove('hidden');
  }

  function syncAuthPayload(data) {
    if (!data || !data.user) return;
    EDITH.state.user = {
      id: data.user.id,
      name: data.user.name || 'User',
      email: data.user.email,
      picture: data.user.picture || null,
      authMethod: data.user.authMethod || 'Email'
    };
    EDITH.state.defaultEmail = data.defaultEmail || null;
    EDITH.state.telegram = {
      chatId: data.telegramChatId || (EDITH.state.telegram && EDITH.state.telegram.chatId) || '',
      ttsVoice: data.telegramTtsVoice || (EDITH.state.telegram && EDITH.state.telegram.ttsVoice) || 'en-IN-NeerjaNeural'
    };
    EDITH.state.phone = {
      ...EDITH.state.phone,
      number: data.phoneNumber || EDITH.state.phone.number || '',
      verified: Boolean(data.phoneVerified),
      consentAccepted: Boolean(data.callConsent)
    };
    if (Array.isArray(data.emailAccounts) && data.emailAccounts.length > 0) {
      EDITH.state.accounts = data.emailAccounts.map((acc) => ({
        ...acc,
        isDefault: Boolean(acc.isDefault ?? acc.is_default)
      }));
    } else if (data.defaultEmail) {
      EDITH.state.accounts = [{
        ...data.defaultEmail,
        isDefault: true
      }];
    }
    EDITH.state.onboardingComplete = Boolean(data.onboardingComplete);
    EDITH.saveState();
  }

  async function refreshAuthSession() {
    try {
      const me = await EDITH.backend.getMe();
      syncAuthPayload(me);
      return me;
    } catch (err) {
      return null;
    }
  }

  /* ========================================================================
     Global Initialization & Event Listeners
     ======================================================================== */
  document.addEventListener('DOMContentLoaded', async () => {
    // Landing Page Buttons
    document.getElementById('btn-landing-signin').addEventListener('click', () => {
      EDITH.state.onboardingStage = 2;
      navigateToView('onboarding');
    });

    document.getElementById('btn-get-started').addEventListener('click', () => {
      EDITH.state.onboardingStage = 2;
      navigateToView('onboarding');
    });

    document.getElementById('btn-landing-demo-call').addEventListener('click', () => {
      if (typeof EDITH.openSimulator === 'function') {
        EDITH.openSimulator();
      }
    });

    // Onboarding Back to Home
    const backHome = (e) => {
      e.preventDefault();
      navigateToView('landing');
    };
    document.getElementById('btn-onboarding-back-home').addEventListener('click', backHome);
    document.getElementById('onboarding-home-link').addEventListener('click', backHome);

    // Sidebar Navigation
    document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        EDITH.state.dashboardTab = btn.dataset.tab;
        EDITH.saveState();
        document.getElementById('app-sidebar').classList.remove('open');
        document.getElementById('sidebar-backdrop').classList.remove('open');
        if (typeof EDITH.renderDashboard === 'function') {
          EDITH.renderDashboard();
        }
      });
    });

    // Mobile Menu Drawer
    document.getElementById('btn-mobile-menu').addEventListener('click', () => {
      document.getElementById('app-sidebar').classList.add('open');
      document.getElementById('sidebar-backdrop').classList.add('open');
    });

    document.getElementById('sidebar-backdrop').addEventListener('click', () => {
      document.getElementById('app-sidebar').classList.remove('open');
      document.getElementById('sidebar-backdrop').classList.remove('open');
    });

    // Test Bot Call (Telegram Voice Note) & Preview Call UI Buttons
    const testBotBtn = document.getElementById('btn-launch-simulator');
    testBotBtn.addEventListener('click', () => {
      if (typeof EDITH.triggerTelegramBotCallUI === 'function') {
        EDITH.triggerTelegramBotCallUI(testBotBtn);
      }
    });
    const mobileTestBtn = document.getElementById('btn-mobile-test-call');
    mobileTestBtn.addEventListener('click', () => {
      if (typeof EDITH.triggerTelegramBotCallUI === 'function') {
        EDITH.triggerTelegramBotCallUI(mobileTestBtn);
      }
    });

    const previewUiBtn = document.getElementById('btn-sidebar-real-call');
    if (previewUiBtn) {
      previewUiBtn.addEventListener('click', () => {
        if (typeof EDITH.openSimulator === 'function') EDITH.openSimulator();
      });
    }

    // Sign Out (clears HttpOnly session cookie via POST /auth/logout)
    document.getElementById('btn-signout').addEventListener('click', async () => {
      try {
        await EDITH.backend.logout();
      } catch (err) {
        // Proceed with local sign-out even if offline
      }
      EDITH.resetState();
      navigateToView('landing');
      showToast('Signed out of EDITH Mail Bot.', 'info');
    });

    // Modal Close Handlers
    document.getElementById('btn-close-connect-modal').addEventListener('click', () => {
      document.getElementById('modal-connect-email').classList.add('hidden');
    });
    document.getElementById('btn-close-summary-modal').addEventListener('click', () => {
      document.getElementById('modal-call-summary').classList.add('hidden');
    });

    // Handle OAuth query params & bootstrap session from GET /auth/me
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get('step');
    const authError = params.get('auth_error');

    if (stepParam || authError) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (authError) {
      showToast(authError, 'danger', 5500);
    }

    try {
      const me = await EDITH.backend.getMe();
      syncAuthPayload(me);

      if (me.onboardingComplete || stepParam === 'dashboard') {
        EDITH.state.onboardingComplete = true;
        navigateToView('dashboard');
      } else if (!me.phoneVerified || stepParam === 'default-email') {
        EDITH.state.onboardingStage = 3;
        navigateToView('onboarding');
      } else {
        EDITH.state.onboardingStage = 5;
        navigateToView('onboarding');
      }
    } catch (err) {
      // Unauthenticated (401) or backend offline
      if (authError) {
        EDITH.state.onboardingStage = 2;
        navigateToView('onboarding');
      } else {
        navigateToView('landing');
      }
    }
  });

  EDITH.escapeHtml = escapeHtml;
  EDITH.showToast = showToast;
  EDITH.renderProviderIcon = renderProviderIcon;
  EDITH.navigateToView = navigateToView;
  EDITH.openConnectEmailModal = openConnectEmailModal;
  EDITH.openCallSummaryModal = openCallSummaryModal;
  EDITH.syncAuthPayload = syncAuthPayload;
  EDITH.refreshAuthSession = refreshAuthSession;
})(window);
