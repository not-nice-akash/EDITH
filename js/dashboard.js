/* ==========================================================================
   EDITH Mail Bot - Authenticated Dashboard & Management Views (Stages 8–10)
   ========================================================================== */

(function (global) {
  'use strict';

  const EDITH = global.EDITH;

  function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  function formatScheduleModeLabel(mode) {
    if (mode === 'once') return 'Once a Day';
    if (mode === 'interval') return `Every ${EDITH.state.schedule.intervalHours} Hours`;
    return `Custom (${EDITH.state.schedule.customTimes.length} slots)`;
  }

  function renderDashboard() {
    const tab = EDITH.state.dashboardTab || 'dashboard';

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-tab]').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });

    const container = document.getElementById('dashboard-content');
    switch (tab) {
      case 'dashboard':
        renderOverviewTab(container);
        break;
      case 'schedule':
        renderScheduleTab(container);
        break;
      case 'accounts':
        renderAccountsTab(container);
        break;
      case 'history':
        renderHistoryTab(container);
        break;
      case 'preferences':
        renderPreferencesTab(container);
        break;
      case 'settings':
        renderSettingsTab(container);
        break;
      default:
        renderOverviewTab(container);
    }
  }

  /* ------------------------------------------------------------------------
     Stage 8: Dashboard Overview
     ------------------------------------------------------------------------ */
  function renderOverviewTab(container, skipLiveSync = false) {
    if (!skipLiveSync && EDITH.backend) {
      Promise.all([
        EDITH.backend.getSchedule().catch(() => null),
        EDITH.backend.getUnreadCount().catch(() => null)
      ]).then(([schedData, unreadData]) => {
        let changed = false;
        if (schedData && schedData.schedule) {
          EDITH.state.botActive = Boolean(schedData.isActive);
          EDITH.state.schedule = { ...EDITH.state.schedule, ...schedData.schedule };
          EDITH.state.settings = { ...EDITH.state.settings, ...schedData.settings };
          changed = true;
        }
        if (unreadData && typeof unreadData.unreadCount === 'number') {
          EDITH.state.newEmailsCount = unreadData.unreadCount;
          changed = true;
        }
        if (changed && EDITH.state.dashboardTab === 'dashboard' && EDITH.state.currentView === 'dashboard') {
          EDITH.saveState();
          renderOverviewTab(container, true);
        }
      });
    }

    const { user, botActive, newEmailsCount, schedule, settings } = EDITH.state;
    const nextCall = EDITH.getNextScheduledCallText();
    const windowText = settings.callingWindowEnabled
      ? `${EDITH.formatTime12h(settings.windowStart)} – ${EDITH.formatTime12h(settings.windowEnd)}`
      : 'Disabled (24/7)';

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>${getTimeGreeting()}, ${EDITH.escapeHtml(user.name)}! 👋</h1>
          <p>Here is your live EDITH Mail Bot status and upcoming voice briefing.</p>
        </div>
        <div class="bot-status-pill">
          <span class="status-dot ${botActive ? 'status-dot-success' : 'status-dot-muted'}"></span>
          <span>${botActive ? 'Active' : 'Paused'}</span>
          <label class="toggle">
            <input type="checkbox" id="toggle-bot-active" ${botActive ? 'checked' : ''} aria-label="Toggle EDITH Mail Bot active status" />
            <span class="toggle-slider toggle-success"></span>
          </label>
        </div>
      </div>

      <div class="stats-grid">
        <div class="card stat-card">
          <div class="stat-icon stat-icon-blue">📬</div>
          <div>
            <div class="stat-label">New Emails</div>
            <div class="stat-value">${newEmailsCount}</div>
            <div class="stat-sub">since last call</div>
          </div>
        </div>

        <div class="card stat-card">
          <div class="stat-icon stat-icon-green">📞</div>
          <div>
            <div class="stat-label">Next Scheduled Call</div>
            <div class="stat-value" style="font-size:1.25rem;">${EDITH.escapeHtml(nextCall)}</div>
            <div class="stat-sub">${EDITH.escapeHtml(settings.timezone)}</div>
          </div>
        </div>
      </div>

      <section class="card">
        <div class="page-header" style="margin-bottom:0.5rem;">
          <div>
            <h2 style="font-size:1.15rem;font-weight:800;">Schedule Details</h2>
            <p class="form-hint">Your active calling cadence and quiet-hour rules.</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-edit-schedule">Edit Schedule</button>
        </div>

        <div class="details-grid">
          <div class="detail-box">
            <div class="detail-box-label">Mode</div>
            <div class="detail-box-value">${EDITH.escapeHtml(formatScheduleModeLabel(schedule.mode))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-box-label">Call Time</div>
            <div class="detail-box-value">${EDITH.escapeHtml(EDITH.formatTime12h(schedule.preferredTime))}</div>
          </div>
          <div class="detail-box">
            <div class="detail-box-label">Calling Window</div>
            <div class="detail-box-value">${EDITH.escapeHtml(windowText)}</div>
          </div>
          <div class="detail-box">
            <div class="detail-box-label">Skip Empty Calls</div>
            <div class="detail-box-value">${settings.skipIfEmpty ? 'Enabled' : 'Disabled'}</div>
          </div>
          <div class="detail-box">
            <div class="detail-box-label">Weekends</div>
            <div class="detail-box-value">${settings.includeWeekends ? 'Included' : 'Weekdays Only'}</div>
          </div>
        </div>
      </section>
      <section class="card" style="margin-top:1.25rem;">
        <div class="page-header" style="margin-bottom:0.75rem;">
          <div>
            <h2 style="font-size:1.15rem;font-weight:800;">Connect Telegram (@edith_briefing_bot)</h2>
            <p class="form-hint">Link your Telegram account to receive instant email summaries and audio briefings.</p>
          </div>
          ${
            EDITH.state.telegram && EDITH.state.telegram.chatId
              ? '<span class="badge badge-success">✓ Connected</span>'
              : '<span class="badge badge-neutral">Not Linked</span>'
          }
        </div>
        <div class="input-row" style="flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm" id="btn-dash-connect-telegram">
            ${EDITH.state.telegram && EDITH.state.telegram.chatId ? 'Relink Telegram Bot' : 'Connect Telegram →'}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-dash-send-telegram">
            Send Briefing to Telegram
          </button>
        </div>
      </section>
    `;

    document.getElementById('btn-dash-connect-telegram').addEventListener('click', async () => {
      try {
        const res = await EDITH.backend.createTelegramLinkToken();
        window.open(res.url, '_blank', 'noopener');
        EDITH.showToast('Opened @edith_briefing_bot in Telegram. Tap Start to link!', 'info', 6000);
        const onFocus = async () => {
          window.removeEventListener('focus', onFocus);
          await EDITH.refreshAuthSession();
          if (EDITH.state.dashboardTab === 'dashboard') renderOverviewTab(container, true);
        };
        window.addEventListener('focus', onFocus);
      } catch (err) {
        EDITH.showToast(err.message || 'Could not generate Telegram link.', 'danger');
      }
    });

    const dashSendTgBtn = document.getElementById('btn-dash-send-telegram');
    dashSendTgBtn.addEventListener('click', async () => {
      dashSendTgBtn.disabled = true;
      dashSendTgBtn.textContent = 'Sending...';
      try {
        const res = await EDITH.backend.sendTelegramTestBriefing();
        EDITH.showToast(`Sent ${res.emailsCovered} email briefing + audio to Telegram!`, 'success');
      } catch (err) {
        EDITH.showToast(err.message || 'Failed to send Telegram briefing.', 'danger', 5000);
      } finally {
        dashSendTgBtn.disabled = false;
        dashSendTgBtn.textContent = 'Send Briefing to Telegram';
      }
    });

    document.getElementById('toggle-bot-active').addEventListener('change', async (e) => {
      EDITH.state.botActive = e.target.checked;
      try {
        await EDITH.backend.saveSchedule({ isActive: EDITH.state.botActive });
      } catch (err) {
        await EDITH.api.toggleBotStatus(EDITH.state.botActive);
      }
      EDITH.saveState();
      EDITH.showToast(
        EDITH.state.botActive ? 'EDITH Mail Bot resumed.' : 'EDITH Mail Bot paused.',
        EDITH.state.botActive ? 'success' : 'info'
      );
      renderOverviewTab(container, true);
    });

    document.getElementById('btn-edit-schedule').addEventListener('click', () => {
      EDITH.state.dashboardTab = 'schedule';
      EDITH.saveState();
      renderDashboard();
    });
  }

  /* ------------------------------------------------------------------------
     Call Schedule Tab (Reuses Stage 6 Editor)
     ------------------------------------------------------------------------ */
  function renderScheduleTab(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Call Schedule</h1>
          <p>Update how often and when EDITH calls you.</p>
        </div>
      </div>

      <div class="card" id="dash-schedule-card">
        ${EDITH.renderScheduleEditorHtml(EDITH.state.schedule)}
        <div style="margin-top:1.25rem;display:flex;justify-content:flex-end;">
          <button type="button" class="btn btn-primary" id="btn-save-schedule">Save Schedule</button>
        </div>
      </div>
    `;

    const card = document.getElementById('dash-schedule-card');
    EDITH.bindScheduleEditorEvents(card, () => renderScheduleTab(container));
    document.getElementById('btn-save-schedule').addEventListener('click', async () => {
      try {
        await EDITH.backend.saveSchedule({
          schedule: EDITH.state.schedule,
          settings: EDITH.state.settings
        });
      } catch (err) {
        await EDITH.api.saveScheduleAndPreferences({ schedule: EDITH.state.schedule });
      }
      EDITH.saveState();
      EDITH.showToast('Call schedule saved!', 'success');
    });
  }

  /* ------------------------------------------------------------------------
     Stage 9: Email Accounts Manager
     ------------------------------------------------------------------------ */
  function renderAccountsTab(container, skipRefresh = false) {
    if (!skipRefresh && typeof EDITH.refreshAuthSession === 'function') {
      EDITH.refreshAuthSession().then((me) => {
        if (me && EDITH.state.dashboardTab === 'accounts' && EDITH.state.currentView === 'dashboard') {
          renderAccountsTab(container, true);
        }
      });
    }
    const { accounts } = EDITH.state;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Email Accounts</h1>
          <p>Manage the inboxes EDITH summarizes during your scheduled calls.</p>
        </div>
        <button type="button" class="btn btn-primary" id="btn-connect-another-email">+ Connect Another Email</button>
      </div>

      <div class="card">
        ${accounts
          .map(
            (acc) => `
          <div class="account-item ${acc.isDefault ? 'highlighted' : ''}">
            <div class="account-info">
              <div class="provider-icon">${EDITH.renderProviderIcon(acc.provider)}</div>
              <div>
                <div class="account-email">${EDITH.escapeHtml(acc.email)}</div>
                <div class="account-meta">
                  <span>${EDITH.escapeHtml(acc.provider)}</span>
                  <span>•</span>
                  <span class="status-dot status-dot-success"></span>
                  <span>Connected</span>
                  ${acc.isDefault ? '<span class="badge badge-success">Default</span>' : ''}
                </div>
              </div>
            </div>
            <div class="account-actions">
              ${
                !acc.isDefault
                  ? `<button type="button" class="btn btn-secondary btn-sm btn-set-default" data-id="${acc.id}">Set Default</button>`
                  : ''
              }
              <button type="button" class="btn btn-danger-ghost btn-sm btn-remove-account" data-id="${acc.id}" ${accounts.length <= 1 ? 'disabled title="At least one account is required"' : ''}>
                Remove
              </button>
            </div>
          </div>
        `
          )
          .join('')}

        <div class="info-banner">
          <span aria-hidden="true">ℹ️</span>
          <div>
            <strong>Multi-account summarization:</strong> EDITH combines unread messages across all connected accounts into one prioritized voice briefing, grouped by sender and urgency.
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-connect-another-email').addEventListener('click', () => {
      EDITH.openConnectEmailModal('Gmail', () => renderAccountsTab(container));
    });

    container.querySelectorAll('.btn-set-default').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        EDITH.state.accounts.forEach((a) => {
          a.isDefault = a.id === id;
        });
        EDITH.saveState();
        EDITH.showToast('Default email account updated.', 'success');
        renderAccountsTab(container);
      });
    });

    container.querySelectorAll('.btn-remove-account').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (EDITH.state.accounts.length <= 1) return;
        EDITH.state.accounts = EDITH.state.accounts.filter((a) => a.id !== btn.dataset.id);
        if (!EDITH.state.accounts.some((a) => a.isDefault)) {
          EDITH.state.accounts[0].isDefault = true;
        }
        EDITH.saveState();
        EDITH.showToast('Email account removed.', 'info');
        renderAccountsTab(container);
      });
    });
  }

  /* ------------------------------------------------------------------------
     Stage 10: Call History Table
     ------------------------------------------------------------------------ */
  function getStatusBadgeClass(status) {
    if (status === 'Delivered' || status === 'Completed') return 'badge-success';
    if (status.startsWith('Skipped')) return 'badge-neutral';
    if (status === 'Queued' || status === 'In Progress') return 'badge-info';
    return 'badge-danger';
  }

  async function triggerTelegramBotCallUI(btnEl) {
    const originalHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = 'Sending Voice Note...';
    }
    EDITH.showToast('Generating Gemini summary & Telegram voice note...', 'info');
    try {
      const tg = EDITH.state.telegram || {};
      const res = await EDITH.backend.testBotCall(tg.chatId, tg.ttsVoice);
      if (res.skipped) {
        EDITH.showToast(res.message || 'No new emails; briefing skipped.', 'info');
      } else {
        EDITH.showToast(`Telegram voice note delivered! (${res.voiceUsed})`, 'success');
      }
      if (EDITH.state.dashboardTab === 'history' || EDITH.state.dashboardTab === 'dashboard') {
        renderDashboard();
      }
    } catch (err) {
      EDITH.showToast(err.message || 'Could not send Telegram voice note.', 'danger', 5500);
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = originalHtml;
      }
    }
  }

  function renderHistoryTab(container, skipFetch = false) {
    if (!skipFetch && EDITH.backend) {
      EDITH.backend.getCalls().then((data) => {
        if (data && Array.isArray(data.calls)) {
          EDITH.state.callHistory = data.calls;
          EDITH.saveState();
          if (EDITH.state.dashboardTab === 'history' && EDITH.state.currentView === 'dashboard') {
            renderHistoryTab(container, true);
          }
        }
      }).catch(() => {});
    }

    const history = EDITH.state.callHistory;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Call History</h1>
          <p>Review delivered Telegram voice briefings and inspect detailed email summaries.</p>
        </div>
        <button type="button" class="btn btn-primary" id="btn-history-test-call">🎙️ Test Bot Call</button>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Telegram Chat ID</th>
                <th>Voice Used</th>
                <th>Summary Preview</th>
                <th>Status</th>
                <th style="text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${history
                .map(
                  (row) => `
                <tr>
                  <td style="font-weight:600;white-space:nowrap;">${EDITH.escapeHtml(row.dateTime)}</td>
                  <td style="font-family:var(--font-mono);font-size:0.82rem;">${EDITH.escapeHtml(row.telegramChatId || '—')}</td>
                  <td style="font-size:0.82rem;">${EDITH.escapeHtml(row.voiceUsed || 'en-IN-NeerjaNeural')}</td>
                  <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${EDITH.escapeHtml(row.summaryPreview || '')}">
                    ${EDITH.escapeHtml(row.summaryPreview || (row.emailsCovered > 0 ? `${row.emailsCovered} emails summarized` : '—'))}
                  </td>
                  <td><span class="badge ${getStatusBadgeClass(row.status)}">${EDITH.escapeHtml(row.status)}</span></td>
                  <td style="text-align:right;">
                    ${
                      row.status === 'Delivered' || row.status === 'Completed'
                        ? `<button type="button" class="btn btn-secondary btn-sm btn-view-call" data-id="${row.id}">View</button>`
                        : `<span class="form-hint">No summary</span>`
                    }
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const histTestBtn = document.getElementById('btn-history-test-call');
    histTestBtn.addEventListener('click', () => triggerTelegramBotCallUI(histTestBtn));

    container.querySelectorAll('.btn-view-call').forEach((btn) => {
      btn.addEventListener('click', () => {
        const record = EDITH.state.callHistory.find((c) => c.id === btn.dataset.id);
        if (record) EDITH.openCallSummaryModal(record);
      });
    });
  }

  /* ------------------------------------------------------------------------
     Preferences Tab (Reuses Stage 7 Editor)
     ------------------------------------------------------------------------ */
  function renderPreferencesTab(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Preferences</h1>
          <p>Customize calling windows, summary length, and daily limits.</p>
        </div>
      </div>

      <div class="card" id="dash-preferences-card">
        ${EDITH.renderPreferencesEditorHtml(EDITH.state.settings)}
        <div style="margin-top:1.25rem;display:flex;justify-content:flex-end;">
          <button type="button" class="btn btn-primary" id="btn-save-preferences">Save Preferences</button>
        </div>
      </div>
    `;

    const card = document.getElementById('dash-preferences-card');
    EDITH.bindPreferencesEditorEvents(card);
    document.getElementById('btn-save-preferences').addEventListener('click', async () => {
      try {
        await EDITH.backend.saveSchedule({
          schedule: EDITH.state.schedule,
          settings: EDITH.state.settings
        });
      } catch (err) {
        await EDITH.api.saveScheduleAndPreferences({ settings: EDITH.state.settings });
      }
      EDITH.saveState();
      EDITH.showToast('Preferences saved!', 'success');
    });
  }

  /* ------------------------------------------------------------------------
     Settings Tab (Telegram Bot Call Setup, Profile & Reset Demo)
     ------------------------------------------------------------------------ */
  function renderSettingsTab(container) {
    const { user } = EDITH.state;
    const tg = EDITH.state.telegram || { chatId: '', ttsVoice: 'en-IN-NeerjaNeural' };
    const voices = [
      'en-IN-NeerjaNeural',
      'en-IN-PrabhatNeural',
      'en-US-AriaNeural',
      'en-GB-SoniaNeural'
    ];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Settings</h1>
          <p>Configure your Telegram Bot Call delivery, TTS voice, and profile.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:1.25rem;">
        <h2 style="font-size:1.1rem;font-weight:800;margin-bottom:0.35rem;">Telegram Bot Call Setup</h2>
        <p class="form-hint" style="margin-bottom:1rem;">
          Send <code>/start</code> to your EDITH Telegram bot, then click <strong>Auto-Detect Chat ID</strong>.
        </p>
        <form id="form-telegram-settings">
          <div class="form-group">
            <label class="form-label" for="set-tg-chat-id">Telegram Chat ID</label>
            <div class="input-row">
              <input id="set-tg-chat-id" type="text" class="input" placeholder="e.g. 123456789" value="${EDITH.escapeHtml(tg.chatId || '')}" />
              <button type="button" class="btn btn-secondary" id="btn-detect-tg-chat">Auto-Detect Chat ID</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="set-tg-voice">TTS Voice</label>
            <select id="set-tg-voice" class="select">
              ${voices
                .map((v) => `<option value="${v}" ${tg.ttsVoice === v ? 'selected' : ''}>${v}</option>`)
                .join('')}
            </select>
          </div>
          <div class="input-row" style="flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary">Save Telegram Settings</button>
            <button type="button" class="btn btn-secondary" id="btn-settings-link-tg">Connect via @edith_briefing_bot</button>
            <button type="button" class="btn btn-secondary" id="btn-verify-tg-conn">Send Briefing to Telegram</button>
          </div>
        </form>
      </div>

      <div class="card" style="margin-bottom:1.25rem;">
        <h2 style="font-size:1.1rem;font-weight:800;margin-bottom:1rem;">Profile</h2>
        <form id="form-profile-settings">
          <div class="form-group">
            <label class="form-label" for="set-user-name">Display Name</label>
            <input id="set-user-name" type="text" class="input" value="${EDITH.escapeHtml(user.name)}" required />
          </div>
          <button type="submit" class="btn btn-primary">Save Profile</button>
        </form>
      </div>

      <div class="card" style="border-color:#FECACA;">
        <h2 style="font-size:1.1rem;font-weight:800;color:var(--danger);margin-bottom:0.35rem;">Demo Controls</h2>
        <p class="form-hint" style="margin-bottom:1rem;">
          Reset all localStorage data and return to the Landing Page so you can re-test the onboarding and Telegram call flow.
        </p>
        <button type="button" class="btn btn-danger-ghost" style="border:1px solid #FCA5A5;" id="btn-reset-demo">
          Reset Demo
        </button>
      </div>
    `;

    const chatInput = document.getElementById('set-tg-chat-id');
    const voiceSelect = document.getElementById('set-tg-voice');
    const detectBtn = document.getElementById('btn-detect-tg-chat');

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
        EDITH.showToast(err.message || 'Could not detect Chat ID.', 'danger', 5500);
      } finally {
        detectBtn.disabled = false;
        detectBtn.textContent = 'Auto-Detect Chat ID';
      }
    });

    document.getElementById('form-telegram-settings').addEventListener('submit', async (e) => {
      e.preventDefault();
      const chatId = chatInput.value.trim();
      const ttsVoice = voiceSelect.value;
      EDITH.state.telegram = { chatId, ttsVoice };
      EDITH.saveState();
      try {
        await EDITH.backend.saveTelegramSettings(chatId, ttsVoice);
        EDITH.showToast('Telegram Bot Call settings saved!', 'success');
      } catch (err) {
        EDITH.showToast(err.message || 'Failed to save Telegram settings.', 'danger');
      }
    });

    document.getElementById('btn-settings-link-tg').addEventListener('click', async () => {
      try {
        const res = await EDITH.backend.createTelegramLinkToken();
        window.open(res.url, '_blank', 'noopener');
        EDITH.showToast('Opened @edith_briefing_bot in Telegram. Tap Start to link!', 'info', 6000);
      } catch (err) {
        EDITH.showToast(err.message || 'Could not generate Telegram link.', 'danger');
      }
    });

    document.getElementById('btn-verify-tg-conn').addEventListener('click', async () => {
      const btn = document.getElementById('btn-verify-tg-conn');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const res = await EDITH.backend.sendTelegramTestBriefing();
        EDITH.showToast(`Briefing + audio sent to Telegram (${res.emailsCovered} emails)!`, 'success');
      } catch (err) {
        EDITH.showToast(err.message || 'Telegram briefing failed.', 'danger', 5500);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Briefing to Telegram';
      }
    });

    document.getElementById('form-profile-settings').addEventListener('submit', (e) => {
      e.preventDefault();
      EDITH.state.user.name = document.getElementById('set-user-name').value.trim() || 'Akash';
      EDITH.saveState();
      EDITH.showToast('Profile settings saved!', 'success');
    });

    document.getElementById('btn-reset-demo').addEventListener('click', async () => {
      try {
        await EDITH.backend.logout();
      } catch (err) {
        // Ignore offline errors
      }
      EDITH.resetState();
      EDITH.showToast('Demo state reset. Returning to Landing Page.', 'info');
      EDITH.navigateToView('landing');
    });
  }

  EDITH.renderDashboard = renderDashboard;
  EDITH.triggerTelegramBotCallUI = triggerTelegramBotCallUI;
})(window);
