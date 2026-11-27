/* ==========================================================================
   EDITH Mail Bot - Onboarding Flow (Stages 2–7)
   ========================================================================== */

(function (global) {
  'use strict';

  const EDITH = global.EDITH;
  let generatedOtp = null;

  function updateProgress(stage) {
    const progressEl = document.getElementById('onboarding-progress');
    if (stage <= 2) {
      progressEl.classList.add('hidden');
      return;
    }
    progressEl.classList.remove('hidden');
    const stepNum = stage - 2; // Stages 3..7 -> Step 1..5
    const totalSteps = 5;
    const pct = Math.round((stepNum / totalSteps) * 100);
    document.getElementById('onboarding-step-label').textContent = `Step ${stepNum} of ${totalSteps}`;
    document.getElementById('onboarding-step-pct').textContent = `${pct}%`;
    document.getElementById('onboarding-progress-fill').style.width = `${pct}%`;
  }

  function goToStage(stage) {
    EDITH.state.onboardingStage = stage;
    EDITH.saveState();
    renderOnboarding();
  }

  function renderOnboarding() {
    const stage = EDITH.state.onboardingStage || 2;
    const card = document.getElementById('onboarding-card');
    updateProgress(stage);

    switch (stage) {
      case 2:
        renderStage2(card);
        break;
      case 3:
        renderStage3(card);
        break;
      case 4:
        renderStage4(card);
        break;
      case 5:
        renderStage5(card);
        break;
      case 6:
        renderStage6(card);
        break;
      case 7:
        renderStage7(card);
        break;
      default:
        renderStage2(card);
    }
  }

  /* ------------------------------------------------------------------------
     Stage 2: Sign In / Sign Up
     ------------------------------------------------------------------------ */
  function renderStage2(card) {
    let authMode = 'signup'; // 'signup' | 'login'

    card.innerHTML = `
      <div class="onboarding-card-header">
        <div style="display:flex;justify-content:center;margin-bottom:0.75rem;">
          <svg width="48" height="48" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <rect width="40" height="40" rx="10" fill="#2563EB" />
            <rect x="9" y="13" width="22" height="17" rx="6" fill="#FFFFFF" />
            <line x1="20" y1="7" x2="20" y2="13" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" />
            <circle cx="20" cy="6.5" r="2.5" fill="#93C5FD" />
            <circle cx="15" cy="21" r="2.2" fill="#2563EB" />
            <circle cx="25" cy="21" r="2.2" fill="#2563EB" />
            <path d="M16 25.5C17.2 26.8 22.8 26.8 24 25.5" stroke="#2563EB" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
        <h1>Sign in to continue</h1>
        <p>Set up your AI voice briefings in just a few steps.</p>
      </div>

      <button type="button" class="oauth-btn" id="btn-oauth-google">
        <span style="font-weight:800;color:#EA4335;">G</span>
        <span>Continue with Google</span>
      </button>

      <div class="divider">or</div>

      <button type="button" class="btn btn-secondary btn-block" id="btn-toggle-email-auth">
        Sign up with Email
      </button>

      <form id="form-email-auth" class="hidden" style="margin-top:1rem;">
        <div style="display:flex;gap:0.5rem;margin-bottom:0.9rem;">
          <button type="button" class="btn btn-sm btn-primary" id="btn-mode-signup" style="flex:1;">Sign Up</button>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-mode-login" style="flex:1;">Sign In</button>
        </div>
        <div class="form-group">
          <label class="form-label" for="auth-email">Email Address</label>
          <input id="auth-email" type="email" class="input" placeholder="you@example.com" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="auth-password">Password</label>
          <input id="auth-password" type="password" class="input" placeholder="Minimum 6 characters" minlength="6" required />
        </div>
        <p id="auth-inline-error" class="form-error hidden" style="margin-bottom:0.75rem;"></p>
        <button type="submit" class="btn btn-primary btn-block" id="btn-email-submit">Create Account &amp; Continue →</button>
      </form>

      <p class="auth-footer">
        By continuing, you agree to EDITH Mail Bot's
        <a href="#terms" onclick="return false;">Terms of Service</a> and
        <a href="#privacy" onclick="return false;">Privacy Policy</a>.
      </p>
    `;

    document.getElementById('btn-oauth-google').addEventListener('click', () => {
      window.location.href = EDITH.backend.getGoogleAuthUrl();
    });

    const emailForm = document.getElementById('form-email-auth');
    const modeSignupBtn = document.getElementById('btn-mode-signup');
    const modeLoginBtn = document.getElementById('btn-mode-login');
    const submitBtn = document.getElementById('btn-email-submit');
    const errEl = document.getElementById('auth-inline-error');

    function setAuthMode(mode) {
      authMode = mode;
      errEl.classList.add('hidden');
      modeSignupBtn.className = `btn btn-sm ${mode === 'signup' ? 'btn-primary' : 'btn-secondary'}`;
      modeLoginBtn.className = `btn btn-sm ${mode === 'login' ? 'btn-primary' : 'btn-secondary'}`;
      submitBtn.textContent = mode === 'signup' ? 'Create Account & Continue →' : 'Sign In & Continue →';
    }

    modeSignupBtn.addEventListener('click', () => setAuthMode('signup'));
    modeLoginBtn.addEventListener('click', () => setAuthMode('login'));

    document.getElementById('btn-toggle-email-auth').addEventListener('click', () => {
      emailForm.classList.toggle('hidden');
    });

    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.classList.add('hidden');
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      if (!email || !password) return;

      submitBtn.disabled = true;
      try {
        const res =
          authMode === 'signup'
            ? await EDITH.backend.signup(email, password)
            : await EDITH.backend.login(email, password);

        EDITH.syncAuthPayload(res);
        if (res.onboardingComplete) {
          EDITH.navigateToView('dashboard');
        } else if (!res.phoneVerified) {
          goToStage(3);
        } else {
          goToStage(5);
        }
      } catch (err) {
        errEl.textContent = err.message || 'Authentication failed.';
        errEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------------------
     Stage 3: Default Email from Sign-In
     ------------------------------------------------------------------------ */
  function renderStage3(card) {
    const { user, defaultEmail, accounts } = EDITH.state;
    const primaryAcc =
      defaultEmail ||
      (Array.isArray(accounts) && accounts.find((a) => a.isDefault || a.is_default)) ||
      (Array.isArray(accounts) && accounts[0]) || {
        email: user.email,
        provider: user.authMethod || 'gmail'
      };

    const rawProvider = String(primaryAcc.provider || user.authMethod || 'google').toLowerCase();
    const providerLabel =
      rawProvider === 'gmail' || rawProvider === 'google'
        ? 'Google'
        : 'Email';

    card.innerHTML = `
      <div class="onboarding-card-header">
        <h2>Welcome to EDITH Mail Bot!</h2>
        <p>We have detected your ${EDITH.escapeHtml(providerLabel)} account.</p>
      </div>

      <div class="account-item highlighted">
        <div class="account-info">
          <div class="provider-icon">${EDITH.renderProviderIcon(primaryAcc.provider || providerLabel)}</div>
          <div>
            <div class="account-email">${EDITH.escapeHtml(primaryAcc.email || user.email)}</div>
            <div class="account-meta">Primary Inbox • Ready for summaries</div>
          </div>
        </div>
        <span class="badge badge-success">Default</span>
      </div>

      <div class="onboarding-actions" style="flex-direction:column;align-items:stretch;">
        <button type="button" class="btn btn-primary btn-lg btn-block" id="btn-stage3-continue">
          Continue →
        </button>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-stage3-switch">
          Use a Different Account
        </button>
      </div>
    `;

    const continueBtn = document.getElementById('btn-stage3-continue');
    continueBtn.addEventListener('click', async () => {
      continueBtn.disabled = true;
      try {
        const res = await EDITH.backend.confirmDefaultEmail(primaryAcc.id);
        if (res && res.defaultEmail) {
          EDITH.state.defaultEmail = res.defaultEmail;
        }
        if (res && Array.isArray(res.emailAccounts)) {
          EDITH.state.accounts = res.emailAccounts.map((acc) => ({
            ...acc,
            isDefault: Boolean(acc.isDefault ?? acc.is_default)
          }));
        }
        EDITH.saveState();
        goToStage(4);
      } catch (err) {
        if (err.status === 401) {
          EDITH.showToast('Please sign in first.', 'danger');
          goToStage(2);
        } else {
          EDITH.showToast(err.message || 'Unable to confirm default email.', 'danger');
          continueBtn.disabled = false;
        }
      }
    });

    document.getElementById('btn-stage3-switch').addEventListener('click', () => {
      window.location.href = EDITH.backend.getGoogleAuthUrl({ switch: true });
    });
  }

  /* ------------------------------------------------------------------------
     Stage 4: Telegram Bot Call Setup (No Phone OTP Required)
     ------------------------------------------------------------------------ */
  function renderStage4(card) {
    const tg = EDITH.state.telegram || { chatId: '', ttsVoice: 'en-IN-NeerjaNeural' };
    const voices = [
      'en-IN-NeerjaNeural',
      'en-IN-PrabhatNeural',
      'en-US-AriaNeural',
      'en-GB-SoniaNeural'
    ];

    card.innerHTML = `
      <div class="onboarding-card-header">
        <h2>Telegram Bot Call Setup</h2>
        <p>Receive AI-spoken Gmail briefings as free Telegram Voice Notes.</p>
      </div>

      <div class="info-banner" style="margin-top:0;margin-bottom:1.15rem;">
        <span aria-hidden="true">🤖</span>
        <div>
          Open your EDITH bot in Telegram and tap <strong>/start</strong>, then click <strong>Auto-Detect Chat ID</strong> below.
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="onb-tg-chat-id">Telegram Chat ID</label>
        <div class="input-row">
          <input id="onb-tg-chat-id" type="text" class="input" placeholder="e.g. 123456789 (or leave blank to set later)" value="${EDITH.escapeHtml(tg.chatId || '')}" />
          <button type="button" class="btn btn-secondary" id="btn-onb-detect-tg">Auto-Detect Chat ID</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="onb-tg-voice">TTS Voice</label>
        <select id="onb-tg-voice" class="select">
          ${voices
            .map((v) => `<option value="${v}" ${tg.ttsVoice === v ? 'selected' : ''}>${v}</option>`)
            .join('')}
        </select>
      </div>

      <div class="onboarding-actions">
        <button type="button" class="btn btn-ghost" id="btn-stage4-back">← Back</button>
        <button type="button" class="btn btn-primary" id="btn-stage4-continue">Continue →</button>
      </div>
    `;

    const chatInput = document.getElementById('onb-tg-chat-id');
    const voiceSelect = document.getElementById('onb-tg-voice');
    const detectBtn = document.getElementById('btn-onb-detect-tg');

    detectBtn.addEventListener('click', async () => {
      detectBtn.disabled = true;
      detectBtn.textContent = 'Detecting...';
      try {
        const res = await EDITH.backend.detectTelegramChat();
        chatInput.value = res.chatId;
        EDITH.state.telegram = { chatId: res.chatId, ttsVoice: voiceSelect.value };
        EDITH.saveState();
        EDITH.showToast(`Detected Telegram Chat ID: ${res.chatId}`, 'success');
      } catch (err) {
        EDITH.showToast(err.message || 'Could not detect Chat ID.', 'danger', 5000);
      } finally {
        detectBtn.disabled = false;
        detectBtn.textContent = 'Auto-Detect Chat ID';
      }
    });

    document.getElementById('btn-stage4-back').addEventListener('click', () => goToStage(3));
    document.getElementById('btn-stage4-continue').addEventListener('click', async () => {
      const chatId = chatInput.value.trim();
      const ttsVoice = voiceSelect.value;
      EDITH.state.telegram = { chatId, ttsVoice };
      EDITH.saveState();
      try {
        await EDITH.backend.saveTelegramSettings(chatId, ttsVoice);
      } catch (err) {
        // Proceed even if offline
      }
      goToStage(5);
    });
  }

  /* ------------------------------------------------------------------------
     Stage 5: Connect Email (Authorize Access)
     ------------------------------------------------------------------------ */
  function renderStage5(card, skipRefresh = false) {
    if (!skipRefresh && typeof EDITH.refreshAuthSession === 'function') {
      EDITH.refreshAuthSession().then((me) => {
        if (me && EDITH.state.onboardingStage === 5 && EDITH.state.currentView === 'onboarding') {
          renderStage5(card, true);
        }
      });
    }
    const accounts = EDITH.state.accounts;

    card.innerHTML = `
      <div class="onboarding-card-header">
        <h2>Connect Your Email Accounts</h2>
        <p>Authorize read-only summary access for the inboxes you want EDITH to cover.</p>
      </div>

      <div id="stage5-accounts-list">
        ${accounts
          .map(
            (acc) => `
          <div class="account-item">
            <div class="account-info">
              <div class="provider-icon">${EDITH.renderProviderIcon(acc.provider)}</div>
              <div>
                <div class="account-email">${EDITH.escapeHtml(acc.email)}</div>
                <div class="account-meta">
                  <span class="status-dot status-dot-success"></span>
                  <span>Connected</span>
                  ${acc.isDefault ? '<span class="badge badge-success">Default</span>' : ''}
                </div>
              </div>
            </div>
            <div class="account-actions">
              <button type="button" class="btn btn-danger-ghost btn-sm btn-remove-acc" data-id="${acc.id}" ${accounts.length <= 1 ? 'disabled title="At least one account is required"' : ''}>
                Remove
              </button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>

      <div style="margin-top:1.5rem;">
        <div class="form-label" style="margin-bottom:0.65rem;">Connect Another Email (Optional)</div>

        <button type="button" class="provider-option" id="btn-add-imap">
          <div class="account-info">
            <div class="provider-icon">${EDITH.renderProviderIcon('IMAP')}</div>
            <div>
              <div style="font-weight:700;font-size:0.9375rem;">Other Email Provider</div>
              <div class="form-hint">Connect via IMAP / SMTP</div>
            </div>
          </div>
          <span class="btn btn-secondary btn-sm">Connect</span>
        </button>
      </div>

      <div class="onboarding-actions">
        <button type="button" class="btn btn-ghost" id="btn-stage5-back">← Back</button>
        <button type="button" class="btn btn-primary" id="btn-stage5-continue">Continue →</button>
      </div>
    `;

    card.querySelectorAll('.btn-remove-acc').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (EDITH.state.accounts.length <= 1) return;
        EDITH.state.accounts = EDITH.state.accounts.filter((a) => a.id !== btn.dataset.id);
        if (!EDITH.state.accounts.some((a) => a.isDefault)) {
          EDITH.state.accounts[0].isDefault = true;
        }
        EDITH.saveState();
        renderStage5(card);
      });
    });

    document.getElementById('btn-add-imap').addEventListener('click', () => {
      EDITH.openConnectEmailModal('IMAP', () => renderStage5(card));
    });

    document.getElementById('btn-stage5-back').addEventListener('click', () => goToStage(4));
    document.getElementById('btn-stage5-continue').addEventListener('click', () => goToStage(6));
  }

  /* ------------------------------------------------------------------------
     Stage 6: Call Schedule Setup (shared helper for Dashboard too)
     ------------------------------------------------------------------------ */
  function renderScheduleEditorHtml(schedule) {
    return `
      <label class="radio-card ${schedule.mode === 'once' ? 'selected' : ''}" data-mode="once">
        <input type="radio" name="sched-mode" value="once" ${schedule.mode === 'once' ? 'checked' : ''} />
        <div>
          <div class="radio-card-title">Once a Day</div>
          <div class="radio-card-desc">Receive one call daily at your preferred time.</div>
        </div>
      </label>

      <label class="radio-card ${schedule.mode === 'interval' ? 'selected' : ''}" data-mode="interval">
        <input type="radio" name="sched-mode" value="interval" ${schedule.mode === 'interval' ? 'checked' : ''} />
        <div style="width:100%;">
          <div class="radio-card-title">Every Few Hours</div>
          <div class="radio-card-desc">Receive calls at regular intervals throughout the day.</div>
          <div id="sched-interval-panel" class="sub-panel ${schedule.mode === 'interval' ? '' : 'hidden'}">
            <label class="form-label" for="sched-interval-select">Call Frequency</label>
            <select id="sched-interval-select" class="select" style="margin-top:0.35rem;">
              <option value="2" ${schedule.intervalHours === 2 ? 'selected' : ''}>Every 2 hours</option>
              <option value="4" ${schedule.intervalHours === 4 ? 'selected' : ''}>Every 4 hours</option>
              <option value="6" ${schedule.intervalHours === 6 ? 'selected' : ''}>Every 6 hours</option>
            </select>
          </div>
        </div>
      </label>

      <label class="radio-card ${schedule.mode === 'custom' ? 'selected' : ''}" data-mode="custom">
        <input type="radio" name="sched-mode" value="custom" ${schedule.mode === 'custom' ? 'checked' : ''} />
        <div style="width:100%;">
          <div class="radio-card-title">Custom Schedule</div>
          <div class="radio-card-desc">Choose specific times for calls.</div>
          <div id="sched-custom-panel" class="sub-panel ${schedule.mode === 'custom' ? '' : 'hidden'}">
            <div class="input-row">
              <input type="time" id="sched-new-slot" class="input" value="14:00" />
              <button type="button" class="btn btn-secondary btn-sm" id="btn-add-slot">+ Add Slot</button>
            </div>
            <div id="sched-slot-list" class="slot-chip-list">
              ${schedule.customTimes
                .map(
                  (t, idx) => `
                <span class="slot-chip">
                  <span>${EDITH.formatTime12h(t)}</span>
                  <button type="button" class="btn-remove-slot" data-idx="${idx}" aria-label="Remove slot">×</button>
                </span>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </label>

      <div class="form-group" style="margin-top:1.25rem;">
        <label class="form-label" for="sched-preferred-time">Preferred Call Time</label>
        <input type="time" id="sched-preferred-time" class="input" value="${EDITH.escapeHtml(schedule.preferredTime)}" />
      </div>
    `;
  }

  function bindScheduleEditorEvents(container, onChange) {
    const radios = container.querySelectorAll('input[name="sched-mode"]');
    radios.forEach((radio) => {
      radio.addEventListener('change', () => {
        EDITH.state.schedule.mode = radio.value;
        EDITH.saveState();
        if (typeof onChange === 'function') onChange();
      });
    });

    const intervalSelect = container.querySelector('#sched-interval-select');
    if (intervalSelect) {
      intervalSelect.addEventListener('change', () => {
        EDITH.state.schedule.intervalHours = parseInt(intervalSelect.value, 10);
        EDITH.saveState();
      });
    }

    const prefTime = container.querySelector('#sched-preferred-time');
    if (prefTime) {
      prefTime.addEventListener('change', () => {
        EDITH.state.schedule.preferredTime = prefTime.value || '09:00';
        EDITH.saveState();
      });
    }

    const addSlotBtn = container.querySelector('#btn-add-slot');
    if (addSlotBtn) {
      addSlotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const slotVal = container.querySelector('#sched-new-slot').value;
        if (!slotVal) return;
        if (!EDITH.state.schedule.customTimes.includes(slotVal)) {
          EDITH.state.schedule.customTimes.push(slotVal);
          EDITH.state.schedule.customTimes.sort();
          EDITH.saveState();
          if (typeof onChange === 'function') onChange();
        }
      });
    }

    container.querySelectorAll('.btn-remove-slot').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = parseInt(btn.dataset.idx, 10);
        if (EDITH.state.schedule.customTimes.length <= 1) {
          EDITH.showToast('Keep at least one custom time slot.', 'info');
          return;
        }
        EDITH.state.schedule.customTimes.splice(idx, 1);
        EDITH.saveState();
        if (typeof onChange === 'function') onChange();
      });
    });
  }

  function renderStage6(card) {
    card.innerHTML = `
      <div class="onboarding-card-header">
        <h2>Set Your Call Schedule</h2>
        <p>Choose how often EDITH should call you with inbox briefings.</p>
      </div>

      <div id="stage6-schedule-body">
        ${renderScheduleEditorHtml(EDITH.state.schedule)}
      </div>

      <div class="onboarding-actions">
        <button type="button" class="btn btn-ghost" id="btn-stage6-back">← Back</button>
        <button type="button" class="btn btn-primary" id="btn-stage6-continue">Continue →</button>
      </div>
    `;

    bindScheduleEditorEvents(card, () => renderStage6(card));
    document.getElementById('btn-stage6-back').addEventListener('click', () => goToStage(5));
    document.getElementById('btn-stage6-continue').addEventListener('click', () => goToStage(7));
  }

  /* ------------------------------------------------------------------------
     Stage 7: Additional Settings (shared helper for Preferences too)
     ------------------------------------------------------------------------ */
  function renderPreferencesEditorHtml(settings) {
    const timezones = [
      '(GMT+5:30) India Standard Time',
      '(GMT+0:00) UTC / London',
      '(GMT-5:00) Eastern Time (US & Canada)',
      '(GMT-8:00) Pacific Time (US & Canada)',
      '(GMT+1:00) Central European Time',
      '(GMT+8:00) Singapore / Hong Kong',
      '(GMT+10:00) Sydney / Melbourne'
    ];

    return `
      <div class="setting-row">
        <div>
          <div class="setting-title">Calling Window</div>
          <div class="setting-desc">Only place calls between these hours.</div>
          <div class="input-row" style="margin-top:0.5rem;">
            <input type="time" id="pref-win-start" class="input" style="width:130px;" value="${settings.windowStart}" ${settings.callingWindowEnabled ? '' : 'disabled'} />
            <span class="form-hint">to</span>
            <input type="time" id="pref-win-end" class="input" style="width:130px;" value="${settings.windowEnd}" ${settings.callingWindowEnabled ? '' : 'disabled'} />
          </div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="pref-win-toggle" ${settings.callingWindowEnabled ? 'checked' : ''} aria-label="Enable calling window" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div>
          <div class="setting-title">Maximum Calls Per Day</div>
          <div class="setting-desc">Cap daily briefings to avoid interruptions.</div>
          <select id="pref-max-calls" class="select" style="width:140px;margin-top:0.5rem;" ${settings.maxCallsEnabled ? '' : 'disabled'}>
            ${Array.from({ length: 10 }, (_, i) => i + 1)
              .map((n) => `<option value="${n}" ${settings.maxCallsPerDay === n ? 'selected' : ''}>${n} ${n === 1 ? 'call' : 'calls'}</option>`)
              .join('')}
          </select>
        </div>
        <label class="toggle">
          <input type="checkbox" id="pref-max-toggle" ${settings.maxCallsEnabled ? 'checked' : ''} aria-label="Enable maximum calls per day" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div>
          <div class="setting-title">Skip Call if No New Emails</div>
          <div class="setting-desc">Don't ring when your inbox has zero unread updates.</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="pref-skip-empty" ${settings.skipIfEmpty ? 'checked' : ''} aria-label="Skip call if no new emails" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <div>
          <div class="setting-title">Include Weekends</div>
          <div class="setting-desc">Receive scheduled briefings on Saturday and Sunday.</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="pref-weekends" ${settings.includeWeekends ? 'checked' : ''} aria-label="Include weekends" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="form-group" style="margin-top:1rem;">
        <label class="form-label" for="pref-summary-length">Summary Length</label>
        <select id="pref-summary-length" class="select">
          <option value="Brief (1-2 minutes)" ${settings.summaryLength === 'Brief (1-2 minutes)' ? 'selected' : ''}>Brief (1-2 minutes)</option>
          <option value="Standard (3-4 minutes)" ${settings.summaryLength === 'Standard (3-4 minutes)' ? 'selected' : ''}>Standard (3-4 minutes)</option>
          <option value="Detailed (5+ minutes)" ${settings.summaryLength === 'Detailed (5+ minutes)' ? 'selected' : ''}>Detailed (5+ minutes)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="pref-timezone">Timezone</label>
        <select id="pref-timezone" class="select">
          ${timezones
            .map((tz) => `<option value="${tz}" ${settings.timezone === tz ? 'selected' : ''}>${tz}</option>`)
            .join('')}
        </select>
      </div>
    `;
  }

  function bindPreferencesEditorEvents(container) {
    const winToggle = container.querySelector('#pref-win-toggle');
    const winStart = container.querySelector('#pref-win-start');
    const winEnd = container.querySelector('#pref-win-end');
    const maxToggle = container.querySelector('#pref-max-toggle');
    const maxCalls = container.querySelector('#pref-max-calls');

    winToggle.addEventListener('change', () => {
      EDITH.state.settings.callingWindowEnabled = winToggle.checked;
      winStart.disabled = !winToggle.checked;
      winEnd.disabled = !winToggle.checked;
      EDITH.saveState();
    });
    winStart.addEventListener('change', () => {
      EDITH.state.settings.windowStart = winStart.value;
      EDITH.saveState();
    });
    winEnd.addEventListener('change', () => {
      EDITH.state.settings.windowEnd = winEnd.value;
      EDITH.saveState();
    });

    maxToggle.addEventListener('change', () => {
      EDITH.state.settings.maxCallsEnabled = maxToggle.checked;
      maxCalls.disabled = !maxToggle.checked;
      EDITH.saveState();
    });
    maxCalls.addEventListener('change', () => {
      EDITH.state.settings.maxCallsPerDay = parseInt(maxCalls.value, 10);
      EDITH.saveState();
    });

    container.querySelector('#pref-skip-empty').addEventListener('change', (e) => {
      EDITH.state.settings.skipIfEmpty = e.target.checked;
      EDITH.saveState();
    });
    container.querySelector('#pref-weekends').addEventListener('change', (e) => {
      EDITH.state.settings.includeWeekends = e.target.checked;
      EDITH.saveState();
    });
    container.querySelector('#pref-summary-length').addEventListener('change', (e) => {
      EDITH.state.settings.summaryLength = e.target.value;
      EDITH.saveState();
    });
    container.querySelector('#pref-timezone').addEventListener('change', (e) => {
      EDITH.state.settings.timezone = e.target.value;
      EDITH.saveState();
    });
  }

  function renderStage7(card) {
    card.innerHTML = `
      <div class="onboarding-card-header">
        <h2>Additional Settings</h2>
        <p>Fine-tune your calling window, summary depth, and timezone.</p>
      </div>

      ${renderPreferencesEditorHtml(EDITH.state.settings)}

      <div class="onboarding-actions">
        <button type="button" class="btn btn-ghost" id="btn-stage7-back">← Back</button>
        <button type="button" class="btn btn-primary btn-lg" id="btn-activate-bot">
          Activate EDITH Mail Bot
        </button>
      </div>
    `;

    bindPreferencesEditorEvents(card);
    document.getElementById('btn-stage7-back').addEventListener('click', () => goToStage(6));
    document.getElementById('btn-activate-bot').addEventListener('click', async () => {
      try {
        await EDITH.backend.saveSchedule({
          isActive: true,
          schedule: EDITH.state.schedule,
          settings: EDITH.state.settings
        });
        await EDITH.backend.completeOnboarding();
      } catch (err) {
        // Allow local completion if running without backend
      }
      EDITH.state.onboardingComplete = true;
      EDITH.state.botActive = true;
      EDITH.state.dashboardTab = 'dashboard';
      EDITH.saveState();
      EDITH.showToast('EDITH Mail Bot is now active!', 'success');
      EDITH.navigateToView('dashboard');
    });
  }

  EDITH.renderOnboarding = renderOnboarding;
  EDITH.renderScheduleEditorHtml = renderScheduleEditorHtml;
  EDITH.bindScheduleEditorEvents = bindScheduleEditorEvents;
  EDITH.renderPreferencesEditorHtml = renderPreferencesEditorHtml;
  EDITH.bindPreferencesEditorEvents = bindPreferencesEditorEvents;
})(window);
