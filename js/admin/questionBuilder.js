/* ============================================================
   questionBuilder.js — CRUD for questions + image upload
   ============================================================ */

const QuestionBuilder = (() => {
  let selectedExamId = null;
  let selectedExamName = null;
  let editingQuestionId = null;
  let uploadedImageUrl = null;

  async function selectExam(examId, examName) {
    selectedExamId = examId;
    selectedExamName = examName;

    // Switch to questions tab
    AdminApp.navigateTo('questions');

    // Select in dropdown
    const sel = document.getElementById('q-exam-select');
    sel.value = examId;

    document.getElementById('question-builder-area').style.display = 'block';
    await loadQuestions();
  }

  async function loadQuestions() {
    if (!selectedExamId) return;
    const admin = AdminAuth.getSession();
    if (!admin) return;

    const container = document.getElementById('question-list');
    container.innerHTML = '<div class="loading-center"><div class="spinner"></div><span>Loading…</span></div>';
    hideForm();

    const { data, error } = await db.rpc('get_questions_admin', {
      p_admin_id: admin.admin_id,
      p_exam_id: selectedExamId
    });

    if (error || !data.success) {
      container.innerHTML = '<p style="color:var(--danger)">Failed to load questions</p>';
      return;
    }

    const questions = data.questions || [];
    document.getElementById('q-count-badge').textContent = questions.length;

    if (!questions.length) {
      container.innerHTML = '<div style="color:var(--text-muted);padding:16px 0;font-size:0.875rem">No questions yet. Click "Add Question" to start.</div>';
      return;
    }

    const letters = { a: 'A', b: 'B', c: 'C', d: 'D' };
    container.innerHTML = '';

    questions.forEach((q, idx) => {
      const item = document.createElement('div');
      item.className = 'q-item';
      item.innerHTML = `
        <div class="q-num">${idx + 1}</div>
        <div class="q-item-content">
          <div class="q-item-text">${shortText(q.question_text, 120)}</div>
          <div class="q-item-meta">
            ${q.image_url ? '<i class="fas fa-image" style="color:var(--accent-light)"></i> Has image &nbsp;·&nbsp; ' : ''}
            Correct: <span class="q-item-correct">${letters[q.correct_option]} — ${shortText(q[`option_${q.correct_option}`], 50)}</span>
          </div>
        </div>
        <div class="q-item-actions">
          <button class="btn btn-ghost btn-sm" onclick="QuestionBuilder.editQuestion('${q.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" onclick="QuestionBuilder.deleteQuestion('${q.id}')"><i class="fas fa-trash"></i></button>
        </div>`;
      container.appendChild(item);
    });
  }

  function showAddForm() {
    editingQuestionId = null;
    uploadedImageUrl = null;
    resetForm();
    document.getElementById('q-form-title').innerHTML = '<i class="fas fa-plus"></i> New Question';
    document.getElementById('edit-question-id').value = '';
    // Auto order_num = number of existing questions
    const count = parseInt(document.getElementById('q-count-badge').textContent || '0');
    document.getElementById('q-order').value = count;
    document.getElementById('question-form-area').style.display = 'block';
    document.getElementById('question-form-area').scrollIntoView({ behavior: 'smooth' });
  }

  async function editQuestion(questionId) {
    const admin = AdminAuth.getSession();
    const { data } = await db.rpc('get_questions_admin', {
      p_admin_id: admin.admin_id,
      p_exam_id: selectedExamId
    });
    const question = (data.questions || []).find(q => q.id === questionId);
    if (!question) { Toast.show('Question not found', 'error'); return; }

    editingQuestionId = questionId;
    uploadedImageUrl = question.image_url || null;

    document.getElementById('q-form-title').innerHTML = '<i class="fas fa-edit"></i> Edit Question';
    document.getElementById('edit-question-id').value = questionId;
    document.getElementById('q-question-text').value = question.question_text;
    document.getElementById('opt-a').value = question.option_a;
    document.getElementById('opt-b').value = question.option_b;
    document.getElementById('opt-c').value = question.option_c;
    document.getElementById('opt-d').value = question.option_d;
    document.getElementById('q-order').value = question.order_num;
    document.getElementById('q-image-url').value = question.image_url || '';

    // Set correct answer radio
    const radio = document.querySelector(`input[name="correct-opt"][value="${question.correct_option}"]`);
    if (radio) radio.checked = true;

    // Show image preview
    if (question.image_url) {
      const preview = document.getElementById('q-image-preview');
      preview.src = question.image_url;
      preview.style.display = 'block';
      document.getElementById('remove-image-btn').style.display = 'inline-flex';
    }

    document.getElementById('question-form-area').style.display = 'block';
    document.getElementById('question-form-area').scrollIntoView({ behavior: 'smooth' });
  }

  async function saveQuestion() {
    const admin = AdminAuth.getSession();
    if (!admin) return;

    const questionText = document.getElementById('q-question-text').value.trim();
    const optA = document.getElementById('opt-a').value.trim();
    const optB = document.getElementById('opt-b').value.trim();
    const optC = document.getElementById('opt-c').value.trim();
    const optD = document.getElementById('opt-d').value.trim();
    const correctOpt = document.querySelector('input[name="correct-opt"]:checked')?.value;
    const orderNum = parseInt(document.getElementById('q-order').value || '0');
    const existingId = document.getElementById('edit-question-id').value;

    if (!questionText) { Toast.show('Question text is required', 'error'); return; }
    if (!optA || !optB || !optC || !optD) { Toast.show('All 4 options are required', 'error'); return; }
    if (!correctOpt) { Toast.show('Please select the correct answer', 'error'); return; }

    const btn = document.getElementById('save-question-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

    // Handle image upload if a file was selected
    const fileInput = document.getElementById('q-image-file');
    if (fileInput.files[0]) {
      const uploadResult = await uploadImage(fileInput.files[0]);
      if (uploadResult.url) {
        uploadedImageUrl = uploadResult.url;
      } else {
        Toast.show('Image upload failed: ' + uploadResult.error, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Question';
        return;
      }
    }

    const questionData = {
      id: existingId || undefined,
      exam_id: selectedExamId,
      question_text: questionText,
      option_a: optA,
      option_b: optB,
      option_c: optC,
      option_d: optD,
      correct_option: correctOpt,
      image_url: uploadedImageUrl || null,
      order_num: orderNum
    };

    // Remove undefined id for new questions
    if (!questionData.id) delete questionData.id;

    const { data, error } = await db.rpc('upsert_question', {
      p_admin_id: admin.admin_id,
      p_question: questionData
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Question';

    if (error || !data.success) {
      Toast.show('Save failed: ' + (data?.error || error?.message), 'error');
      return;
    }

    Toast.show(existingId ? 'Question updated!' : 'Question added!', 'success');
    hideForm();
    await loadQuestions();
  }

  async function deleteQuestion(questionId) {
    if (!confirm('Delete this question permanently?')) return;
    const admin = AdminAuth.getSession();

    const { data, error } = await db.rpc('delete_question', {
      p_admin_id: admin.admin_id,
      p_question_id: questionId
    });

    if (error || !data.success) { Toast.show('Delete failed', 'error'); return; }
    Toast.show('Question deleted.', 'success');
    await loadQuestions();
  }

  async function uploadImage(file) {
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${selectedExamId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await db.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, file, { upsert: true, contentType: file.type });

      if (uploadErr) return { error: uploadErr.message };

      const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
      return { url: urlData.publicUrl };
    } catch (e) {
      return { error: e.message };
    }
  }

  function resetForm() {
    document.getElementById('q-question-text').value = '';
    document.getElementById('opt-a').value = '';
    document.getElementById('opt-b').value = '';
    document.getElementById('opt-c').value = '';
    document.getElementById('opt-d').value = '';
    document.getElementById('q-order').value = '0';
    document.getElementById('q-image-url').value = '';
    document.getElementById('q-image-file').value = '';
    document.getElementById('q-image-preview').style.display = 'none';
    document.getElementById('remove-image-btn').style.display = 'none';
    document.querySelectorAll('input[name="correct-opt"]').forEach(r => r.checked = false);
    uploadedImageUrl = null;
  }

  function hideForm() {
    document.getElementById('question-form-area').style.display = 'none';
    resetForm();
  }

  function init() {
    // Exam select change
    document.getElementById('q-exam-select').addEventListener('change', async function() {
      if (this.value) {
        selectedExamId = this.value;
        selectedExamName = this.options[this.selectedIndex].text;
        document.getElementById('question-builder-area').style.display = 'block';
        await loadQuestions();
      } else {
        document.getElementById('question-builder-area').style.display = 'none';
      }
    });

    // Add question btn
    document.getElementById('add-question-btn').addEventListener('click', showAddForm);

    // Cancel buttons
    document.getElementById('cancel-question-btn').addEventListener('click', hideForm);
    document.getElementById('cancel-question-btn-2').addEventListener('click', hideForm);

    // Save question
    document.getElementById('save-question-btn').addEventListener('click', saveQuestion);

    // Image file change
    document.getElementById('q-image-file').addEventListener('change', function() {
      if (this.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
          const prev = document.getElementById('q-image-preview');
          prev.src = e.target.result;
          prev.style.display = 'block';
          document.getElementById('remove-image-btn').style.display = 'inline-flex';
        };
        reader.readAsDataURL(this.files[0]);
      }
    });

    // Remove image
    document.getElementById('remove-image-btn').addEventListener('click', () => {
      uploadedImageUrl = null;
      document.getElementById('q-image-url').value = '';
      document.getElementById('q-image-file').value = '';
      document.getElementById('q-image-preview').style.display = 'none';
      document.getElementById('remove-image-btn').style.display = 'none';
    });

    // Math toolbar buttons
    document.querySelectorAll('.math-btn[data-insert]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ta = document.getElementById('q-question-text');
        const insert = btn.dataset.insert;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
        ta.focus();
        ta.setSelectionRange(start + insert.length, start + insert.length);
      });
    });
  }

  function shortText(s, maxLen) {
    if (!s) return '';
    const d = document.createElement('div');
    d.innerHTML = s;
    const text = d.textContent || d.innerText || '';
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  }

  return { init, selectExam, loadQuestions, editQuestion, deleteQuestion };
})();
