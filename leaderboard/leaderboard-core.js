async function updateWeeklyLeaderboard() {
  // Get all students, compute weekly exam scores, attendance, homework
  // This would be complex, so we provide a simplified version.
  // In reality, you'd sum points from 'weekly_results', attendance, homework_reports.
  const students = await db.collection('students').get();
  const leaderboard = [];
  for (const doc of students.docs) {
    const s = doc.data();
    const weeklyScore = await getWeeklyExamScore(doc.id); // from results collection
    const attendancePoints = await getAttendancePoints(doc.id); // percentage
    const homeworkPoints = await getHomeworkPoints(doc.id); // completion %
    const total = weeklyScore * 0.6 + attendancePoints * 0.2 + homeworkPoints * 0.2;
    leaderboard.push({ studentId: doc.id, name: s.name, class: s.class, total, weeklyScore, attendancePoints, homeworkPoints });
  }
  leaderboard.sort((a, b) => b.total - a.total);
  // Save to leaderboards collection
  const batch = db.batch();
  leaderboard.forEach((entry, idx) => {
    const ref = db.collection('leaderboards').doc(`weekly_${new Date().toISOString().slice(0,10)}_${entry.studentId}`);
    batch.set(ref, { ...entry, rank: idx+1, type: 'weekly', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  });
  await batch.commit();
}

async function getLeaderboard(type = 'weekly') {
  const snap = await db.collection('leaderboards')
    .where('type', '==', type)
    .orderBy('rank')
    .get();
  const list = [];
  snap.forEach(doc => list.push(doc.data()));
  return list;
}
