async function getAttendanceHeatmap() {
  // Return data for Chart.js
  const attendance = await db.collection('attendance')
    .orderBy('date')
    .get();
  const map = {};
  attendance.forEach(doc => {
    const d = doc.data();
    map[d.date] = (map[d.date] || 0) + 1;
  });
  return map; // dates with counts
}

async function getFeeTrends() {
  const payments = await db.collection('payments').orderBy('month').get();
  const trend = {};
  payments.forEach(doc => {
    const m = doc.data().month;
    trend[m] = (trend[m] || 0) + doc.data().amount;
  });
  return trend;
}
