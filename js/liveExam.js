/* ============================================================
   liveExam.js — Live exam listing, details modal, attempt check
   ============================================================ */

const LiveExam = (() => {
  let liveExams = [];
  let userAttemptedExamIds = new Set();
  let currentDetailExam = null;
  let countdownIntervals = {};

  async function load() {
    const container = document.getElementById('live-exam-list');
    container.innerHTML = '<div class="loading-center"><div class="spinner"></div><span>Loading live exams…</span></div>';

    const user = Auth.getUser();

    // Fetch live exams (is_live=true AND ends_at > now OR ends_at IS NULL)
    const now = new Date().toISOString();
    const { data: exams, error } = await db
      .from('exams')
      .select('*')
      .eq('is_live', true)
      .gt('ends_at', now)
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = renderError('Failed to load exams');
      return;
    }

    liveExams = exams || [];

    if (!liveExams.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>No Live Exams</h3>
        <p>There are no active exams right now. Check back soon!</p>
      </div>`;
      return;
    }

    // Fetch user's attempted live exam IDs
    if (user) {
      const { data: attempts } = await db
        .from('attempts')
        .select('exam_id')
        .eq('user_id', user.id)
        .eq('is_live_attempt', true);
      userAttemptedExamIds = new Set((attempts || []).map(a => a.exam_id));
    }

    renderExams(container);
  }

  function renderExams(container) {
    // Clear any old countdowns
    Object.values(countdownIntervals).forEach(clearInterval);
    countdownIntervals = {};

    container.innerHTML = '';

    liveExams.forEach(exam => {
      const isTaken = userAttemptedExamIds.has(exam.id);
      const card = document.createElement('div');
      card.className = 'glass-card exam-card';
      card.dataset.examId = exam.id;

      card.innerHTML = `
        <div class="exam-card-header">
          <div class="exam-card-title">${escHtml(exam.name)}</div>
          <div>
            ${isTaken
              ? '<span class="exam-badge badge-taken"><i class="fas fa-check"></i> Taken</span>'
              : '<span class="exam-badge badge-live"><i class="fas fa-circle" style="font-size:0.5rem"></i> Live</span>'
            }
          </div>
        </div>
        <div class="exam-meta">
          <div class="exam-meta-item"><i class="fas fa-book-open"></i> ${escHtml(exam.subject)}</div>
          <div class="exam-meta-item"><i class="fas fa-tag"></i> ${escHtml(exam.topic)}</div>
          <div class="exam-meta-item"><i class="fas fa-question-circle"></i> ${exam.total_questions} Qs</div>
          <div class="exam-meta-item"><i class="fas fa-clock"></i> ${exam.duration_mins} min</div>
        </div>
        <div class="exam-timer" id="timer-${exam.id}">
          <i class="fas fa-hourglass-half"></i> <span>Calculating…</span>
        </div>`;

      card.addEventListener('click', () => openDetail(exam, isTaken));
      container.appendChild(card);

      // Start countdown
      startCountdown(exam.id, exam.ends_at);
    });
  }

  function startCountdown(examId, endsAt) {
    const timerEl = document.getElementById('timer-' + examId);
    if (!timerEl) return;

    const update = () => {
      const diff = new Date(endsAt) - new Date();
      if (diff <= 0) {
        timerEl.innerHTML = '<i class="fas fa-times-circle"></i> <span>Expired</span>';
        clearInterval(countdownIntervals[examId]);
        // Reload to remove expired exam
        setTimeout(load, 1000);
        return;
      }
      timerEl.innerHTML = `<i class="fas fa-hourglass-half"></i> <span>${formatDuration(diff)}</span>`;
    };

    update();
    countdownIntervals[examId] = setInterval(update, 1000);
  }

  function openDetail(exam, isTaken) {
    currentDetailExam = exam;
    const now = new Date();
    const endsAt = new Date(exam.ends_at);
    const diff = endsAt - now;

    document.getElementById('detail-exam-name').textContent = exam.name;
    document.getElementById('detail-subject').textContent = exam.subject;
    document.getElementById('detail-topic').textContent = exam.topic;
    document.getElementById('detail-questions').textContent = exam.total_questions;
    document.getElementById('detail-marks').textContent =
      (exam.marks_per_question * exam.total_questions).toFixed(1);
    document.getElementById('detail-negative').textContent =
      exam.negative_marks > 0 ? `-${exam.negative_marks} per wrong answer` : 'None';
    document.getElementById('detail-duration').textContent = exam.duration_mins + ' minutes';
    document.getElementById('detail-time-remaining').textContent =
      diff > 0 ? formatDuration(diff) : 'Expired';
    document.getElementById('detail-time-row').style.display = 'flex';

    const startBtn = document.getElementById('detail-start-btn');
    const takenMsg = document.getElementById('detail-taken-msg');

    if (isTaken) {
      startBtn.disabled = true;
      startBtn.innerHTML = '<i class="fas fa-lock"></i> Already Taken';
      takenMsg.style.display = 'block';
    } else {
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fas fa-play"></i> Start Exam';
      takenMsg.style.display = 'none';
    }

    document.getElementById('exam-detail-modal').classList.add('active');
  }

  function handleStartExam() {
    if (!currentDetailExam) return;
    document.getElementById('exam-detail-modal').classList.remove('active');
    ExamRunner.start(currentDetailExam, true);
  }

  function renderError(msg) {
    return `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${msg}</p></div>`;
  }

  function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${pad(m)}:${pad(s)}`;
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function init() {
    document.getElementById('detail-start-btn').addEventListener('click', handleStartExam);
    document.getElementById('close-detail-modal').addEventListener('click', () => {
      document.getElementById('exam-detail-modal').classList.remove('active');
    });
    document.getElementById('exam-detail-modal').addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('active');
    });
  }

  return { load, init };
})();
