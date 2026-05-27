async function markAttendance(classId, studentIds, date = new Date().toISOString().slice(0,10)) {
  const batch = db.batch();
  const refs = studentIds.map(id => db.collection('attendance').doc(`${classId}_${id}_${date}`));
  refs.forEach((ref, i) => {
    batch.set(ref, {
      classId,
      studentId: studentIds[i],
      date,
      status: 'present',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      method: 'manual'
    });
  });
  await batch.commit();
}

// Offline attendance queue
async function offlineMarkAttendance(classId, studentId, date) {
  await addToQueue({
    collection: 'attendance',
    id: `${classId}_${studentId}_${date}`,
    type: 'set',
    data: { classId, studentId, date, status: 'present', timestamp: Date.now(), method: 'offline' }
  });
}
