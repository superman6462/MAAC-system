async function getClassRoutine(classId, day) {
  const snap = await db.collection('routines')
    .where('classId', '==', classId)
    .where('day', '==', day)
    .get();
  const periods = [];
  snap.forEach(doc => periods.push(doc.data()));
  periods.sort((a,b) => a.time.localeCompare(b.time));
  return periods;
}
