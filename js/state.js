/* ==========================================================================
   EDITH Mail Bot - Centralized State & Mock Data (localStorage persisted)
   ========================================================================== */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'edith_mail_bot_state_v1';

  const SIMULATOR_EMAILS = [
    {
      id: 'em-1',
      title: 'College Examination Notice',
      sender: 'registrar@college.edu',
      category: 'Important',
      badgeClass: 'badge-danger',
      shortLine: 'End-semester timetable published; practical exams begin December 9th.',
      fullSummary: 'The Office of the Registrar released the Winter 2026 examination schedule. Hall tickets are downloadable from the student portal starting Monday, and lab viva slots must be confirmed by Friday 5:00 PM.'
    },
    {
      id: 'em-2',
      title: 'TCS Interview Opportunity',
      sender: 'careers@tcs.com',
      category: 'Important',
      badgeClass: 'badge-primary',
      shortLine: 'Shortlisted for Prime Role technical interview this Thursday at 11:00 AM.',
      fullSummary: 'Congratulations! Your profile has been shortlisted for the TCS Ninja/Prime campus drive. Please join the virtual interview link 15 minutes early with your government ID and updated resume.'
    },
    {
      id: 'em-3',
      title: 'Amazon Festival Deals & Cart Reminder',
      sender: 'offers@amazon.in',
      category: 'Promotional',
      badgeClass: 'badge-warning',
      shortLine: 'Up to 40% off electronics and a price drop on wireless headphones in your cart.',
      fullSummary: 'Limited-time Lightning Deals on noise-canceling headphones, USB-C hubs, and mechanical keyboards. Extra 10% instant bank discount expires tonight at 11:59 PM.'
    },
    {
      id: 'em-4',
      title: 'Security Alert: New Sign-In Detected',
      sender: 'no-reply@google.com',
      category: 'Security Alert',
      badgeClass: 'badge-danger',
      shortLine: 'A new sign-in was detected on Windows Chrome in Bengaluru.',
      fullSummary: 'Your Google account was accessed from a new Windows device at 08:42 AM IST. If this was you, no action is needed. If not, review your recent security activity immediately.'
    },
    {
      id: 'em-5',
      title: '3 Newsletters & Digest Updates',
      sender: 'updates@geeksforgeeks.org',
      category: 'Newsletter',
      badgeClass: 'badge-info',
      shortLine: 'Weekly DSA interview prep digest, System Design notes, and 2 community threads.',
      fullSummary: 'Includes "Top 20 Dynamic Programming Patterns", a System Design walkthrough on distributed rate limiters, and two weekly coding contest announcements.'
    }
  ];

  function createDefaultState() {
    return {
      currentView: 'landing', // 'landing' | 'onboarding' | 'dashboard'
      onboardingStage: 2,     // 2..7
      dashboardTab: 'dashboard', // 'dashboard' | 'schedule' | 'accounts' | 'history' | 'preferences' | 'settings'
      onboardingComplete: false,

      user: {
        name: 'Akash',
        authMethod: 'Google',
        email: 'akash2004@gmail.com'
      },

      phone: {
        countryCode: '+91',
        number: '',
        verified: false,
        consentAccepted: false
      },

      accounts: [
        {
          id: 'acc-1',
          provider: 'Gmail',
          email: 'akash2004@gmail.com',
          isDefault: true,
          connected: true
        }
      ],

      schedule: {
        mode: 'once', // 'once' | 'interval' | 'custom'
        preferredTime: '09:00',
        intervalHours: 4,
        customTimes: ['09:00', '18:00']
      },

      settings: {
        callingWindowEnabled: true,
        windowStart: '09:00',
        windowEnd: '21:00',
        maxCallsEnabled: true,
        maxCallsPerDay: 4,
        skipIfEmpty: true,
        includeWeekends: true,
        summaryLength: 'Standard (3-4 minutes)',
        timezone: '(GMT+5:30) India Standard Time'
      },

      botActive: true,
      newEmailsCount: 12,
      voicePlaybackEnabled: true,

      callHistory: [
        {
          id: 'call-101',
          dateTime: 'Today, 09:00 AM',
          emailsCovered: 7,
          status: 'Completed',
          summaryEmails: SIMULATOR_EMAILS
        },
        {
          id: 'call-102',
          dateTime: 'Yesterday, 06:00 PM',
          emailsCovered: 0,
          status: 'Skipped (No new emails)',
          summaryEmails: []
        },
        {
          id: 'call-103',
          dateTime: 'Yesterday, 09:00 AM',
          emailsCovered: 5,
          status: 'Completed',
          summaryEmails: SIMULATOR_EMAILS.slice(0, 4)
        },
        {
          id: 'call-104',
          dateTime: 'Nov 25, 09:00 AM',
          emailsCovered: 0,
          status: 'Failed (Retry pending)',
          summaryEmails: []
        }
      ]
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultState();
      const parsed = JSON.parse(raw);
      const defaults = createDefaultState();
      return {
        ...defaults,
        ...parsed,
        user: { ...defaults.user, ...(parsed.user || {}) },
        phone: { ...defaults.phone, ...(parsed.phone || {}) },
        schedule: { ...defaults.schedule, ...(parsed.schedule || {}) },
        settings: { ...defaults.settings, ...(parsed.settings || {}) },
        accounts: Array.isArray(parsed.accounts) && parsed.accounts.length ? parsed.accounts : defaults.accounts,
        callHistory: Array.isArray(parsed.callHistory) ? parsed.callHistory : defaults.callHistory
      };
    } catch (err) {
      return createDefaultState();
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Ignore storage quota errors in restricted environments
    }
  }

  function resetState() {
    state = createDefaultState();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      // Ignore
    }
    return state;
  }

  function formatTime12h(time24) {
    if (!time24 || !time24.includes(':')) return time24 || '09:00 AM';
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${mStr} ${suffix}`;
  }

  function getNextScheduledCallText() {
    if (!state.botActive) return 'Paused';
    const { mode, preferredTime, intervalHours, customTimes } = state.schedule;
    if (mode === 'once') {
      return `Tomorrow, ${formatTime12h(preferredTime)}`;
    }
    if (mode === 'interval') {
      return `Every ${intervalHours} hrs (from ${formatTime12h(preferredTime)})`;
    }
    if (mode === 'custom' && customTimes.length > 0) {
      return `Next at ${formatTime12h(customTimes[0])}`;
    }
    return `Today, ${formatTime12h(preferredTime)}`;
  }

  global.EDITH = global.EDITH || {};
  global.EDITH.state = state;
  global.EDITH.SIMULATOR_EMAILS = SIMULATOR_EMAILS;
  global.EDITH.saveState = saveState;
  global.EDITH.resetState = function () {
    global.EDITH.state = resetState();
    return global.EDITH.state;
  };
  global.EDITH.formatTime12h = formatTime12h;
  global.EDITH.getNextScheduledCallText = getNextScheduledCallText;
})(window);
