/* ============================================================
   auth.js — User session management via localStorage + Supabase
   ============================================================ */

const Auth = (() => {
  const STORAGE_KEY = 'mcq_user_v1';

  function getUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function clearUser() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function showModal(title, subtitle) {
    document.getElementById('auth-modal-title').textContent = title || 'Welcome to MCQ Exam Portal';
    document.getElementById('auth-modal-subtitle').textContent =
      subtitle || 'Enter your details to get started.';
    document.getElementById('auth-modal').classList.add('active');
    document.getElementById('auth-name').value = '';
    document.getElementById('auth-email').value = '';
    hideError('auth-name-error');
    hideError('auth-email-error');
  }

  function hideModal() {
    document.getElementById('auth-modal').classList.remove('active');
  }

  function showError(id, msg) {
    const el = document.getElementById(id);
    el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    el.style.display = 'flex';
  }

  function hideError(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  }

  async function register(name, email) {
    name = name.trim();
    email = email.trim().toLowerCase();

    // Validate
    let valid = true;
    if (!name) { showError('auth-name-error', 'Name is required'); valid = false; }
    if (!email || !isValidEmail(email)) { showError('auth-email-error', 'Enter a valid email address'); valid = false; }
    if (!valid) return;

    const btn = document.getElementById('auth-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Please wait…';

    try {
      // Check if email already exists in Supabase
      const { data: existing, error: fetchErr } = await db
        .from('users')
        .select('id, name, email')
        .eq('email', email)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (existing) {
        // Email exists — verify name matches
        if (existing.name.toLowerCase() !== name.toLowerCase()) {
          showError('auth-name-error', 'Name does not match our records for this email. Use the name you registered with.');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-arrow-right"></i> Continue';
          return;
        }
        // Name matches — log in
        saveUser({ id: existing.id, name: existing.name, email: existing.email });
        hideModal();
        Toast.show('Welcome back, ' + existing.name + '!', 'success');
        if (typeof App !== 'undefined') App.onAuthSuccess();
      } else {
        // New user — create record
        const { data: newUser, error: insertErr } = await db
          .from('users')
          .insert({ name, email })
          .select('id, name, email')
          .single();

        if (insertErr) throw insertErr;

        saveUser({ id: newUser.id, name: newUser.name, email: newUser.email });
        hideModal();
        Toast.show('Welcome, ' + newUser.name + '! 🎉', 'success');
        if (typeof App !== 'undefined') App.onAuthSuccess();
      }
    } catch (err) {
      console.error('Auth error:', err);
      Toast.show('Something went wrong. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-arrow-right"></i> Continue';
    }
  }

  async function checkSession() {
    const user = getUser();
    if (user && user.id && user.email) {
      // Verify the user still exists in Supabase
      const { data, error } = await db
        .from('users')
        .select('id, name, email')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && data) {
        // Refresh local storage with latest data
        saveUser({ id: data.id, name: data.name, email: data.email });
        return data;
      } else {
        // User deleted or error — clear and ask again
        clearUser();
        return null;
      }
    }
    return null;
  }

  async function updateProfile(name, email) {
    const user = getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    name = name.trim();
    email = email.trim().toLowerCase();

    if (!name) return { success: false, error: 'Name is required' };
    if (!isValidEmail(email)) return { success: false, error: 'Invalid email' };

    // Check if new email is taken by someone else
    if (email !== user.email) {
      const { data: existing } = await db
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (existing && existing.id !== user.id) {
        return { success: false, error: 'Email already in use by another account' };
      }
    }

    const { error } = await db
      .from('users')
      .update({ name, email })
      .eq('id', user.id);

    if (error) return { success: false, error: error.message };

    saveUser({ ...user, name, email });
    return { success: true };
  }

  // Expose
  return { getUser, saveUser, clearUser, showModal, hideModal, register, checkSession, updateProfile, isValidEmail };
})();
