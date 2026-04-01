/* ============================================================
   profile.js — User profile view, edit, stats
   ============================================================ */

const Profile = (() => {

  async function load() {
    const user = Auth.getUser();
    if (!user) return;

    // Set display info
    document.getElementById('profile-display-name').textContent = user.name;
    document.getElementById('profile-display-email').textContent = user.email;
    document.getElementById('profile-avatar-initials').textContent = user.name.charAt(0).toUpperCase();

    // Pre-fill edit form
    document.getElementById('edit-name').value = user.name;
    document.getElementById('edit-email').value = user.email;

    // Load stats
    await loadStats(user.id);
  }

  async function loadStats(userId) {
    document.getElementById('stat-total-exams').textContent = '…';
    document.getElementById('stat-top10').textContent = '…';

    try {
      const { data, error } = await db.rpc('get_user_stats', { p_user_id: userId });
      if (error) throw error;
      document.getElementById('stat-total-exams').textContent = data.total_exams ?? 0;
      document.getElementById('stat-top10').textContent = data.top10_count ?? 0;
    } catch (err) {
      console.error('Stats error:', err);
      document.getElementById('stat-total-exams').textContent = '—';
      document.getElementById('stat-top10').textContent = '—';
    }
  }

  function init() {
    document.getElementById('save-profile-btn').addEventListener('click', async () => {
      const name = document.getElementById('edit-name').value;
      const email = document.getElementById('edit-email').value;
      const btn = document.getElementById('save-profile-btn');

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

      const result = await Auth.updateProfile(name, email);

      if (result.success) {
        Toast.show('Profile updated successfully!', 'success');
        await load(); // refresh display
      } else {
        Toast.show(result.error || 'Update failed', 'error');
      }

      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    });
  }

  return { load, init };
})();
