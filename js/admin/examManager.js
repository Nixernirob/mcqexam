/* ============================================================
   examManager.js — Create, list, make-live, stop exams
   ============================================================ */

const ExamManager = (() => {

  async function loadDashboard() {
    // Stats
    const [examsRes, usersRes, attemptsRes] = await Promise.all([
      db.from('exams').select('id, is_live, ends_at'),
      db.from('users').select('id', { count: 'exact', head: true }),
      db.from('attempts').select('id', { count: 'exact', head: true }).eq('is_submitted', true)
    ]);

    const exams = examsRes.data || [];
    const now = new Date();
    const liveExams = exams.filter(e => e.is_live && new Date(e.ends_at) > now);

    document.getElementById('stat-total-exams').textContent = exams.length;
    document.getElementById('stat-live-exams').textContent = liveExams.length;
    document.getElementById('stat-total-users').textContent = usersRes.count ?? '—';
    document.getElementById('stat-total-attempts').textContent = attemptsRes.count ?? '—';

    // Live exams list
    const dashLiveList = document.getElementById('dash-live-list');
    if (!liveExams.length) {
      dashLiveList.innerHTML = '<div style="color:var(--text-muted);font-size:0.875rem;padding:12px 0">No live exams at the moment.</div>';
    } else {
      // Fetch full exam data for live ones
      const { data: liveData } = await db
        .from('exams')
        .select('*')
        .eq('is_live', true)
        .gt('ends_at', now.toISOString());

      dashLiveList.innerHTML = (liveData || []).map(e => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--success);flex-shrink:0;animation:pulse-dot 1s infinite"></span>
          <span style="flex:1;font-weight:600;font-size:0.9rem">${escHtml(e.name)}</span>
          <span style="font-size:0.78rem;color:var(--text-muted)">${e.total_questions} Qs</span>
          <button class="btn btn-danger btn-sm" onclick="ExamManager.stopExam('${e.id}')">
            <i class="fas fa-stop"></i> Stop
          </button>
        </div>`).join('');
    }
  }

  async function loadExamList() {
    const container = document.getElementById('admin-exam-list');
    container.innerHTML = '<div class="loading-center"><div class="spinner"></div><span>Loading…</span></div>';

    const { data: exams, error } = await db
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !exams) {
      container.innerHTML = '<p style="color:var(--danger)">Failed to load exams</p>';
      return;
    }

    if (!exams.length) {
      container.innerHTML = '<div style="color:var(--text-muted);padding:24px">No exams created yet.</div>';
      return;
    }

    const now = new Date();
    container.innerHTML = '';

    exams.forEach(exam => {
      const isLiveNow = exam.is_live && exam.ends_at && new Date(exam.ends_at) > now;
      const isEnded   = exam.starts_at && (!exam.is_live || (exam.ends_at && new Date(exam.ends_at) <= now));
      const isDraft   = !exam.starts_at;

      const statusClass = isLiveNow ? 'status-live' : (isDraft ? 'status-draft' : 'status-ended');
      const statusLabel = isLiveNow ? '🔴 Live' : (isDraft ? 'Draft' : 'Ended');
      const cardClass   = isLiveNow ? 'is-live' : (isEnded ? 'is-ended' : '');

      const card = document.createElement('div');
      card.className = `glass-card admin-exam-card ${cardClass}`;
      card.innerHTML = `
        <div class="exam-info">
          <h3>${escHtml(exam.name)}</h3>
          <p>${escHtml(exam.subject)} · ${escHtml(exam.topic)} · ${exam.total_questions} questions · ${exam.duration_mins} min</p>
        </div>
        <div class="exam-status ${statusClass}">${statusLabel}</div>
        <div class="exam-actions">
          ${isLiveNow
            ? `<button class="btn btn-danger btn-sm" onclick="ExamManager.stopExam('${exam.id}')"><i class="fas fa-stop"></i> Stop</button>`
            : `<button class="btn btn-success btn-sm" onclick="ExamManager.makeLive('${exam.id}')"
                ${exam.total_questions === 0 ? 'disabled title="Add questions first"' : ''}>
                <i class="fas fa-play"></i> Make Live
              </button>`
          }
          <button class="btn btn-ghost btn-sm" onclick="QuestionBuilder.selectExam('${exam.id}', '${escHtml(exam.name)}')">
            <i class="fas fa-question-circle"></i> Questions
          </button>
          <button class="btn btn-danger btn-sm" onclick="ExamManager.deleteExam('${exam.id}', '${escHtml(exam.name)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>`;
      container.appendChild(card);
    });
  }

  async function createExam(formData) {
    const admin = AdminAuth.getSession();
    if (!admin) return { success: false, error: 'Not authenticated' };

    const { data, error } = await db
      .from('exams')
      .insert({
        name: formData.name,
        subject: formData.subject,
        topic: formData.topic,
        duration_mins: parseInt(formData.duration_mins),
        live_duration_hours: parseInt(formData.live_duration_hours),
        marks_per_question: parseFloat(formData.marks_per_question),
        negative_marks: parseFloat(formData.negative_marks || 0)
      })
      .select('id, name')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, exam: data };
  }

  async function makeLive(examId) {
    const admin = AdminAuth.getSession();
    if (!admin) return;

    // Fetch exam to get live_duration
    const { data: exam } = await db.from('exams').select('*').eq('id', examId).single();
    if (!exam) { Toast.show('Exam not found', 'error'); return; }
    if (exam.total_questions === 0) { Toast.show('Add questions before making the exam live', 'error'); return; }

    const now = new Date();
    const endsAt = new Date(now.getTime() + exam.live_duration_hours * 3600 * 1000);

    const { error } = await db
      .from('exams')
      .update({ is_live: true, starts_at: now.toISOString(), ends_at: endsAt.toISOString() })
      .eq('id', examId);

    if (error) { Toast.show('Failed to make live: ' + error.message, 'error'); return; }
    Toast.show(`${exam.name} is now LIVE until ${endsAt.toLocaleString()}!`, 'success');
    await loadExamList();
    await loadDashboard();
  }

  async function stopExam(examId) {
    if (!confirm('Stop this exam? It will move to Past Exams.')) return;

    const { error } = await db
      .from('exams')
      .update({ is_live: false, ends_at: new Date().toISOString() })
      .eq('id', examId);

    if (error) { Toast.show('Failed to stop exam', 'error'); return; }
    Toast.show('Exam stopped and moved to Past Exams.', 'success');
    await loadExamList();
    await loadDashboard();
  }

  async function deleteExam(examId, examName) {
    if (!confirm(`Permanently delete "${examName}" and all its questions/attempts? This cannot be undone.`)) return;

    const { error } = await db.from('exams').delete().eq('id', examId);
    if (error) { Toast.show('Delete failed: ' + error.message, 'error'); return; }
    Toast.show('Exam deleted.', 'success');
    await loadExamList();
  }

  // Populate exam selects across the admin panel
  async function populateExamSelects() {
    const { data: exams } = await db
      .from('exams')
      .select('id, name')
      .order('created_at', { ascending: false });

    const sel = document.getElementById('q-exam-select');
    sel.innerHTML = '<option value="">— Choose an exam —</option>';
    (exams || []).forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      sel.appendChild(opt);
    });
  }

  function escHtml(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

  return { loadDashboard, loadExamList, createExam, makeLive, stopExam, deleteExam, populateExamSelects };
})();
