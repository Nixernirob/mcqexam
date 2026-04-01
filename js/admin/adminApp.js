/* ============================================================
   adminApp.js — Admin panel bootstrap and navigation
   ============================================================ */

// Toast for admin panel
const Toast = (() => {
  function show(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `${icons[type] || ''} ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3100);
  }
  return { show };
})();

const AdminApp = (() => {
  const sections = ['dashboard', 'create-exam', 'manage-exams', 'questions', 'users', 'settings'];

  function navigateTo(sectionId) {
    sections.forEach(s => {
      document.getElementById('section-' + s)?.classList.toggle('active', s === sectionId);
    });
    document.querySelectorAll('.admin-nav-item[data-section]').forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });

    // Load data for section
    switch (sectionId) {
      case 'dashboard':   ExamManager.loadDashboard(); break;
      case 'manage-exams': ExamManager.loadExamList(); break;
      case 'questions':   ExamManager.populateExamSelects(); break;
      case 'users':       UserViewer.load(); break;
    }

    // Close mobile sidebar
    closeMobileSidebar();
  }

  function closeMobileSidebar() {
    document.getElementById('admin-sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').style.display = 'none';
  }

  async function init() {
    // Check existing session
    const session = AdminAuth.getSession();
    if (session) {
      showAdminApp(session);
      return;
    }

    // Show login
    document.getElementById('admin-login').style.display = 'flex';
    document.getElementById('admin-app').style.display = 'none';
    bindLoginEvents();
  }

  function bindLoginEvents() {
    const loginBtn = document.getElementById('login-btn');
    const pwInput  = document.getElementById('login-password');

    loginBtn.addEventListener('click', doLogin);
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    document.getElementById('toggle-pw').addEventListener('click', () => {
      const inp = document.getElementById('login-password');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  }

  async function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    if (!username || !password) {
      errEl.children[1].textContent = 'Please enter username and password';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in…';
    errEl.style.display = 'none';

    const result = await AdminAuth.login(username, password);

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';

    if (!result.success) {
      errEl.children[1].textContent = result.error || 'Invalid credentials';
      errEl.style.display = 'block';
      return;
    }

    AdminAuth.saveSession(result);
    showAdminApp(result);
  }

  function showAdminApp(session) {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-app').classList.add('active');

    // Set username display
    document.getElementById('admin-username-display').textContent = session.username;
    document.getElementById('admin-avatar-initial').textContent = session.username.charAt(0).toUpperCase();

    // Nav click handlers
    document.querySelectorAll('.admin-nav-item[data-section]').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.section));
    });

    // Logout
    document.getElementById('admin-logout-btn').addEventListener('click', () => {
      AdminAuth.clearSession();
      location.reload();
    });

    // Refresh buttons
    document.getElementById('refresh-exams-btn').addEventListener('click', () => ExamManager.loadExamList());
    document.getElementById('refresh-users-btn').addEventListener('click', () => UserViewer.load());

    // Create exam form
    document.getElementById('create-exam-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…';

      const result = await ExamManager.createExam({
        name: document.getElementById('exam-name').value,
        subject: document.getElementById('exam-subject').value,
        topic: document.getElementById('exam-topic').value,
        duration_mins: document.getElementById('exam-duration').value,
        live_duration_hours: document.getElementById('exam-live-duration').value,
        marks_per_question: document.getElementById('exam-marks').value,
        negative_marks: document.getElementById('exam-negative').value
      });

      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Create Exam & Add Questions';

      if (!result.success) {
        Toast.show('Create failed: ' + result.error, 'error');
        return;
      }

      Toast.show(`Exam "${result.exam.name}" created! Now add questions.`, 'success');
      e.target.reset();
      await ExamManager.populateExamSelects();
      await QuestionBuilder.selectExam(result.exam.id, result.exam.name);
    });

    // Settings — Change password
    document.getElementById('change-pw-btn').addEventListener('click', async () => {
      const oldPw  = document.getElementById('old-password').value;
      const newPw  = document.getElementById('new-password').value;
      const confPw = document.getElementById('confirm-password').value;

      if (!oldPw || !newPw) { Toast.show('Fill all password fields', 'error'); return; }
      if (newPw !== confPw)  { Toast.show('Passwords do not match', 'error'); return; }
      if (newPw.length < 4)  { Toast.show('Password must be at least 4 characters', 'error'); return; }

      const { data, error } = await db.rpc('change_admin_password', {
        p_admin_id: session.admin_id,
        p_old_password: oldPw,
        p_new_password: newPw
      });

      if (error || !data.success) {
        Toast.show(data?.error || 'Change password failed', 'error');
        return;
      }
      Toast.show('Password changed successfully!', 'success');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
    });

    // Settings — Add admin
    document.getElementById('add-admin-btn').addEventListener('click', async () => {
      const uname = document.getElementById('new-admin-username').value.trim();
      const pw    = document.getElementById('new-admin-password').value;

      if (!uname || !pw) { Toast.show('Username and password required', 'error'); return; }
      if (pw.length < 4) { Toast.show('Password must be at least 4 characters', 'error'); return; }

      const { data, error } = await db.rpc('add_admin', {
        p_requester_id: session.admin_id,
        p_username: uname,
        p_password: pw
      });

      if (error || !data.success) {
        Toast.show(data?.error || 'Add admin failed', 'error');
        return;
      }
      Toast.show(`Admin "${uname}" added successfully!`, 'success');
      document.getElementById('new-admin-username').value = '';
      document.getElementById('new-admin-password').value = '';
    });

    // Mobile sidebar toggle
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      const sidebar = document.getElementById('admin-sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.toggle('open');
      overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
    });

    document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);

    // Init sub-modules
    QuestionBuilder.init();

    // Load default section
    navigateTo('dashboard');
  }

  return { init, navigateTo };
})();

// Start admin app
document.addEventListener('DOMContentLoaded', () => AdminApp.init());
