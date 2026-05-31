// ========== ATTENDANCE MODULE for Super Admin ==========

// This file relies on the global 'db' and 'auth' from super-admin.html

function showAttendanceTab(container) {
  container.innerHTML = `
    <h3>📋 Attendance Management</h3>
    <div style="display:flex; gap:12px; flex-wrap:wrap;">
      <button class="action" id="btnMark">✏️ Mark Attendance</button>
      <button class="action" id="btnQR">📷 QR Scanner</button>
      <button class="action" id="btnGrid">📊 Grid View</button>
      <button class="action" id="btnHolidays">🏖️ Holidays</button>
    </div>
    <div id="attSubContent" style="margin-top:16px;"></div>
  `;
  document.getElementById('btnMark').onclick = () => showMarkAttendance();
  document.getElementById('btnQR').onclick = () => showQRScanner();
  document.getElementById('btnGrid').onclick = () => showGrid();
  document.getElementById('btnHolidays').onclick = () => showHolidays();
  showMarkAttendance(); // default
}

// ==================== MARK ATTENDANCE ====================
async function showMarkAttendance() {
  const sub = document.getElementById('attSubContent');
  const classes = await db.collection('classes').get();
  const classOptions = classes.docs.map(doc => `<option value="${doc.id}">${doc.data().name || doc.id}</option>`).join('');
  sub.innerHTML = `
    <h4>Mark Attendance</h4>
    <select id="attClassSelect">${classOptions}</select>
    <input type="date" id="attDate" value="${new Date().toISOString().slice(0,10)}">
    <button class="action" id="loadStudentsBtn">Load Students</button>
    <div id="studentChecklist" style="margin-top:16px;"></div>
    <button class="action" id="submitAttendanceBtn" style="display:none;">Submit Attendance</button>
    <div id="attMsg"></div>
  `;
  document.getElementById('loadStudentsBtn').onclick = loadStudentsForAttendance;
}

async function loadStudentsForAttendance() {
  const classId = document.getElementById('attClassSelect').value;
  const date = document.getElementById('attDate').value;
  const students = await db.collection('students').where('class', '==', classId).get();
  let html = '<h5>Students</h5>';
  students.forEach(doc => {
    const s = doc.data();
    html += `<label style="display:block; margin:4px 0;">
      <input type="checkbox" value="${doc.id}" checked> ${s.name} (${doc.id})
    </label>`;
  });
  if (students.empty) html += '<p>No students found in this class.</p>';
  document.getElementById('studentChecklist').innerHTML = html;
  document.getElementById('submitAttendanceBtn').style.display = 'inline-block';
  document.getElementById('submitAttendanceBtn').onclick = submitAttendance;
}

async function submitAttendance() {
  const classId = document.getElementById('attClassSelect').value;
  const date = document.getElementById('attDate').value;
  const checkboxes = document.querySelectorAll('#studentChecklist input[type="checkbox"]');
  const presentIds = [];
  const allStudentIds = [];
  checkboxes.forEach(cb => {
    allStudentIds.push(cb.value);
    if (cb.checked) presentIds.push(cb.value);
  });
  const batch = db.batch();
  allStudentIds.forEach(id => {
    const ref = db.collection('attendance').doc(`${classId}_${id}_${date}`);
    const status = presentIds.includes(id) ? 'present' : 'absent';
    batch.set(ref, {
      classId, studentId: id, date, status,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      markedBy: auth.currentUser ? auth.currentUser.email : 'super-admin'
    });
  });
  await batch.commit();
  document.getElementById('attMsg').innerHTML = '<span style="color:lightgreen;">✅ Attendance saved!</span>';
}

// ==================== QR SCANNER ====================
function showQRScanner() {
  const sub = document.getElementById('attSubContent');
  sub.innerHTML = `
    <h4>QR Scanner (Student Attendance)</h4>
    <div id="qr-reader" style="width:300px;"></div>
    <div id="qrResult"></div>
    <button class="action" id="stopQRBtn">Stop Scanner</button>
  `;
  const html5QrCode = new Html5Qrcode("qr-reader");
  const config = { fps: 10, qrbox: 250 };
  let scanning = true;

  async function onScanSuccess(decodedText) {
    if (!scanning) return;
    const parts = decodedText.split(':');
    if (parts.length < 2) {
      document.getElementById('qrResult').innerText = 'Invalid QR';
      return;
    }
    const studentId = parts[0];
    const classId = parts[1];
    const date = new Date().toISOString().slice(0,10);
    try {
      await db.collection('attendance').doc(`${classId}_${studentId}_${date}`).set({
        classId, studentId, date, status: 'present',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        method: 'qr'
      }, { merge: true });
      document.getElementById('qrResult').innerHTML = `<span style="color:lightgreen;">✅ ${parts[2] || studentId} present</span>`;
      // Beep sound
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      document.getElementById('qrResult').innerHTML = `<span style="color:orange;">⚠️ ${e.message}</span>`;
    }
  }

  html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess);
  document.getElementById('stopQRBtn').onclick = () => {
    scanning = false;
    html5QrCode.stop();
  };
}

// ==================== GRID VIEW ====================
async function showGrid() {
  const sub = document.getElementById('attSubContent');
  const classes = await db.collection('classes').get();
  const classOptions = classes.docs.map(doc => `<option value="${doc.id}">${doc.data().name || doc.id}</option>`).join('');
  sub.innerHTML = `
    <h4>Attendance Grid</h4>
    <select id="gridClass">${classOptions}</select>
    <input type="date" id="gridStart" value="${new Date().toISOString().slice(0,10)}">
    <input type="date" id="gridEnd" value="${new Date().toISOString().slice(0,10)}">
    <button class="action" id="loadGridBtn">Load</button>
    <div id="gridTable" style="overflow-x:auto; margin-top:16px;"></div>
    <button class="action" id="exportCSVBtn" style="display:none;">📥 Export CSV</button>
  `;
  document.getElementById('loadGridBtn').onclick = loadGrid;
}

async function loadGrid() {
  const classId = document.getElementById('gridClass').value;
  const start = document.getElementById('gridStart').value;
  const end = document.getElementById('gridEnd').value;
  const studentsSnap = await db.collection('students').where('class', '==', classId).get();
  const students = [];
  studentsSnap.forEach(doc => students.push({ id: doc.id, name: doc.data().name }));
  const dates = [];
  let d = new Date(start);
  const endDate = new Date(end);
  while (d <= endDate) {
    dates.push(d.toISOString().slice(0,10));
    d.setDate(d.getDate() + 1);
  }
  const attMap = {};
  const attSnap = await db.collection('attendance')
    .where('classId', '==', classId)
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get();
  attSnap.forEach(doc => {
    const a = doc.data();
    attMap[a.studentId + '_' + a.date] = a.status;
  });

  let html = '<table border="1" style="border-collapse:collapse; background:rgba(255,255,255,0.9); color:#000;">';
  html += '<tr><th>Student</th>';
  dates.forEach(date => html += `<th>${date.slice(5)}</th>`);
  html += '<th>Absent Count</th></tr>';
  students.forEach(s => {
    let row = `<tr><td>${s.name}</td>`;
    let absent = 0;
    dates.forEach(date => {
      const status = attMap[s.id + '_' + date] || '-';
      if (status === 'absent') absent++;
      row += `<td style="text-align:center; ${status==='present'?'background:#a5d6a7':status==='absent'?'background:#ef9a9a':''}">${status === 'present' ? 'P' : status === 'absent' ? 'A' : '-'}</td>`;
    });
    row += `<td>${absent}</td></tr>`;
    html += row;
  });
  html += '</table>';
  document.getElementById('gridTable').innerHTML = html;
  document.getElementById('exportCSVBtn').style.display = 'inline-block';
  document.getElementById('exportCSVBtn').onclick = () => exportGridCSV(students, dates, attMap);
}

function exportGridCSV(students, dates, attMap) {
  let csv = 'Student,' + dates.join(',') + ',Absent Count\n';
  students.forEach(s => {
    let row = [s.name];
    let absent = 0;
    dates.forEach(date => {
      const status = attMap[s.id + '_' + date] || '';
      row.push(status === 'present' ? 'P' : status === 'absent' ? 'A' : '');
      if (status === 'absent') absent++;
    });
    row.push(absent);
    csv += row.join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'attendance.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== HOLIDAYS ====================
async function showHolidays() {
  const sub = document.getElementById('attSubContent');
  const holidaysSnap = await db.collection('holidays').orderBy('date').get();
  let list = '';
  holidaysSnap.forEach(doc => {
    const h = doc.data();
    list += `<div class="card">${h.date} - ${h.name} <button class="action" onclick="deleteHoliday('${doc.id}')">❌</button></div>`;
  });
  sub.innerHTML = `
    <h4>🏖️ Holidays</h4>
    <input type="date" id="holidayDate">
    <input id="holidayName" placeholder="Holiday Name">
    <button class="action" onclick="addHoliday()">Add</button>
    <div style="margin-top:12px;">${list || 'No holidays'}</div>
  `;
}

async function addHoliday() {
  const date = document.getElementById('holidayDate').value;
  const name = document.getElementById('holidayName').value;
  if (!date || !name) return alert('Fill both fields');
  await db.collection('holidays').add({ date, name });
  showHolidays();
}

async function deleteHoliday(id) {
  await db.collection('holidays').doc(id).delete();
  showHolidays();
}
