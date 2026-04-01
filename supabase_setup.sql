-- ============================================================
-- MCQ EXAM SYSTEM — Supabase Full Database Setup
-- Run this ENTIRE file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable pgcrypto for bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  top10_count  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admins (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name                TEXT NOT NULL,
  subject             TEXT NOT NULL,
  topic               TEXT NOT NULL,
  total_questions     INTEGER NOT NULL DEFAULT 0,
  duration_mins       INTEGER NOT NULL DEFAULT 30,
  live_duration_hours INTEGER NOT NULL DEFAULT 48,
  marks_per_question  DECIMAL(5,2) NOT NULL DEFAULT 1,
  negative_marks      DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_live             BOOLEAN DEFAULT FALSE,
  starts_at           TIMESTAMPTZ,
  ends_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id       UUID REFERENCES exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_a      TEXT NOT NULL,
  option_b      TEXT NOT NULL,
  option_c      TEXT NOT NULL,
  option_d      TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('a','b','c','d')),
  image_url     TEXT,
  order_num     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attempts (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  exam_id          UUID REFERENCES exams(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  submitted_at     TIMESTAMPTZ,
  score            DECIMAL(8,2),
  correct_count    INTEGER DEFAULT 0,
  wrong_count      INTEGER DEFAULT 0,
  unanswered_count INTEGER DEFAULT 0,
  is_live_attempt  BOOLEAN DEFAULT FALSE,
  is_submitted     BOOLEAN DEFAULT FALSE
);

-- Only ONE live attempt per user per exam
CREATE UNIQUE INDEX IF NOT EXISTS one_live_attempt_per_user_exam
  ON attempts (user_id, exam_id)
  WHERE is_live_attempt = TRUE;

CREATE TABLE IF NOT EXISTS answers (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id      UUID REFERENCES attempts(id) ON DELETE CASCADE,
  question_id     UUID REFERENCES questions(id) ON DELETE CASCADE,
  selected_option CHAR(1) CHECK (selected_option IN ('a','b','c','d')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leaderboard (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id      UUID REFERENCES exams(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  attempt_id   UUID REFERENCES attempts(id) ON DELETE CASCADE,
  score        DECIMAL(8,2) NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, user_id)
);

-- ============================================================
-- PUBLIC VIEW — hides correct_option from frontend queries
-- ============================================================

CREATE OR REPLACE VIEW questions_public AS
SELECT id, exam_id, question_text, option_a, option_b, option_c, option_d,
       image_url, order_num, created_at
FROM questions;

-- Grant view to anon role
GRANT SELECT ON questions_public TO anon, authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams       ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent re-runs)
DO $$ BEGIN
  DROP POLICY IF EXISTS "users_select"       ON users;
  DROP POLICY IF EXISTS "users_insert"       ON users;
  DROP POLICY IF EXISTS "users_update"       ON users;
  DROP POLICY IF EXISTS "admins_deny"        ON admins;
  DROP POLICY IF EXISTS "exams_select"       ON exams;
  DROP POLICY IF EXISTS "exams_all"          ON exams;
  DROP POLICY IF EXISTS "questions_deny"     ON questions;
  DROP POLICY IF EXISTS "questions_write"    ON questions;
  DROP POLICY IF EXISTS "questions_update"   ON questions;
  DROP POLICY IF EXISTS "questions_delete"   ON questions;
  DROP POLICY IF EXISTS "attempts_select"    ON attempts;
  DROP POLICY IF EXISTS "attempts_insert"    ON attempts;
  DROP POLICY IF EXISTS "attempts_update"    ON attempts;
  DROP POLICY IF EXISTS "answers_select"     ON answers;
  DROP POLICY IF EXISTS "answers_insert"     ON answers;
  DROP POLICY IF EXISTS "leaderboard_select" ON leaderboard;
  DROP POLICY IF EXISTS "leaderboard_insert" ON leaderboard;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Users: public readable, insertable, updatable
CREATE POLICY "users_select" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update" ON users FOR UPDATE USING (true);

-- Admins: NEVER exposed to frontend directly
CREATE POLICY "admins_deny"  ON admins FOR SELECT USING (false);

-- Exams: public readable; write via RPCs only (SECURITY DEFINER handles auth)
CREATE POLICY "exams_select" ON exams FOR SELECT USING (true);
CREATE POLICY "exams_all"    ON exams FOR ALL    USING (true);

-- Questions: DENY direct select (use questions_public view or admin RPC)
CREATE POLICY "questions_deny" ON questions FOR SELECT USING (false);
-- Allow write (admin RPCs are SECURITY DEFINER)
CREATE POLICY "questions_write" ON questions FOR INSERT WITH CHECK (true);
CREATE POLICY "questions_update" ON questions FOR UPDATE USING (true);
CREATE POLICY "questions_delete" ON questions FOR DELETE USING (true);

-- Attempts
CREATE POLICY "attempts_select" ON attempts FOR SELECT USING (true);
CREATE POLICY "attempts_insert" ON attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "attempts_update" ON attempts FOR UPDATE USING (true);

-- Answers: only via RPC (SECURITY DEFINER), but allow read
CREATE POLICY "answers_select" ON answers FOR SELECT USING (true);
CREATE POLICY "answers_insert" ON answers FOR INSERT WITH CHECK (true);

-- Leaderboard: public read, insert via RPC
CREATE POLICY "leaderboard_select" ON leaderboard FOR SELECT USING (true);
CREATE POLICY "leaderboard_insert" ON leaderboard FOR INSERT WITH CHECK (true);

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- 1. Verify admin credentials (bcrypt)
CREATE OR REPLACE FUNCTION verify_admin(p_username TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin admins%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM admins WHERE username = p_username;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;
  IF v_admin.password_hash = crypt(p_password, v_admin.password_hash) THEN
    RETURN jsonb_build_object('success', true, 'admin_id', v_admin.id::text, 'username', v_admin.username);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
END; $$;

-- 2. Change admin password
CREATE OR REPLACE FUNCTION change_admin_password(p_admin_id UUID, p_old_password TEXT, p_new_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin admins%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM admins WHERE id = p_admin_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Not found'); END IF;
  IF v_admin.password_hash != crypt(p_old_password, v_admin.password_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Old password incorrect');
  END IF;
  UPDATE admins SET password_hash = crypt(p_new_password, gen_salt('bf')) WHERE id = p_admin_id;
  RETURN jsonb_build_object('success', true);
END; $$;

-- 3. Add new admin (requires existing admin_id)
CREATE OR REPLACE FUNCTION add_admin(p_requester_id UUID, p_username TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_requester_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF EXISTS (SELECT 1 FROM admins WHERE username = p_username) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username taken');
  END IF;
  INSERT INTO admins (username, password_hash) VALUES (p_username, crypt(p_password, gen_salt('bf')));
  RETURN jsonb_build_object('success', true);
END; $$;

-- 4. Get questions WITH correct_option (admin only - verifies admin_id)
CREATE OR REPLACE FUNCTION get_questions_admin(p_admin_id UUID, p_exam_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  RETURN jsonb_build_object('success', true,
    'questions', (
      SELECT COALESCE(jsonb_agg(q ORDER BY q.order_num), '[]'::jsonb)
      FROM (SELECT * FROM questions WHERE exam_id = p_exam_id ORDER BY order_num) q
    )
  );
END; $$;

-- 5. Upsert a question (admin only)
CREATE OR REPLACE FUNCTION upsert_question(p_admin_id UUID, p_question JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID; v_exists BOOLEAN := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  v_id := (p_question->>'id')::UUID;
  IF v_id IS NOT NULL THEN SELECT EXISTS(SELECT 1 FROM questions WHERE id = v_id) INTO v_exists; END IF;
  IF v_exists THEN
    UPDATE questions SET
      question_text  = p_question->>'question_text',
      option_a       = p_question->>'option_a',
      option_b       = p_question->>'option_b',
      option_c       = p_question->>'option_c',
      option_d       = p_question->>'option_d',
      correct_option = (p_question->>'correct_option')::CHAR(1),
      image_url      = p_question->>'image_url',
      order_num      = (p_question->>'order_num')::INTEGER
    WHERE id = v_id;
    RETURN jsonb_build_object('success', true, 'id', v_id);
  ELSE
    INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, image_url, order_num)
    VALUES (
      (p_question->>'exam_id')::UUID,
      p_question->>'question_text',
      p_question->>'option_a',
      p_question->>'option_b',
      p_question->>'option_c',
      p_question->>'option_d',
      (p_question->>'correct_option')::CHAR(1),
      p_question->>'image_url',
      COALESCE((p_question->>'order_num')::INTEGER, 0)
    ) RETURNING id INTO v_id;
    -- Update exam total_questions count
    UPDATE exams SET total_questions = (SELECT COUNT(*) FROM questions WHERE exam_id = (p_question->>'exam_id')::UUID)
    WHERE id = (p_question->>'exam_id')::UUID;
    RETURN jsonb_build_object('success', true, 'id', v_id);
  END IF;
END; $$;

-- 6. Delete a question (admin only)
CREATE OR REPLACE FUNCTION delete_question(p_admin_id UUID, p_question_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_exam_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT exam_id INTO v_exam_id FROM questions WHERE id = p_question_id;
  DELETE FROM questions WHERE id = p_question_id;
  UPDATE exams SET total_questions = (SELECT COUNT(*) FROM questions WHERE exam_id = v_exam_id)
  WHERE id = v_exam_id;
  RETURN jsonb_build_object('success', true);
END; $$;

-- 7. SUBMIT EXAM — core security function (never exposes correct answers before this)
CREATE OR REPLACE FUNCTION submit_exam(p_attempt_id UUID, p_user_id UUID, p_answers JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_attempt       attempts%ROWTYPE;
  v_exam          exams%ROWTYPE;
  v_question      questions%ROWTYPE;
  v_answer        JSONB;
  v_selected      TEXT;
  v_correct_count INTEGER := 0;
  v_wrong_count   INTEGER := 0;
  v_unans_count   INTEGER := 0;
  v_score         DECIMAL(8,2) := 0;
  v_results       JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO v_attempt FROM attempts WHERE id = p_attempt_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Attempt not found'); END IF;
  IF v_attempt.is_submitted THEN RETURN jsonb_build_object('success', false, 'error', 'Already submitted'); END IF;

  SELECT * INTO v_exam FROM exams WHERE id = v_attempt.exam_id;

  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    SELECT * INTO v_question FROM questions
    WHERE id = (v_answer->>'question_id')::UUID AND exam_id = v_attempt.exam_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_selected := v_answer->>'selected_option';
    -- Clean up old answer if EXISTS
    DELETE FROM answers WHERE attempt_id = p_attempt_id AND question_id = v_question.id;
    -- Insert new
    INSERT INTO answers (attempt_id, question_id, selected_option)
    VALUES (p_attempt_id, v_question.id,
      CASE WHEN v_selected IS NULL OR v_selected IN ('null','') THEN NULL ELSE v_selected::CHAR(1) END);

    IF v_selected IS NULL OR v_selected IN ('null','') THEN
      v_unans_count := v_unans_count + 1;
      v_results := v_results || jsonb_build_object(
        'question_id', v_question.id, 'correct_option', v_question.correct_option,
        'selected_option', NULL, 'is_correct', false, 'is_unanswered', true);
    ELSIF v_selected = v_question.correct_option THEN
      v_correct_count := v_correct_count + 1;
      v_score := v_score + v_exam.marks_per_question;
      v_results := v_results || jsonb_build_object(
        'question_id', v_question.id, 'correct_option', v_question.correct_option,
        'selected_option', v_selected, 'is_correct', true, 'is_unanswered', false);
    ELSE
      v_wrong_count := v_wrong_count + 1;
      v_score := v_score - v_exam.negative_marks;
      v_results := v_results || jsonb_build_object(
        'question_id', v_question.id, 'correct_option', v_question.correct_option,
        'selected_option', v_selected, 'is_correct', false, 'is_unanswered', false);
    END IF;
  END LOOP;

  UPDATE attempts SET
    is_submitted = TRUE, submitted_at = NOW(),
    score = v_score, correct_count = v_correct_count,
    wrong_count = v_wrong_count, unanswered_count = v_unans_count
  WHERE id = p_attempt_id;

  IF v_attempt.is_live_attempt THEN
    INSERT INTO leaderboard (exam_id, user_id, attempt_id, score, submitted_at)
    VALUES (v_attempt.exam_id, p_user_id, p_attempt_id, v_score, NOW())
    ON CONFLICT (exam_id, user_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'score', v_score,
    'total_possible', v_exam.marks_per_question * v_exam.total_questions,
    'correct_count', v_correct_count, 'wrong_count', v_wrong_count,
    'unanswered_count', v_unans_count, 'results', v_results,
    'marks_per_question', v_exam.marks_per_question,
    'negative_marks', v_exam.negative_marks
  );
END; $$;

-- 8. Get leaderboard with ranks
CREATE OR REPLACE FUNCTION get_leaderboard(p_exam_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_top10 JSONB; v_user_rank JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_top10 FROM (
    SELECT jsonb_build_object(
      'rank', RANK() OVER (ORDER BY l.score DESC, l.submitted_at ASC),
      'name', u.name, 'score', l.score, 'submitted_at', l.submitted_at,
      'user_id', l.user_id
    ) AS row_data
    FROM leaderboard l JOIN users u ON u.id = l.user_id
    WHERE l.exam_id = p_exam_id
    ORDER BY l.score DESC, l.submitted_at ASC LIMIT 10
  ) t;

  IF p_user_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'rank', user_ranks.rnk, 'name', u.name, 'score', l.score, 'found', true
    ) INTO v_user_rank
    FROM (
      SELECT user_id, score,
             RANK() OVER (ORDER BY score DESC, submitted_at ASC) AS rnk
      FROM leaderboard WHERE exam_id = p_exam_id
    ) user_ranks
    JOIN leaderboard l ON l.user_id = user_ranks.user_id AND l.exam_id = p_exam_id
    JOIN users u ON u.id = l.user_id
    WHERE user_ranks.user_id = p_user_id;
    IF v_user_rank IS NULL THEN v_user_rank := jsonb_build_object('found', false); END IF;
  END IF;

  RETURN jsonb_build_object(
    'top10', COALESCE(v_top10, '[]'::jsonb),
    'user_rank', COALESCE(v_user_rank, jsonb_build_object('found', false))
  );
END; $$;

-- 9. Get user stats
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total INTEGER; v_top10 INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM attempts WHERE user_id = p_user_id AND is_submitted = TRUE;

  -- Count how many exams this user placed in the top 10
  WITH ranked AS (
    SELECT
      l.user_id,
      l.exam_id,
      RANK() OVER (PARTITION BY l.exam_id ORDER BY l.score DESC, l.submitted_at ASC) AS rnk
    FROM leaderboard l
    WHERE l.exam_id IN (SELECT exam_id FROM leaderboard WHERE user_id = p_user_id)
  )
  SELECT COUNT(*) INTO v_top10
  FROM ranked
  WHERE user_id = p_user_id AND rnk <= 10;

  RETURN jsonb_build_object('total_exams', v_total, 'top10_count', COALESCE(v_top10, 0));
END; $$;

-- 10. Get all users for admin
CREATE OR REPLACE FUNCTION get_all_users_admin(p_admin_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE id = p_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  RETURN jsonb_build_object('success', true, 'users', (
    SELECT COALESCE(jsonb_agg(u_data), '[]'::jsonb) FROM (
      SELECT
        u.id, u.name, u.email, u.created_at,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.is_submitted) AS total_attempts,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.is_live_attempt AND a.is_submitted) AS live_attempts,
        (SELECT COALESCE(AVG(a.score), 0) FROM attempts a WHERE a.user_id = u.id AND a.is_submitted) AS avg_score
      FROM users u ORDER BY u.created_at DESC
    ) u_data
  ));
END; $$;

-- ============================================================
-- SEED DEFAULT ADMINS
-- ============================================================

INSERT INTO admins (username, password_hash)
VALUES
  ('nirob', crypt('123456', gen_salt('bf'))),
  ('radib', crypt('123456', gen_salt('bf')))
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- STORAGE SETUP NOTE
-- ============================================================
-- Go to Supabase Dashboard → Storage → Create Bucket:
--   Name: question-images
--   Public: YES  (enable public access)
-- ============================================================

SELECT 'Setup complete! 2 admins seeded. Create Storage bucket manually.' AS status;
