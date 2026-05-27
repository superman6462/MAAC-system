async function assignHomework(classId, subject, details, dueDate) {
  await db.collection('homework').add({
    classId,
    subject,
    details,
    dueDate,
    assignedAt: firebase.firestore.FieldValue.serverTimestamp(),
    assignedBy: getCurrentUser().id
  });
}

async function getStudentHomework(studentId) {
  const student = await getCachedDoc('students', studentId);
  if (!student || !student.class) return [];
  const homework = await db.collection('homework')
    .where('classId', '==', student.class)
    .orderBy('assignedAt', 'desc')
    .limit(10)
    .get();
  const items = [];
  homework.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
  return items;
}

// Homework analytics
async function getHomeworkAnalytics(classId) {
  const reports = await db.collection('homework_reports')
    .where('class', '==', classId)
    .get();
  let total = 0, missing = 0;
  reports.forEach(doc => {
    total++;
    if (doc.data().status === 'missing') missing++;
  });
  return { total, missing, percentage: total ? Math.round((missing/total)*100) : 0 };
}
