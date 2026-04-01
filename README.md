# MCQ Exam System — Setup & Deployment Guide

## ✅ Files Built (All Complete)

```
d:\Mcqexam\
├── index.html           ← User-facing SPA
├── adminpanel.html      ← Admin panel (go to /adminpanel.html)
├── supabase_setup.sql   ← Run this in Supabase SQL Editor ⬅️ REQUIRED FIRST
├── css/
│   ├── main.css
│   └── admin.css
└── js/
    ├── config.js
    ├── app.js
    ├── auth.js
    ├── router.js
    ├── liveExam.js
    ├── pastExam.js
    ├── leaderboard.js
    ├── profile.js
    ├── examRunner.js
    ├── results.js
    └── admin/
        ├── adminApp.js
        ├── adminAuth.js
        ├── examManager.js
        ├── questionBuilder.js
        └── userViewer.js
```

---

## 🗄️ STEP 1 — Run SQL Setup (REQUIRED)

1. Go to: https://supabase.com/dashboard/project/rilgmbjpdgndfwdjodos/sql/new
2. Open the file `d:\Mcqexam\supabase_setup.sql`
3. Copy ALL its contents and paste into the SQL Editor
4. Click **Run**
5. You should see: `Setup complete! 2 admins seeded.`

---

## 📦 STEP 2 — Create Storage Bucket (REQUIRED for image uploads)

1. Go to: https://supabase.com/dashboard/project/rilgmbjpdgndfwdjodos/storage/buckets
2. Click **New Bucket**
3. Name: `question-images`
4. Toggle **Public bucket** → ON
5. Click **Save**

---

## 🖥️ STEP 3 — Run Locally

```powershell
cd d:\Mcqexam
npx serve . -p 3000
```

Then open:
- **User App**: http://localhost:3000/index.html
- **Admin Panel**: http://localhost:3000/adminpanel.html

---

## 🔐 Admin Credentials

| Username | Password |
|----------|----------|
| nirob    | 123456   |
| radib    | 123456   |

---

## 🚀 STEP 4 — Deploy to Vercel

1. Push your `d:\Mcqexam` folder to a GitHub repository
2. Go to https://vercel.com → New Project → Import from GitHub
3. Select the repo
4. Framework Preset: **Other**
5. Root Directory: `/` (or wherever index.html is)
6. Click **Deploy**

No build step needed — it's pure static HTML/CSS/JS!

---

## 📋 Workflow: Creating Your First Exam

1. Login to Admin panel (`/adminpanel.html`) with `nirob / 123456`
2. Click **Create Exam** → fill in exam details → click **Create Exam & Add Questions**
3. In Question Builder: click **Add Question**
4. Fill question text, 4 options, select correct answer → **Save**
5. Repeat for all questions
6. Go to **Manage Exams** → click **Make Live** on your exam
7. Users can now see and take the exam at `/index.html`

---

## 🧠 Security Architecture

- ✅ `correct_option` is **never** in frontend API calls during exam
- ✅ Questions fetched from `questions_public` VIEW (correct_option excluded)
- ✅ RLS policy denies direct SELECT on `questions` table for anon users
- ✅ Correct answers only returned by `submit_exam()` RPC (runs as SECURITY DEFINER)
- ✅ Admin passwords stored as bcrypt hashes (pgcrypto)
- ✅ One live attempt per user enforced by partial unique DB index
- ✅ Leaderboard: only first live attempt counts (INSERT ... ON CONFLICT DO NOTHING)
