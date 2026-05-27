document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth(['teacher']);
  if (!user) return;

  const teacherData = await getCachedDoc('teachers', user.id);
  document.getElementById('teacherInfo').innerHTML = `শিক্ষক: ${teacherData.name} | বিষয়: ${teacherData.subject}`;

  // Load assigned classes
  const classes = teacherData.classes || [];
  const myClassesDiv = document.getElementById('myClasses');
  myClassesDiv.innerHTML = '<h3>আমার ক্লাস:</h3>' + classes.map(c => `<p>${c}</p>`).join('');

  // Student list (from one class for simplicity)
  document.getElementById('studentList').addEventListener('click', async () => {
    const classId = classes[0]; // assume first class
    const students = await getCachedCollection('students', { field: 'class', op: '==', value: classId });
    document.getElementById('dynamicContent').innerHTML = `<h4>ক্লাস ${classId} এর ছাত্র</h4>` + students.map(s => `<p>${s.name} (ID: ${s.id})</p>`).join('');
  });

  // Homework report – mark missing
  document.getElementById('homeworkReport').addEventListener('click', async () => {
    const classId = classes[0];
    const students = await getCachedCollection('students', { field: 'class', op: '==', value: classId });
    let html = `<h4>হোমওয়ার্ক স্ট্যাটাস আপডেট – ক্লাস ${classId}</h4>`;
    students.forEach(s => {
      html += `
        <div>
          <span>${s.name}</span>
          <select id="hw_${s.id}">
            <option value="done">✅ Complete</option>
            <option value="missing">❌ Missing</option>
            <option value="late">⏰ Late</option>
          </select>
        </div>`;
    });
    html += '<button id="submitHomeworkStatus">সাবমিট রিপোর্ট</button>';
    document.getElementById('dynamicContent').innerHTML = html;
    document.getElementById('submitHomeworkStatus').onclick = async () => {
      const updates = [];
      students.forEach(s => {
        const status = document.getElementById(`hw_${s.id}`).value;
        updates.push({
          collection: 'homework_reports',
          id: `${classId}_${s.id}_${new Date().toISOString().slice(0,10)}`,
          type: 'set',
          data: {
            studentId: s.id,
            studentName: s.name,
            class: classId,
            date: new Date().toISOString(),
            status,
            reportedBy: user.id
          }
        });
      });
      await batchWrite(updates);
      alert('হোমওয়ার্ক রিপোর্ট জমা হয়েছে');
    };
  });

  // Weak students – simple rule: homework missing > 2 times this month
  document.getElementById('weakStudents').addEventListener('click', async () => {
    const classId = classes[0];
    const reports = await getCachedCollection('homework_reports', { field: 'class', op: '==', value: classId });
    const countMap = {};
    reports.forEach(r => { if (r.status === 'missing') countMap[r.studentId] = (countMap[r.studentId] || 0) + 1; });
    const weakIds = Object.keys(countMap).filter(id => countMap[id] > 2);
    if (weakIds.length === 0) {
      document.getElementById('dynamicContent').innerHTML = '<p>কোনো দুর্বল শিক্ষার্থী নেই।</p>';
      return;
    }
    const weakStudents = await Promise.all(weakIds.map(id => getCachedDoc('students', id)));
    document.getElementById('dynamicContent').innerHTML = '<h4>দুর্বল শিক্ষার্থী (হোমওয়ার্ক মিস > ২):</h4>' + weakStudents.map(s => `<p>${s.name} – ${s.id}</p>`).join('');
  });

  // Leaderboard
  document.getElementById('leaderboard').addEventListener('click', async () => {
    const leaderboard = await getCachedCollection('leaderboards', { field: 'type', op: '==', value: 'weekly' });
    document.getElementById('dynamicContent').innerHTML = '<h4>সাপ্তাহিক লিডারবোর্ড</h4>' + leaderboard.sort((a,b) => b.score - a.score).slice(0,10).map((l,i) => `<p>${i+1}. ${l.studentName} – ${l.score}</p>`).join('');
  });
});
