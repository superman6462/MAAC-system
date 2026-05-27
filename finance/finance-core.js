// Fee payment & due tracking
async function addFeePayment(studentId, amount, month, method = 'cash') {
  const payment = {
    studentId,
    amount,
    month, // e.g. "2026-06"
    method,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    collectedBy: getCurrentUser().id
  };
  await db.collection('payments').add(payment);
  // Update student's fee status
  await db.collection('students').doc(studentId).update({
    [`fees.${month}`]: 'paid',
    lastPaymentDate: new Date().toISOString()
  });
}

async function getFeeDueList(classId, month) {
  const students = await getCachedCollection('students', { field: 'class', op: '==', value: classId });
  return students.filter(s => !s.fees || s.fees[month] !== 'paid');
}

async function getMonthlyReport(month) {
  const payments = await db.collection('payments')
    .where('month', '==', month)
    .get();
  let total = 0;
  payments.forEach(doc => total += doc.data().amount);
  return { total, count: payments.size };
}
