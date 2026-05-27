async function getAttendanceHeatmap() {
  const snap = await db.collection('attendance').get();
  const counts = {};
  snap.forEach(doc => {
    const d = doc.data().date;
    if (d) counts[d] = (counts[d] || 0) + 1;
  });
  // Return last 7 days
  const dates = Object.keys(counts).sort().slice(-7);
  const result = {};
  dates.forEach(d => result[d] = counts[d]);
  return result;
}

async function getFeeTrends() {
  const snap = await db.collection('payments').orderBy('month').get();
  const trend = {};
  snap.forEach(doc => {
    const m = doc.data().month;
    if (m) trend[m] = (trend[m] || 0) + doc.data().amount;
  });
  return trend;
}
