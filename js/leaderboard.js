/* ============================================================
   leaderboard.js — Leaderboard with exam dropdown
   ============================================================ */

const Leaderboard = (() => {
  let allExams = [];

  async function loadExamList() {
    const select = document.getElementById('leaderboard-exam-select');

    const { data: exams, error } = await db
      .from('exams')
      .select('id, name, is_live, ends_at, starts_at')
      .not('starts_at', 'is', null)
      .order('created_at', { ascending: false });

    if (error || !exams) return;

    allExams = exams;
    select.innerHTML = '<option value="">— Select Exam —</option>';

    exams.forEach(exam => {
      const isLiveNow = exam.is_live && exam.ends_at && new Date(exam.ends_at) > new Date();
      const label = `${exam.name} ${isLiveNow ? '🔴 Live' : ''}`;
      const opt = document.createElement('option');
      opt.value = exam.id;
      opt.textContent = label;
      select.appendChild(opt);
    });

    // Default: first live exam, else first exam
    const liveExam = exams.find(e => e.is_live && new Date(e.ends_at) > new Date());
    const defaultExam = liveExam || exams[0];
    if (defaultExam) {
      select.value = defaultExam.id;
      await loadLeaderboard(defaultExam.id);
    }
  }

  async function loadLeaderboard(examId) {
    if (!examId) return;
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = '<div class="loading-center"><div class="spinner"></div><span>Loading leaderboard…</span></div>';

    const user = Auth.getUser();
    const exam = allExams.find(e => e.id === examId);
    if (exam) {
      document.getElementById('lb-exam-title').textContent = exam.name;
    }

    try {
      const { data, error } = await db.rpc('get_leaderboard', {
        p_exam_id: examId,
        p_user_id: user ? user.id : null
      });

      if (error) throw error;

      const top10 = data.top10 || [];
      const userRank = data.user_rank || { found: false };

      if (!top10.length) {
        container.innerHTML = `<div class="empty-state">
          <div class="empty-icon">🏆</div>
          <h3>No entries yet</h3>
          <p>Be the first to take this exam and top the leaderboard!</p>
        </div>`;
        return;
      }

      let html = '';
      top10.forEach((entry, idx) => {
        const rankNum = entry.rank || (idx + 1);
        const isCurrentUser = user && entry.user_id === user.id;
        const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
        const rowClass = rankNum <= 3 ? `top-${rankNum}` : '';
        const currentClass = isCurrentUser ? 'current-user' : '';

        html += `<div class="lb-row ${rowClass} ${currentClass}">
          <div class="lb-rank ${rankNum > 3 ? 'lb-rank-default' : ''}">
            ${medals[rankNum] || rankNum}
          </div>
          <div class="lb-name">
            ${escHtml(entry.name)}
            ${isCurrentUser ? '<span class="lb-current-label"> (You)</span>' : ''}
          </div>
          <div class="lb-score">${Number(entry.score).toFixed(1)}</div>
        </div>`;
      });

      // Show current user's rank if not in top 10
      if (userRank.found && !top10.some(e => user && e.user_id === user.id)) {
        html += `<div class="lb-divider">• • •</div>
        <div class="lb-row current-user">
          <div class="lb-rank lb-rank-default">${userRank.rank}</div>
          <div class="lb-name">${escHtml(userRank.name)} <span class="lb-current-label">(You)</span></div>
          <div class="lb-score">${Number(userRank.score).toFixed(1)}</div>
        </div>`;
      } else if (user && !userRank.found) {
        html += `<div class="lb-divider" style="margin-top:12px;padding:12px;background:rgba(99,102,241,0.05);border-radius:var(--radius-sm);border:1px dashed rgba(99,102,241,0.2)">
          <i class="fas fa-info-circle" style="color:var(--accent)"></i> 
          You haven't attempted this exam yet. Take it to appear on the leaderboard!
        </div>`;
      }

      container.innerHTML = html;
    } catch (err) {
      console.error('Leaderboard error:', err);
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading leaderboard</h3></div>';
    }
  }

  function init() {
    document.getElementById('leaderboard-exam-select').addEventListener('change', function () {
      if (this.value) loadLeaderboard(this.value);
    });
  }

  function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { loadExamList, loadLeaderboard, init };
})();
