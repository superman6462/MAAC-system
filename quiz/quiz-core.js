/* ============================================================
   MAAC Quiz Core
   Shared quiz logic used by:
     - super-admin.js   (create quiz, add/edit MCQ questions)
     - portal.html      (student dashboard "Quiz" tab)
     - quiz-attempt.html (standalone shareable quiz link)
   Requires: firebase app + firestore already initialized as `db`.
============================================================ */

/* ---- CREATE ---- */
async function createQuiz({ title, subject, classId, duration, description, coverImage }) {
  const ref = await db.collection('quizzes').add({
    title,
    subject: subject || '',
    class: classId || 'All',
    duration: duration || 30,
    description: description || '',
    coverImage: coverImage || null,
    status: 'active',
    questions: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: (typeof getCurrentUser === 'function' && getCurrentUser()) ? getCurrentUser().id : 'admin'
  });
  return ref.id;
}

/* ---- READ ---- */
async function getQuiz(quizId) {
  const doc = await db.collection('quizzes').doc(quizId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function listQuizzes({ classId, status } = {}) {
  let q = db.collection('quizzes').orderBy('createdAt', 'desc');
  const snap = await q.get();
  let quizzes = [];
  snap.forEach(d => quizzes.push({ id: d.id, ...d.data() }));
  if (classId) quizzes = quizzes.filter(q => q.class === 'All' || q.class === classId);
  if (status) quizzes = quizzes.filter(q => (q.status || 'active') === status);
  return quizzes;
}

/* ---- QUESTIONS ---- */
/*
  Question shape:
  {
    id: string,
    text: string,
    image: string|null,      // optional image URL (diagram/question image)
    options: string[],       // e.g. ["Dhaka","Chittagong","Khulna","Rajshahi"]
    correct: number          // index into options
  }
*/
function makeQuestionId() {
  return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

async function addQuestion(quizId, question) {
  const quiz = await getQuiz(quizId);
  if (!quiz) throw new Error('Quiz not found');
  const questions = quiz.questions || [];
  questions.push({ id: makeQuestionId(), image: null, ...question });
  await db.collection('quizzes').doc(quizId).update({ questions });
  return questions;
}

async function updateQuestion(quizId, questionId, updates) {
  const quiz = await getQuiz(quizId);
  if (!quiz) throw new Error('Quiz not found');
  const questions = (quiz.questions || []).map(q => q.id === questionId ? { ...q, ...updates } : q);
  await db.collection('quizzes').doc(quizId).update({ questions });
  return questions;
}

async function deleteQuestion(quizId, questionId) {
  const quiz = await getQuiz(quizId);
  if (!quiz) throw new Error('Quiz not found');
  const questions = (quiz.questions || []).filter(q => q.id !== questionId);
  await db.collection('quizzes').doc(quizId).update({ questions });
  return questions;
}

async function replaceAllQuestions(quizId, questions) {
  await db.collection('quizzes').doc(quizId).update({ questions });
  return questions;
}

/* ---- OCR / TEXT PARSING → MCQs ----
   Parses raw text (from OCR or pasted text) into MCQ objects.
   Expected loose format per question block, e.g.:

   1. What is the capital of Bangladesh?
   A) Chittagong
   B) Dhaka
   C) Khulna
   D) Rajshahi
   Answer: B

   Tolerant of "1)", "Q1.", "a.", "(a)", "Ans:", "Answer -", etc.
*/
function parseMCQText(raw) {
  if (!raw || !raw.trim()) return [];
  const text = raw.replace(/\r\n/g, '\n').trim();

  // Split into blocks by lines that start a new question number
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length);
  const qStartRe = /^(?:Q?\.?\s*)?(\d+)[\.\)]\s*(.*)$/i;
  const optRe = /^\(?([A-Da-d])\)?[\.\)]\s*(.*)$/;
  const ansRe = /^(?:Answer|Ans)[\s:\-]*\(?([A-Da-d1-4])\)?/i;

  const blocks = [];
  let current = null;

  lines.forEach(line => {
    const qMatch = line.match(qStartRe);
    const optMatch = line.match(optRe);
    const ansMatch = line.match(ansRe);

    if (qMatch && !optMatch) {
      if (current) blocks.push(current);
      current = { text: qMatch[2].trim(), options: [], answerLetter: null };
    } else if (optMatch && current) {
      current.options.push(optMatch[2].trim());
    } else if (ansMatch && current) {
      current.answerLetter = ansMatch[1].toUpperCase();
    } else if (current) {
      // continuation of question text (no option/answer prefix matched)
      if (current.options.length === 0) {
        current.text += ' ' + line;
      }
    }
  });
  if (current) blocks.push(current);

  const letterToIndex = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };

  return blocks
    .filter(b => b.text && b.options.length >= 2)
    .map(b => ({
      id: makeQuestionId(),
      text: b.text,
      image: null,
      options: b.options,
      correct: b.answerLetter ? (letterToIndex[b.answerLetter] ?? 0) : 0
    }));
}

/* ---- OCR (image → text) ----
   Uses Tesseract.js (loaded via CDN in the admin page).
   Returns raw recognized text; caller then runs parseMCQText().
*/
async function ocrImageToText(fileOrUrl, onProgress) {
  if (typeof Tesseract === 'undefined') {
    throw new Error('OCR engine not loaded. Include Tesseract.js on this page.');
  }
  const result = await Tesseract.recognize(fileOrUrl, 'eng', {
    logger: m => { if (onProgress && m.status === 'recognizing text') onProgress(Math.round(m.progress * 100)); }
  });
  return result.data.text;
}

/* ---- SHAREABLE LINK ---- */
function getQuizShareUrl(quizId) {
  // quiz-attempt.html is a standalone page that takes ?quiz=<id> and asks the
  // student to identify themselves (ID + name) before starting, no login required.
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return `${base}quiz-attempt.html?quiz=${quizId}`;
}

/* ---- SUBMIT & GRADE ---- */
async function hasAttempted(quizId, studentId) {
  const snap = await db.collection('quiz_results')
    .where('quizId', '==', quizId)
    .where('studentId', '==', studentId)
    .limit(1).get();
  return !snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
}

async function submitQuizAnswer(quizId, studentId, studentName, answers) {
  const quiz = await getQuiz(quizId);
  if (!quiz) throw new Error('Quiz not found');
  if (quiz.status !== 'active') throw new Error('This quiz is closed.');

  const already = await hasAttempted(quizId, studentId);
  if (already) return already; // prevent duplicate submissions, return prior result

  let score = 0;
  const questions = quiz.questions || [];
  questions.forEach((q, idx) => {
    if (q.correct === answers[idx]) score++;
  });

  const resultRef = await db.collection('quiz_results').add({
    quizId,
    quizTitle: quiz.title,
    studentId,
    studentName: studentName || '',
    answers,
    score,
    total: questions.length,
    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  return { id: resultRef.id, quizId, studentId, studentName, answers, score, total: questions.length };
}

async function getQuizResults(quizId) {
  const snap = await db.collection('quiz_results').where('quizId', '==', quizId).get();
  const results = [];
  snap.forEach(d => results.push({ id: d.id, ...d.data() }));
  results.sort((a, b) => b.score - a.score);
  return results;
}

async function getStudentQuizResults(studentId) {
  const snap = await db.collection('quiz_results').where('studentId', '==', studentId).get();
  const results = [];
  snap.forEach(d => results.push({ id: d.id, ...d.data() }));
  return results;
}
