/* ============================================================
   pastExam.js — Past exams listing (unlimited attempts)
   ============================================================ */

const PastExam = (() => {
  let loaded = false;

  async function load() {
    if (loaded) return; // Only reload if needed
    loaded = true;
    const container = document.getElementById('past-exam-list');
    container.innerHTML = '<div class="loading-center"><div class="spinner"></div><span>Loading…</span></div>';

    const now = new Date().toISOString();

    // Past exams: is_live=false OR ends_at <= now
    const { data: exams, error } = await db
      .from('exams')
      .select('*')
      .or(`is_live.eq.false,ends_at.lte.${now}`)
      .not('starts_at', 'is', null) // Must have been started at least once
      .order('ends_at', { ascending: false });

    if (error) {
      container.innerHTML = renderError('Failed to load past exams');
      return;
    }

    const pastExams = (exams || []).filter(e => {
      // Exclude currently live exams
      const isLiveNow = e.is_live && new Date(e.ends_at) > new Date();
      return !isLiveNow;
    });

    if (!pastExams.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📚</div>
        <h3>No Past Exams</h3>
        <p>Completed exams will appear here. Check the Live Exams tab!</p>
      </div>`;
      return;
    }

    container.innerHTML = '';
    pastExams.forEach(exam => {
      const card = document.createElement('div');
      card.className = 'glass-card exam-card';

      const endedAt = exam.ends_at ? new Date(exam.ends_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }) : 'N/A';

      card.innerHTML = `
        <div class="exam-card-header">
          <div class="exam-card-title">${escHtml(exam.name)}</div>
          <span class="exam-badge badge-past"><i class="fas fa-history"></i> Past</span>
        </div>
        <div class="exam-meta">
          <div class="exam-meta-item"><i class="fas fa-book-open"></i> ${escHtml(exam.subject)}</div>
          <div class="exam-meta-item"><i class="fas fa-tag"></i> ${escHtml(exam.topic)}</div>
          <div class="exam-meta-item"><i class="fas fa-question-circle"></i> ${exam.total_questions} Qs</div>
          <div class="exam-meta-item"><i class="fas fa-clock"></i> ${exam.duration_mins} min</div>
        </div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:8px;">
          <i class="fas fa-calendar-check"></i> Ended: ${endedAt} &nbsp;
          <span style="color:var(--accent-light);font-weight:600"><i class="fas fa-infinity"></i> Unlimited attempts</span>
        </div>`;

      card.addEventListener('click', () => openDetail(exam));
      container.appendChild(card);
    });
  }

  function openDetail(exam) {
    document.getElementById('detail-exam-name').textContent = exam.name;
    document.getElementById('detail-subject').textContent = exam.subject;
    document.getElementById('detail-topic').textContent = exam.topic;
    document.getElementById('detail-questions').textContent = exam.total_questions;
    document.getElementById('detail-marks').textContent =
      (exam.marks_per_question * exam.total_questions).toFixed(1);
    document.getElementById('detail-negative').textContent =
      exam.negative_marks > 0 ? `-${exam.negative_marks} per wrong answer` : 'None';
    document.getElementById('detail-duration').textContent = exam.duration_mins + ' minutes';
    document.getElementById('detail-time-row').style.display = 'none';

    const startBtn = document.getElementById('detail-start-btn');
    const takenMsg = document.getElementById('detail-taken-msg');
    startBtn.disabled = false;
    startBtn.innerHTML = '<i class="fas fa-play"></i> Start Practice';
    takenMsg.style.display = 'none';

    // Override the start button for past exam
    startBtn.onclick = () => {
      document.getElementById('exam-detail-modal').classList.remove('active');
      ExamRunner.start(exam, false); // false = not live attempt
    };

    document.getElementById('exam-detail-modal').classList.add('active');
  }

  function renderError(msg) {
    return `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${msg}</p></div>`;
  }

  function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function invalidateCache() { loaded = false; }

  return { load, invalidateCache };
})();
