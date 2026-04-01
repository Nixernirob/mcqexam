/* ============================================================
   results.js — Result page renderer
   Correct answers revealed ONLY here (from RPC response)
   ============================================================ */

const Results = (() => {

  function show({ exam, questions, resultData }) {
    const section = document.getElementById('results-section');
    section.classList.add('active');
    document.getElementById('app').style.display = 'none';

    // Score summary
    document.getElementById('results-exam-name').textContent = exam.name;
    document.getElementById('results-score').textContent = Number(resultData.score).toFixed(1);
    document.getElementById('results-out-of').textContent =
      `out of ${Number(resultData.total_possible).toFixed(1)}`;
    document.getElementById('results-correct').textContent = resultData.correct_count;
    document.getElementById('results-wrong').textContent = resultData.wrong_count;
    document.getElementById('results-unanswered').textContent = resultData.unanswered_count;

    // Build a map: question_id → result
    const resultMap = {};
    (resultData.results || []).forEach(r => {
      resultMap[r.question_id] = r;
    });

    // Render each question with correct/wrong highlighting
    const container = document.getElementById('results-questions-container');
    container.innerHTML = '';

    const letters = { a: 'A', b: 'B', c: 'C', d: 'D' };

    questions.forEach((q, idx) => {
      const result = resultMap[q.id];
      const correctOpt = result ? result.correct_option : null;
      const selectedOpt = result ? result.selected_option : null;
      const isCorrect = result ? result.is_correct : false;
      const isUnanswered = result ? result.is_unanswered : true;

      let statusBadge = '';
      if (isUnanswered) {
        statusBadge = '<span style="font-size:0.75rem;padding:3px 10px;border-radius:20px;background:rgba(100,116,139,0.2);color:var(--text-muted)">Unanswered</span>';
      } else if (isCorrect) {
        statusBadge = '<span style="font-size:0.75rem;padding:3px 10px;border-radius:20px;background:var(--success-bg);color:var(--success)"><i class="fas fa-check"></i> Correct</span>';
      } else {
        statusBadge = '<span style="font-size:0.75rem;padding:3px 10px;border-radius:20px;background:var(--danger-bg);color:var(--danger)"><i class="fas fa-times"></i> Wrong</span>';
      }

      let imageHtml = '';
      if (q.image_url) {
        imageHtml = `<img class="question-image" src="${q.image_url}" alt="Question image" loading="lazy"/>`;
      }

      const card = document.createElement('div');
      card.className = 'question-card';
      // Color-code card border
      if (isCorrect) card.style.borderLeft = '3px solid var(--success)';
      else if (!isUnanswered) card.style.borderLeft = '3px solid var(--danger)';
      else card.style.borderLeft = '3px solid var(--text-muted)';

      card.innerHTML = `
        <div class="question-number" style="display:flex;justify-content:space-between;align-items:center">
          <span>Question ${idx + 1}</span>
          ${statusBadge}
        </div>
        <div class="question-text">${q.question_text}</div>
        ${imageHtml}
        <div class="options-list">
          ${['a','b','c','d'].map(opt => {
            const optText = q[`option_${opt}`];
            let cls = 'option-item';
            let extraStyle = '';

            if (opt === correctOpt) {
              cls += ' correct-answer';
            } else if (opt === selectedOpt && selectedOpt !== correctOpt) {
              cls += ' wrong-answer';
            }

            const icon = opt === correctOpt
              ? '<i class="fas fa-check" style="margin-left:auto;color:var(--success)"></i>'
              : (opt === selectedOpt && selectedOpt !== correctOpt
                ? '<i class="fas fa-times" style="margin-left:auto;color:var(--danger)"></i>'
                : '');

            return `<div class="${cls}">
              <div class="option-letter">${letters[opt]}</div>
              <div class="option-text">${optText}</div>
              ${icon}
            </div>`;
          }).join('')}
        </div>`;

      container.appendChild(card);
    });

    // Render math in results
    if (typeof renderMathInElement === 'function') {
      try {
        renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$',  display: false }
          ],
          throwOnError: false
        });
      } catch {}
    }
  }

  function hide() {
    document.getElementById('results-section').classList.remove('active');
    document.getElementById('app').style.display = '';
  }

  function init() {
    document.getElementById('results-back-btn').addEventListener('click', () => {
      hide();
      // Refresh live exams list (to update "Already Taken" status)
      LiveExam.load();
      PastExam.invalidateCache();
    });
  }

  return { show, hide, init };
})();
