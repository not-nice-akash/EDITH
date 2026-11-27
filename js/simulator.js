/* ==========================================================================
   EDITH Mail Bot - Interactive Mobile Call Simulator (Stages 11–16)
   ========================================================================== */

(function (global) {
  'use strict';

  const EDITH = global.EDITH;

  let simStage = 11;
  let callSeconds = 0;
  let timerInterval = null;
  let summaryStepIdx = 0;
  let stepTimeout = null;
  let isMuted = false;
  let isSpeaker = true;
  let latestCompletedCall = null;
  let simEmails = EDITH.SIMULATOR_EMAILS;
  let simGreeting = '';
  let simSpokenScript = '';
  let isFetchingSummary = false;

  function stopSpeech() {
    if ('speechSynthesis' in global) {
      global.speechSynthesis.cancel();
    }
  }

  function speakText(text) {
    if (!EDITH.state.voicePlaybackEnabled || isMuted) return;
    if (!('speechSynthesis' in global)) return;
    stopSpeech();
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.03;
      utter.pitch = 1.0;
      global.speechSynthesis.speak(utter);
    } catch (err) {
      // Ignore speech synthesis errors in restricted environments
    }
  }

  function clearTimers() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (stepTimeout) {
      clearTimeout(stepTimeout);
      stepTimeout = null;
    }
  }

  function formatTimer(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function startCallTimer() {
    clearInterval(timerInterval);
    callSeconds = 0;
    timerInterval = setInterval(() => {
      callSeconds += 1;
      const el = document.getElementById('sim-call-timer');
      if (el) el.textContent = formatTimer(callSeconds);
    }, 1000);
  }

  function closeSimulator() {
    clearTimers();
    stopSpeech();
    document.getElementById('modal-simulator').classList.add('hidden');
  }

  function openSimulator() {
    simStage = 11;
    callSeconds = 0;
    summaryStepIdx = 0;
    isMuted = false;
    isSpeaker = true;
    latestCompletedCall = null;
    simEmails = EDITH.SIMULATOR_EMAILS;
    simGreeting = '';
    simSpokenScript = '';
    isFetchingSummary = false;
    clearTimers();
    stopSpeech();

    const now = new Date();
    const clockEl = document.getElementById('sim-clock-status');
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    document.getElementById('modal-simulator').classList.remove('hidden');
    renderSimStage();
  }

  function renderRobotAvatarSvg() {
    return `
      <svg width="56" height="56" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="#2563EB" />
        <rect x="9" y="13" width="22" height="17" rx="6" fill="#FFFFFF" />
        <line x1="20" y1="7" x2="20" y2="13" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" />
        <circle cx="20" cy="6.5" r="2.5" fill="#93C5FD" />
        <circle cx="15" cy="21" r="2.2" fill="#2563EB" />
        <circle cx="25" cy="21" r="2.2" fill="#2563EB" />
        <path d="M16 25.5C17.2 26.8 22.8 26.8 24 25.5" stroke="#2563EB" stroke-width="2" stroke-linecap="round" />
      </svg>
    `;
  }

  function renderWaveform(paused) {
    return `
      <div class="waveform ${paused ? 'paused' : ''}" aria-hidden="true">
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
      </div>
    `;
  }

  function renderSecondaryControls() {
    return `
      <div class="call-secondary-controls">
        <button type="button" class="call-mini-btn ${isMuted ? 'active' : ''}" id="sim-btn-mute">
          <span class="call-mini-icon">${isMuted ? '🔇' : '🎙️'}</span>
          <span>${isMuted ? 'Muted' : 'Mute'}</span>
        </button>
        <button type="button" class="call-mini-btn ${isSpeaker ? 'active' : ''}" id="sim-btn-speaker">
          <span class="call-mini-icon">🔊</span>
          <span>Speaker</span>
        </button>
        <button type="button" class="call-mini-btn end" id="sim-btn-end-call">
          <span class="call-mini-icon">📵</span>
          <span>End</span>
        </button>
      </div>
    `;
  }

  function bindSecondaryControls() {
    const muteBtn = document.getElementById('sim-btn-mute');
    const spkBtn = document.getElementById('sim-btn-speaker');
    const endBtn = document.getElementById('sim-btn-end-call');

    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        if (isMuted) stopSpeech();
        renderSimStage();
      });
    }
    if (spkBtn) {
      spkBtn.addEventListener('click', () => {
        isSpeaker = !isSpeaker;
        renderSimStage();
      });
    }
    if (endBtn) {
      endBtn.addEventListener('click', () => {
        finishCallAndLog();
      });
    }
  }

  function renderVoiceToggle() {
    return `
      <div class="voice-toggle-row">
        <span>🔈 Browser Voice Playback</span>
        <label class="toggle" style="transform:scale(0.85);">
          <input type="checkbox" id="sim-voice-toggle" ${EDITH.state.voicePlaybackEnabled ? 'checked' : ''} aria-label="Toggle browser voice playback" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }

  function bindVoiceToggle(textToSpeak) {
    const chk = document.getElementById('sim-voice-toggle');
    if (!chk) return;
    chk.addEventListener('change', () => {
      EDITH.state.voicePlaybackEnabled = chk.checked;
      EDITH.saveState();
      if (chk.checked && textToSpeak) {
        speakText(textToSpeak);
      } else {
        stopSpeech();
      }
    });
  }

  function renderSimStage() {
    const screen = document.getElementById('sim-screen');
    screen.className = simStage === 15 ? 'phone-screen lockscreen' : 'phone-screen';

    if (simStage === 11) {
      renderStage11(screen);
    } else if (simStage === 12) {
      renderStage12(screen);
    } else if (simStage === 13) {
      renderStage13(screen);
    } else if (simStage === 14) {
      renderStage14(screen);
    } else if (simStage === 15) {
      renderStage15(screen);
    }
  }

  /* Stage 11: Incoming Call */
  function renderStage11(screen) {
    screen.innerHTML = `
      <div class="call-avatar-wrap">
        <div class="call-avatar-ring">${renderRobotAvatarSvg()}</div>
        <div class="call-caller-name">EDITH Mail Bot</div>
        <div class="call-caller-sub">Incoming Call...</div>
        <div class="badge badge-primary" style="margin-top:0.85rem;background:rgba(37,99,235,0.22);color:#93C5FD;">
          Scheduled Morning Briefing
        </div>
      </div>

      <div class="call-incoming-actions">
        <div class="call-circle-btn-wrap">
          <button type="button" class="call-circle-btn call-btn-decline" id="sim-btn-decline" aria-label="Decline call">
            ✕
          </button>
          <span>Decline</span>
        </div>
        <div class="call-circle-btn-wrap">
          <button type="button" class="call-circle-btn call-btn-accept" id="sim-btn-accept" aria-label="Accept call">
            📞
          </button>
          <span>Accept</span>
        </div>
      </div>
    `;

    document.getElementById('sim-btn-decline').addEventListener('click', async () => {
      let missedEntry = null;
      try {
        const res = await EDITH.backend.logMissedCall();
        missedEntry = res.call;
      } catch (err) {
        const nowLabel = `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        missedEntry = {
          id: `call-${Date.now()}`,
          dateTime: nowLabel,
          emailsCovered: 0,
          status: 'Failed (Retry pending)',
          summaryEmails: []
        };
      }
      EDITH.state.callHistory.unshift(missedEntry);
      EDITH.saveState();
      closeSimulator();
      EDITH.showToast('Call declined. Logged as missed in Call History.', 'info');
      if (EDITH.state.currentView === 'dashboard') {
        EDITH.renderDashboard();
      }
    });

    document.getElementById('sim-btn-accept').addEventListener('click', async () => {
      simStage = 12;
      isFetchingSummary = true;
      startCallTimer();
      renderSimStage();

      try {
        const res = await EDITH.backend.simulateCall();
        simGreeting = res.spokenGreeting || '';
        simSpokenScript = res.spokenScript || '';
        simEmails = Array.isArray(res.items) && res.items.length > 0 ? res.items : [];
        latestCompletedCall = res.call || null;
        if (latestCompletedCall) {
          EDITH.state.callHistory.unshift(latestCompletedCall);
          EDITH.state.newEmailsCount = 0;
          EDITH.saveState();
        }
      } catch (err) {
        // Offline / unauthenticated fallback to local demo emails
        simEmails = EDITH.SIMULATOR_EMAILS;
        simGreeting =
          'Hello! This is EDITH Mail Bot. You have 7 new emails since your last briefing. Would you like to hear the summary?';
        simSpokenScript = '';
        latestCompletedCall = null;
      } finally {
        isFetchingSummary = false;
        if (simStage === 12) {
          renderSimStage();
        }
      }
    });
  }

  /* Stage 12: Call Greeting */
  function renderStage12(screen) {
    if (isFetchingSummary) {
      screen.innerHTML = `
        <div class="call-active-header">
          <div class="call-caller-name" style="font-size:1.1rem;">EDITH Mail Bot</div>
          <div class="call-timer" id="sim-call-timer">${formatTimer(callSeconds)}</div>
        </div>
        ${renderWaveform(false)}
        <div class="transcript-box">
          <div class="transcript-speaker">EDITH Assistant</div>
          <div>Connecting to your inbox and generating your Gemini AI voice briefing...</div>
        </div>
        <div class="call-controls-bar">${renderSecondaryControls()}</div>
      `;
      bindSecondaryControls();
      return;
    }

    const greetingText =
      simGreeting ||
      'Hello! This is EDITH Mail Bot. You have 7 new emails since your last briefing. Would you like to hear the summary?';
    const noEmails = simEmails.length === 0;

    screen.innerHTML = `
      <div class="call-active-header">
        <div class="call-caller-name" style="font-size:1.1rem;">EDITH Mail Bot</div>
        <div class="call-timer" id="sim-call-timer">${formatTimer(callSeconds)}</div>
      </div>

      ${renderWaveform(false)}
      ${renderVoiceToggle()}

      <div class="transcript-box">
        <div class="transcript-speaker">EDITH Assistant</div>
        <div>"${EDITH.escapeHtml(greetingText)}"</div>
      </div>

      <div class="call-controls-bar">
        ${
          noEmails
            ? `<button type="button" class="btn btn-primary btn-block" id="sim-btn-hear-summary">End Call &amp; View Notification →</button>`
            : `<button type="button" class="btn btn-success btn-block" id="sim-btn-hear-summary">Yes, Hear Summary →</button>`
        }
        ${renderSecondaryControls()}
      </div>
    `;

    speakText(greetingText);
    bindVoiceToggle(greetingText);
    bindSecondaryControls();

    document.getElementById('sim-btn-hear-summary').addEventListener('click', () => {
      if (noEmails) {
        finishCallAndLog();
        return;
      }
      summaryStepIdx = 0;
      simStage = 13;
      if (simSpokenScript) {
        speakText(simSpokenScript);
      }
      renderSimStage();
    });
  }

  /* Stage 13: Email Summary During Call */
  function renderStage13(screen) {
    const emails = simEmails.length ? simEmails : EDITH.SIMULATOR_EMAILS;
    const current = emails[summaryStepIdx];
    const spoken = `Email ${summaryStepIdx + 1}: ${current.title} from ${current.sender}. ${current.shortLine}`;

    screen.innerHTML = `
      <div class="call-active-header">
        <div class="call-caller-name" style="font-size:1.05rem;">Reading Summary (${summaryStepIdx + 1}/${emails.length})</div>
        <div class="call-timer" id="sim-call-timer">${formatTimer(callSeconds)}</div>
      </div>

      ${renderWaveform(false)}
      ${renderVoiceToggle()}

      <div class="sim-summary-list">
        ${emails
          .map((item, idx) => {
            const cls = idx === summaryStepIdx ? 'active' : idx < summaryStepIdx ? 'done' : '';
            return `
              <div class="sim-summary-step ${cls}">
                <div style="font-weight:700;">${idx + 1}. ${EDITH.escapeHtml(item.title)}</div>
                ${idx === summaryStepIdx ? `<div style="margin-top:0.25rem;font-size:0.78rem;color:#E2E8F0;">${EDITH.escapeHtml(item.shortLine)}</div>` : ''}
              </div>
            `;
          })
          .join('')}
      </div>

      <div class="call-controls-bar">
        <button type="button" class="btn btn-primary btn-block" id="sim-btn-next-email">
          ${summaryStepIdx < emails.length - 1 ? 'Next Highlight →' : 'Finish Briefing →'}
        </button>
        ${renderSecondaryControls()}
      </div>
    `;

    if (!simSpokenScript || summaryStepIdx > 0) {
      speakText(spoken);
    }
    bindVoiceToggle(simSpokenScript || spoken);
    bindSecondaryControls();

    document.getElementById('sim-btn-next-email').addEventListener('click', () => {
      clearTimeout(stepTimeout);
      if (summaryStepIdx < emails.length - 1) {
        summaryStepIdx += 1;
        renderSimStage();
      } else {
        simStage = 14;
        renderSimStage();
      }
    });

    // Auto-advance every 5.5s for hands-free simulation
    clearTimeout(stepTimeout);
    stepTimeout = setTimeout(() => {
      if (simStage !== 13) return;
      if (summaryStepIdx < emails.length - 1) {
        summaryStepIdx += 1;
        renderSimStage();
      } else {
        simStage = 14;
        renderSimStage();
      }
    }, 5500);
  }

  /* Stage 14: Call End */
  async function finishCallAndLog() {
    clearTimers();
    stopSpeech();

    if (!latestCompletedCall) {
      const nowLabel = `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      latestCompletedCall = await EDITH.api.logCallResult({
        id: `call-${Date.now()}`,
        dateTime: nowLabel,
        emailsCovered: simEmails.length || 7,
        status: 'Completed',
        summaryEmails: simEmails
      });
      EDITH.state.callHistory.unshift(latestCompletedCall);
      EDITH.state.newEmailsCount = 0;
      EDITH.saveState();
    }

    if (EDITH.state.currentView === 'dashboard') {
      EDITH.renderDashboard();
    }

    simStage = 15;
    renderSimStage();
  }

  function renderStage14(screen) {
    const goodbye = "That's all for your new emails. Have a great day!";

    screen.innerHTML = `
      <div class="call-active-header">
        <div class="call-caller-name" style="font-size:1.1rem;">EDITH Mail Bot</div>
        <div class="call-timer" id="sim-call-timer">${formatTimer(callSeconds)}</div>
      </div>

      ${renderWaveform(true)}

      <div class="transcript-box" style="margin-top:1rem;">
        <div class="transcript-speaker">EDITH Assistant</div>
        <div>"${goodbye}"</div>
      </div>

      <div class="call-controls-bar">
        <button type="button" class="btn btn-primary btn-block" id="sim-btn-complete-call">
          End Call &amp; View Notification →
        </button>
      </div>
    `;

    speakText(goodbye);

    document.getElementById('sim-btn-complete-call').addEventListener('click', () => {
      finishCallAndLog();
    });

    clearTimeout(stepTimeout);
    stepTimeout = setTimeout(() => {
      if (simStage === 14) finishCallAndLog();
    }, 3200);
  }

  /* Stage 15: Mobile Lock-Screen Notification -> Stage 16 */
  function renderStage15(screen) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    screen.innerHTML = `
      <div class="lockscreen-clock">
        <div class="lockscreen-time">${timeStr}</div>
        <div class="lockscreen-date">${dateStr}</div>
      </div>

      <button type="button" class="lock-notif-card" id="sim-lock-notification">
        <div class="lock-notif-top">
          <span>🤖 EDITH Mail Bot</span>
          <span>now</span>
        </div>
        <div class="lock-notif-title">Call completed • 7 emails summarized</div>
        <div class="lock-notif-body">Tap to view full categorized summary &amp; action items.</div>
      </button>

      <div style="margin-top:auto;text-align:center;font-size:0.78rem;color:#94A3B8;">
        Tap the notification banner above to open Stage 16
      </div>
    `;

    document.getElementById('sim-lock-notification').addEventListener('click', () => {
      const record = latestCompletedCall || EDITH.state.callHistory[0];
      closeSimulator();
      EDITH.openCallSummaryModal(record);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-close-simulator').addEventListener('click', closeSimulator);
  });

  EDITH.openSimulator = openSimulator;
  EDITH.closeSimulator = closeSimulator;
})(window);
