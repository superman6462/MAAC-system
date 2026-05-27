async function enterMarks(classId, studentId, subject, examType, marks) {
  await db.collection('results').doc(`${classId}_${studentId}_${examType}_${subject}`).set({
    classId, studentId, subject, examType, marks,
    enteredBy: getCurrentUser().id,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function getStudentResult(studentId, examType) {
  const student = await getCachedDoc('students', studentId);
  if (!student) return null;
  const snap = await db.collection('results')
    .where('studentId', '==', studentId)
    .where('examType', '==', examType)
    .get();
  const subjects = {};
  let total = 0, count = 0;
  snap.forEach(doc => {
    const r = doc.data();
    subjects[r.subject] = r.marks;
    total += r.marks;
    count++;
  });
  return { name: student.name, subjects, total, average: count ? total/count : 0 };
}

// Generate term result (simplified)
async function generateClassResult(classId, examType) {
  const students = await getCachedCollection('students', { field: 'class', op: '==', value: classId });
  const results = [];
  for (const s of students) {
    const res = await getStudentResult(s.id, examType);
    if (res) results.push(res);
  }
  results.sort((a,b) => b.average - a.average);
  return results;
}
