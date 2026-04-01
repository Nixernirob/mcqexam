/* ============================================================
   adminAuth.js — Admin login via verify_admin RPC (bcrypt)
   ============================================================ */

const AdminAuth = (() => {
  const SESSION_KEY = 'mcq_admin_session';

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch { return null; }
  }

  function saveSession(admin) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(admin));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function login(username, password) {
    const { data, error } = await db.rpc('verify_admin', {
      p_username: username,
      p_password: password
    });

    if (error) return { success: false, error: 'Server error. Please try again.' };
    return data;
  }

  return { getSession, saveSession, clearSession, login };
})();
