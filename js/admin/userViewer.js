/* ============================================================
   userViewer.js — Admin view of all users + stats
   ============================================================ */

const UserViewer = (() => {

  async function load() {
    const admin = AdminAuth.getSession();
    if (!admin) return;

    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="7"><div class="loading-center"><div class="spinner"></div><span>Loading users…</span></div></td></tr>';

    const { data, error } = await db.rpc('get_all_users_admin', {
      p_admin_id: admin.admin_id
    });

    if (error || !data.success) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--danger);padding:20px">Failed to load users</td></tr>';
      return;
    }

    const users = data.users || [];

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted);padding:20px;text-align:center">No users registered yet</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    users.forEach((u, idx) => {
      const initial = (u.name || '?').charAt(0).toUpperCase();
      const joined = new Date(u.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      const avgScore = parseFloat(u.avg_score || 0).toFixed(1);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:var(--text-muted)">${idx + 1}</td>
        <td>
          <div class="user-name-cell">
            <div class="user-avatar-sm">${initial}</div>
            <span style="color:var(--text-primary);font-weight:600">${escHtml(u.name)}</span>
          </div>
        </td>
        <td>${escHtml(u.email)}</td>
        <td>${joined}</td>
        <td style="text-align:center">${u.total_attempts}</td>
        <td style="text-align:center">${u.live_attempts}</td>
        <td style="text-align:center;color:var(--accent-light);font-weight:600">${avgScore}</td>`;
      tbody.appendChild(tr);
    });
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  return { load };
})();
