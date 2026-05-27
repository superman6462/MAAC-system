async function createQuiz(classId, questions, title) {
  await db.collection('quizzes').add({
    classId, title, questions,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: getCurrentUser().id
  });
}

async function getQuiz(quizId) {
  const doc = await db.collection('quizzes').doc(quizId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function submitQuizAnswer(quizId, studentId, answers) {
  const quiz = await getQuiz(quizId);
  let score = 0;
  quiz.questions.forEach((q, idx) => {
    if (q.correct === answers[idx]) score++;
  });
  await db.collection('quiz_results').add({
    quizId, studentId, score, total: quiz.questions.length,
    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return score;
}
