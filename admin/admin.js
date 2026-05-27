document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth(['admin']);
  if (!user) return;

  // Load default module or welcome message
  loadModule('attendance');
});

function loadModule(moduleName) {
  const content = document.getElementById('adminContent');
  switch(moduleName) {
    case 'attendance':
      renderAttendanceUI('adminContent');
      break;
    case 'qr':
      initQRScanner('adminContent');
      break;
    case 'notices':
      renderNoticeManager('adminContent');
      break;
    case 'homework':
      renderHomeworkManager('adminContent');
      break;
    case 'marks':
      renderMarksEntry('adminContent');
      break;
    case 'routine':
      renderRoutineManager('adminContent');
      break;
    case 'results':
      renderResultGenerator('adminContent');
      break;
    case 'admission':
      renderAdmissionForm('adminContent');
      break;
    case 'finance':
      renderFinanceModule('adminContent');
      break;
    case 'students':
      renderStudentManagement('adminContent');
      break;
    case 'teachers':
      renderTeacherManagement('adminContent');
      break;
    case 'leaderboard':
      renderLeaderboard('adminContent');
      break;
    case 'analytics':
      renderAnalyticsDashboard('adminContent');
      break;
    case 'settings':
      renderSettings('adminContent');
      break;
    default:
      content.innerHTML = '<p>মডিউল পাওয়া যায়নি।</p>';
  }
}

// ===================== Module Implementations =====================

// Notice Manager (admin version: create, edit, delete)
async function renderNoticeManager(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h3>নোটিশ ম্যানেজার</h3>
    <div>
      <input type="text" id="noticeTitle" placeholder="শিরোনাম">
      <textarea id="noticeBody" placeholder="বিস্তারিত"></textarea>
      <select id="noticePriority">
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <button id="postNoticeBtn">পোস্ট</button>
    </div>
    <hr>
    <div id="noticeList"></div>
  `;
  document.getElementById('postNoticeBtn').onclick = async () => {
    const title = document.getElementById('noticeTitle').value;
    const body = document.getElementById('noticeBody').value;
    const priority = document.getElementById('noticePriority').value;
    await db.collection('notifications').add({
      title, body, priority,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      type: 'notice',
      createdBy: getCurrentUser().id
    });
    alert('নোটিশ পোস্ট হয়েছে');
    loadNotices('noticeList');
  };
  loadNotices('noticeList');
}

async function loadNotices(containerId) {
  const list = document.getElementById(containerId);
  const snap = await db.collection('notifications')
    .where('type', '==', 'notice')
    .orderBy('timestamp', 'desc')
    .limit(20)
    .get();
  let html = '';
  snap.forEach(doc => {
    const d = doc.data();
    html += `<div class="glass" style="margin:5px; padding:8px;">
      <strong>${d.title}</strong> (${d.priority})<br>
      <small>${d.body}</small><br>
      <button onclick="deleteNotice('${doc.id}')">Delete</button>
    </div>`;
  });
  list.innerHTML = html || '<p>কোনো নোটিশ নেই।</p>';
}

async function deleteNotice(id) {
  await db.collection('notifications').doc(id).delete();
  loadNotices('noticeList');
}

// Homework Manager (assign, view reports)
function renderHomeworkManager(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h3>হোমওয়ার্ক ম্যানেজার</h3>
    <button id="assignHomeworkBtn">নতুন হোমওয়ার্ক দিন</button>
    <button id="viewHomeworkReportsBtn">রিপোর্ট দেখুন</button>
    <div id="homeworkSubContent"></div>
  `;
  document.getElementById('assignHomeworkBtn').onclick = () => {
    document.getElementById('homeworkSubContent').innerHTML = `
      <select id="hwClass"><option value="">ক্লাস বাছাই</option></select>
      <input id="hwSubject" placeholder="Subject">
      <textarea id="hwDetails"></textarea>
      <input type="date" id="hwDue">
      <button id="submitHomeworkAssign">জমা দিন</button>
    `;
    // populate class dropdown
    populateClassDropdown('hwClass');
    document.getElementById('submitHomeworkAssign').onclick = async () => {
      const classId = document.getElementById('hwClass').value;
      const subject = document.getElementById('hwSubject').value;
      const details = document.getElementById('hwDetails').value;
      const dueDate = document.getElementById('hwDue').value;
      await assignHomework(classId, subject, details, dueDate);
      alert('হোমওয়ার্ক দেওয়া হয়েছে');
    };
  };
  document.getElementById('viewHomeworkReportsBtn').onclick = async () => {
    const classId = prompt('ক্লাস আইডি দিন:');
    if (!classId) return;
    const analytics = await getHomeworkAnalytics(classId);
    document.getElementById('homeworkSubContent').innerHTML = `
      <p>Completion: ${100 - analytics.percentage}%</p>
      <p>Missing submissions: ${analytics.missing}</p>
    `;
  };
}

async function populateClassDropdown(elementId) {
  const select = document.getElementById(elementId);
  const classes = await getCachedCollection('classes');
  select.innerHTML = classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

// Marks Entry (for weekly exams)
function renderMarksEntry(containerId) {
  // Implementation calls results-core.js functions, similar to homework but for marks
  document.getElementById(containerId).innerHTML = `
    <h3>মার্কস এন্ট্রি</h3>
    <p>Coming soon (integrate with OCR or manual entry)</p>
  `;
}

// Routine Manager
function renderRoutineManager(containerId) {
  document.getElementById(containerId).innerHTML = `
    <h3>রুটিন ম্যানেজার</h3>
    <p>Drag-and-drop routine builder (simplified – use Google Sheets integration or manual list).</p>
  `;
}

// Result Generator
function renderResultGenerator(containerId) {
  document.getElementById(containerId).innerHTML = `
    <h3>রেজাল্ট জেনারেটর</h3>
    <p>Generate term-wise result from marks.</p>
  `;
}

// Admission Form
function renderAdmissionForm(containerId) {
  document.getElementById(containerId).innerHTML = `
    <h3>অনলাইন ভর্তি ফর্ম</h3>
    <form id="admissionForm">
      <input id="studentName" placeholder="শিক্ষার্থীর নাম" required>
      <input id="fatherName" placeholder="পিতার নাম">
      <input id="classWanted" placeholder="কাঙ্খিত ক্লাস">
      <button type="submit">জমা দিন</button>
    </form>
  `;
  document.getElementById('admissionForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('studentName').value,
      father: document.getElementById('fatherName').value,
      class: document.getElementById('classWanted').value,
      admissionDate: new Date().toISOString(),
      status: 'pending'
    };
    await db.collection('admissions').add(data);
    alert('ভর্তির আবেদন জমা হয়েছে');
    e.target.reset();
  };
}

// Student Management
async function renderStudentManagement(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h3>ছাত্র ব্যবস্থাপনা</h3>
    <button id="addStudentBtn">নতুন ছাত্র যোগ করুন</button>
    <button id="listStudentsBtn">তালিকা দেখুন</button>
    <div id="studentSubContent"></div>
  `;
  document.getElementById('addStudentBtn').onclick = () => {
    document.getElementById('studentSubContent').innerHTML = `
      <input id="newStudentId" placeholder="Student ID">
      <input id="newStudentName" placeholder="Name">
      <input id="newStudentClass" placeholder="Class ID">
      <input type="password" id="newStudentPass" placeholder="Password">
      <button id="createStudentBtn">তৈরি করুন</button>
    `;
    document.getElementById('createStudentBtn').onclick = async () => {
      const id = document.getElementById('newStudentId').value;
      const name = document.getElementById('newStudentName').value;
      const cls = document.getElementById('newStudentClass').value;
      const password = document.getElementById('newStudentPass').value;
      await db.collection('students').doc(id).set({
        name, class: cls, password, activeStatus: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      alert('ছাত্র তৈরি হয়েছে');
    };
  };
  document.getElementById('listStudentsBtn').onclick = async () => {
    const classId = prompt('Class ID:');
    if (!classId) return;
    const students = await getCachedCollection('students', { field: 'class', op: '==', value: classId });
    document.getElementById('studentSubContent').innerHTML = students.map(s => `
      <p>${s.name} (${s.id}) 
        <button onclick="deleteStudent('${s.id}')">Delete</button>
      </p>`).join('');
  };
}

async function deleteStudent(id) {
  await db.collection('students').doc(id).delete();
  alert('Deleted');
  document.getElementById('listStudentsBtn').click(); // refresh
}

// Teacher Management (similar to student)
async function renderTeacherManagement(containerId) {
  document.getElementById(containerId).innerHTML = `
    <h3>শিক্ষক ব্যবস্থাপনা</h3>
    <p>Feature: Add/Remove teachers, assign classes.</p>
  `;
}

// Analytics Dashboard
async function renderAnalyticsDashboard(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h3>অ্যানালিটিক্স</h3>
    <canvas id="attendanceChart" width="400" height="200"></canvas>
    <canvas id="feeChart" width="400" height="200"></canvas>
  `;
  const heatmap = await getAttendanceHeatmap();
  const feeTrend = await getFeeTrends();
  // Render charts
  const ctx1 = document.getElementById('attendanceChart').getContext('2d');
  new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: Object.keys(heatmap),
      datasets: [{ label: 'Attendance', data: Object.values(heatmap) }]
    }
  });
  const ctx2 = document.getElementById('feeChart').getContext('2d');
  new Chart(ctx2, {
    type: 'line',
    data: {
      labels: Object.keys(feeTrend),
      datasets: [{ label: 'Fee Collection', data: Object.values(feeTrend) }]
    }
  });
}

// Settings
function renderSettings(containerId) {
  document.getElementById(containerId).innerHTML = `
    <h3>সেটিংস</h3>
    <button onclick="resetSystem()">System Reset (Danger)</button>
  `;
}

async function resetSystem() {
  if (confirm('Are you sure? This cannot be undone.')) {
    // Delete all collections (be careful!)
    alert('Not implemented in demo.');
  }
}
