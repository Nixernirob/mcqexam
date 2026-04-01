/* ============================================================
   app.js — Main bootstrap for the user-facing app
   ============================================================ */

// Toast notification utility (global)
const Toast = (() => {
  function show(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `${icons[type] || ''} ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3100);
  }
  return { show };
})();

// ── App Entry Point ──────────────────────────────────────────
const App = (() => {

  async function init() {
    // Initialize all modules
    Router.init();
    LiveExam.init();
    Results.init();
    Leaderboard.init();
    Profile.init();

    // Set up tab change callbacks
    Router.onTabChange('live', ()        => LiveExam.load());
    Router.onTabChange('past', ()        => PastExam.load());
    Router.onTabChange('leaderboard', () => Leaderboard.loadExamList());
    Router.onTabChange('profile', ()     => Profile.load());

    // Check existing session
    const existingUser = await Auth.checkSession();
    if (existingUser) {
      onAuthSuccess();
    } else {
      Auth.showModal();
      // Wire up submit button
      document.getElementById('auth-submit-btn').addEventListener('click', handleAuthSubmit);
      document.getElementById('auth-email').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleAuthSubmit();
      });
    }
  }

  async function handleAuthSubmit() {
    const name = document.getElementById('auth-name').value;
    const email = document.getElementById('auth-email').value;
    await Auth.register(name, email);
  }

  function onAuthSuccess() {
    // Load initial tab (Live Exam)
    LiveExam.load();
    // Re-wire auth button in case it's shown again
    const btn = document.getElementById('auth-submit-btn');
    btn.removeEventListener('click', handleAuthSubmit);
    btn.addEventListener('click', handleAuthSubmit);
  }

  return { init, onAuthSuccess };
})();

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
