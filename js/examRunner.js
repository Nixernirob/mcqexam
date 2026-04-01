/* ============================================================
   examRunner.js — Timer + MCQ engine + auto-submit
   SECURITY: Fetches questions WITHOUT correct_option (questions_public view)
   Correct answers only come back AFTER submit via RPC
   ============================================================ */

const ExamRunner = (() => {
  let currentExam = null;
  let currentAttempt = null;
  let questions = [];
  let userAnswers = {}; // { question_id: 'a'|'b'|'c'|'d'|null }
  let timerInterval = null;
  let timeLeft = 0;
  let isLiveAttempt = false;
  let isSubmitting = false;
  const DRAFT_KEY_PREFIX = 'mcq_draft_';

  async function start(exam, isLive) {
    const user = Auth.getUser();
    if (!user) {
      Toast.show('Please log in first', 'error');
      return;
    }

    currentExam = exam;
    isLiveAttempt = isLive;
    userAnswers = {};
    isSubmitting = false;

    // Create attempt record in Supabase
    try {
      const attemptPayload = {
        user_id: user.id,
        exam_id: exam.id,
        is_live_attempt: isLive,
        started_at: new Date().toISOString()
      };

      const { data: attempt, error: attemptErr } = await db
        .from('attempts')
        .insert(attemptPayload)
        .select('id')
        .single();

      if (attemptErr) {
        if (attemptErr.code === '23505') {
          // Unique violation — already attempted this live exam
          Toast.show('You have already taken this live exam.', 'error');
          return;
        }
        throw attemptErr;
      }

      currentAttempt = attempt;

      // Fetch questions WITHOUT correct_option (via questions_public view)
      const { data: qs, error: qErr } = await db
        .from('questions_public')
        .select('*')
        .eq('exam_id', exam.id)
        .order('order_num', { ascending: true });

      if (qErr) throw qErr;
      if (!qs || !qs.length) {
        Toast.show('This exam has no questions yet.', 'error');
        // Delete the attempt we just created
        await db.from('attempts').delete().eq('id', attempt.id);
        return;
      }

      questions = qs;
      // Initialize all answers as null
      questions.forEach(q => { userAnswers[q.id] = null; });

      // Restore draft if exists (browser crash safety)
      restoreDraft(attempt.id);

      // Show exam runner
      document.getElementById('exam-runner').classList.add('active');
      document.getElementById('app').style.display = 'none';

      // Render
      renderRunner();

      // Start timer (in seconds)
      timeLeft = exam.duration_mins * 60;
      startTimer();

    } catch (err) {
      console.error('Start exam error:', err);
      Toast.show('Could not start exam. Please try again.', 'error');
    }
  }

  function renderRunner() {
    document.getElementById('runner-exam-title').textContent = currentExam.name;
    renderQuestions();
    updateProgressBar();
    updateAnswerSummary();

    document.getElementById('runner-submit-btn').onclick = () => confirmSubmit();
  }

  function renderQuestions() {
    const container = document.getElementById('runner-questions-container');
    container.innerHTML = '';

    questions.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'question-card';
      card.id = 'qcard-' + q.id;

      let imageHtml = '';
      if (q.image_url) {
        imageHtml = `<img class="question-image" src="${escHtml(q.image_url)}" alt="Question image" loading="lazy"/>`;
      }

      card.innerHTML = `
        <div class="question-number">Question ${idx + 1} of ${questions.length}</div>
        <div class="question-text">${renderText(q.question_text)}</div>
        ${imageHtml}
        <div class="options-list" id="options-${q.id}">
          ${renderOption(q, 'a', idx)}
          ${renderOption(q, 'b', idx)}
          ${renderOption(q, 'c', idx)}
          ${renderOption(q, 'd', idx)}
        </div>`;

      container.appendChild(card);
    });

    // Attach option click handlers
    questions.forEach(q => {
      ['a','b','c','d'].forEach(opt => {
        const el = document.getElementById(`opt-${q.id}-${opt}`);
        if (el) {
          el.addEventListener('click', () => selectOption(q.id, opt));
        }
      });
    });

    // Restore visual state of saved answers
    questions.forEach(q => {
      if (userAnswers[q.id]) {
        highlightOption(q.id, userAnswers[q.id]);
      }
    });

    // Render math
    renderMath(container);
  }

  function renderOption(q, opt, qIdx) {
    const letters = { a: 'A', b: 'B', c: 'C', d: 'D' };
    const text = q[`option_${opt}`];
    return `<div class="option-item" id="opt-${q.id}-${opt}" data-qid="${q.id}" data-opt="${opt}">
      <div class="option-letter">${letters[opt]}</div>
      <div class="option-text">${renderText(text)}</div>
    </div>`;
  }

  function selectOption(questionId, opt) {
    if (isSubmitting) return;
    userAnswers[questionId] = opt;
    highlightOption(questionId, opt);
    updateProgressBar();
    updateAnswerSummary();
    saveDraft();
  }

  function highlightOption(questionId, selectedOpt) {
    ['a','b','c','d'].forEach(o => {
      const el = document.getElementById(`opt-${questionId}-${o}`);
      if (el) el.classList.toggle('selected', o === selectedOpt);
    });
  }

  function updateProgressBar() {
    const answered = Object.values(userAnswers).filter(v => v !== null).length;
    const total = questions.length;
    const pct = total ? (answered / total * 100) : 0;
    const fill = document.getElementById('runner-progress-fill');
    const text = document.getElementById('runner-progress-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = `${answered}/${total}`;
  }

  function updateAnswerSummary() {
    const answered = Object.values(userAnswers).filter(v => v !== null).length;
    const unanswered = questions.length - answered;
    document.getElementById('summary-answered').textContent = `${answered} Answered`;
    document.getElementById('summary-unanswered').textContent = `${unanswered} Skipped`;
  }

  function startTimer() {
    const timerEl = document.getElementById('runner-timer');
    const timerText = document.getElementById('runner-timer-text');

    const tick = () => {
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timerText.textContent = '00:00';
        autoSubmit();
        return;
      }
      const m = Math.floor(timeLeft / 60);
      const s = timeLeft % 60;
      timerText.textContent = `${pad(m)}:${pad(s)}`;

      // Urgent warning for last 2 minutes
      if (timeLeft <= 120) {
        timerEl.classList.add('urgent');
      }
      timeLeft--;
    };

    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function confirmSubmit() {
    const answered = Object.values(userAnswers).filter(v => v !== null).length;
    const unanswered = questions.length - answered;

    if (unanswered > 0) {
      const ok = confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`);
      if (!ok) return;
    }
    submitExam();
  }

  async function autoSubmit() {
    Toast.show('Time is up! Submitting your exam…', 'info');
    await submitExam();
  }

  async function submitExam() {
    if (isSubmitting) return;
    isSubmitting = true;

    clearInterval(timerInterval);

    const user = Auth.getUser();
    const submitBtn = document.getElementById('runner-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';
    }

    // Build answers array
    const answersArr = questions.map(q => ({
      question_id: q.id,
      selected_option: userAnswers[q.id] || null
    }));

    try {
      const { data, error } = await db.rpc('submit_exam', {
        p_attempt_id: currentAttempt.id,
        p_user_id: user.id,
        p_answers: answersArr
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      // Clear draft
      clearDraft(currentAttempt.id);

      // Show results
      Results.show({
        exam: currentExam,
        questions,
        resultData: data
      });

      hideRunner();

    } catch (err) {
      console.error('Submit error:', err);
      Toast.show('Submission failed: ' + (err.message || 'Unknown error'), 'error');
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Exam';
      }
    }
  }

  function hideRunner() {
    document.getElementById('exam-runner').classList.remove('active');
    document.getElementById('app').style.display = '';
  }

  // Draft save/restore (localStorage backup for crash recovery)
  function saveDraft(attemptId) {
    const id = attemptId || (currentAttempt && currentAttempt.id);
    if (!id) return;
    try {
      localStorage.setItem(DRAFT_KEY_PREFIX + id, JSON.stringify(userAnswers));
    } catch {}
  }

  function restoreDraft(attemptId) {
    try {
      const raw = localStorage.getItem(DRAFT_KEY_PREFIX + attemptId);
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(userAnswers, saved);
      }
    } catch {}
  }

  function clearDraft(attemptId) {
    try { localStorage.removeItem(DRAFT_KEY_PREFIX + attemptId); } catch {}
  }

  // Text renderer: handles $math$ KaTeX inline + HTML
  function renderText(text) {
    if (!text) return '';
    // Escape HTML first, then render math markers
    // We allow basic HTML in the text (sup, sub, br)
    return text;
  }

  function renderMath(container) {
    if (typeof renderMathInElement === 'function') {
      try {
        renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      } catch (e) { /* ignore katex errors */ }
    }
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  return { start };
})();
