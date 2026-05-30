document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth(['secure-admin', 'admin', 'chairman']); // multiple roles allowed
  if (!user) return;

  // Sidebar navigation
  document.querySelectorAll('#superSidebar button').forEach(btn => {
    btn.addEventListener('click', () => loadModule(btn.dataset.module));
  });

  // Load dashboard by default
  loadModule('dashboard');
});

function loadModule(moduleName) {
  const content = document.getElementById('superContent');
  content.innerHTML = ''; // clear
  switch(moduleName) {
    case 'dashboard': renderSuperDashboard(content); break;
    case 'website': renderWebsiteManager(content); break;
    case 'users': renderUserManager(content); break;
    case 'academic': renderAcademicManager(content); break;
    case 'finance': renderFinanceModule(content); break;  // reuse finance module
    case 'settings': renderSiteSettings(content); break;
    case 'system': renderSystemTools(content); break;
    default: content.innerHTML = '<p>মডিউল পাওয়া যায়নি।</p>';
  }
}

// ==================== SUPER DASHBOARD (quick stats) ====================
async function renderSuperDashboard(container) {
  const [studentCount, teacherCount, noticeCount] = await Promise.all([
    db.collection('students').get().then(s => s.size),
    db.collection('teachers').get().then(s => s.size),
    db.collection('notifications').where('type','==','notice').get().then(s => s.size)
  ]);
  container.innerHTML = `
    <h3>সিস্টেম ওভারভিউ</h3>
    <div class="dashboard-grid">
      <div class="glass card">👥 মোট ছাত্র: ${studentCount}</div>
      <div class="glass card">👨‍🏫 মোট শিক্ষক: ${teacherCount}</div>
      <div class="glass card">📢 নোটিশ: ${noticeCount}</div>
    </div>
  `;
}

// ==================== WEBSITE MANAGER ====================
function renderWebsiteManager(container) {
  container.innerHTML = `
    <h3>ওয়েবসাইট কন্টেন্ট ম্যানেজ</h3>
    <div class="tab-buttons">
      <button class="active" data-tab="hero">হিরো সেকশন</button>
      <button data-tab="notices">নোটিশ</button>
      <button data-tab="teachers">শিক্ষক</button>
      <button data-tab="gallery">গ্যালারি</button>
      <button data-tab="videos">ভিডিও</button>
      <button data-tab="stats">পরিসংখ্যান</button>
    </div>
    <div id="websiteTabContent" class="glass" style="margin-top:16px;"></div>
  `;
  // Tab switching
  const tabs = container.querySelectorAll('.tab-buttons button');
  tabs.forEach(btn => btn.addEventListener('click', (e) => {
    tabs.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    loadWebsiteTab(e.target.dataset.tab);
  }));
  loadWebsiteTab('hero'); // default
}

async function loadWebsiteTab(tab) {
  const area = document.getElementById('websiteTabContent');
  switch(tab) {
    case 'hero':
      area.innerHTML = await heroEditorHTML();
      break;
    case 'notices':
      area.innerHTML = await noticesEditorHTML();
      break;
    case 'teachers':
      area.innerHTML = await teachersEditorHTML();
      break;
    case 'gallery':
      area.innerHTML = await galleryEditorHTML();
      break;
    case 'videos':
      area.innerHTML = await videoEditorHTML();
      break;
    case 'stats':
      area.innerHTML = await statsEditorHTML();
      break;
  }
}

// --- Hero Editor ---
async function heroEditorHTML() {
  const doc = await db.collection('settings').doc('hero').get();
  const data = doc.exists ? doc.data() : { heading: 'Master Academic', subheading: 'Quality Coaching' };
  return `
    <h4>হিরো সেকশন সম্পাদনা</h4>
    <input id="heroHeading" value="${data.heading || ''}" placeholder="Heading">
    <input id="heroSubheading" value="${data.subheading || ''}" placeholder="Subheading">
    <button id="saveHero">সংরক্ষণ</button>
    <script>
      document.getElementById('saveHero').onclick = async () => {
        await db.collection('settings').doc('hero').set({
          heading: document.getElementById('heroHeading').value,
          subheading: document.getElementById('heroSubheading').value
        }, { merge: true });
        alert('হিরো আপডেট হয়েছে');
      };
    </script>
  `;
}

// --- Notices Editor ---
async function noticesEditorHTML() {
  const notices = await db.collection('notifications').where('type','==','notice').orderBy('timestamp','desc').get();
  let list = '';
  notices.forEach(doc => {
    const n = doc.data();
    list += `<div class="glass card" style="margin:8px; padding:8px;">
      <strong>${n.title}</strong> (${n.priority || 'normal'})
      <button onclick="deleteNotice('${doc.id}')">Delete</button>
    </div>`;
  });
  return `
    <h4>নোটিশ</h4>
    <div>
      <input id="newNoticeTitle" placeholder="Title">
      <textarea id="newNoticeBody"></textarea>
      <select id="newNoticePriority">
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <button id="addNoticeBtn">Add</button>
    </div>
    <div id="noticeList">${list || 'কোনো নোটিশ নেই'}</div>
    <script>
      document.getElementById('addNoticeBtn').onclick = async () => {
        await db.collection('notifications').add({
          title: document.getElementById('newNoticeTitle').value,
          body: document.getElementById('newNoticeBody').value,
          priority: document.getElementById('newNoticePriority').value,
          type: 'notice',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Added'); loadWebsiteTab('notices');
      };
    </script>
  `;
}

// --- Teachers Editor ---
async function teachersEditorHTML() {
  const teachers = await db.collection('teachers').get();
  let list = '';
  teachers.forEach(doc => {
    const t = doc.data();
    list += `<div class="glass card" style="margin:8px; padding:8px;">
      ${t.name} – ${t.subject}
      <button onclick="deleteTeacher('${doc.id}')">Delete</button>
    </div>`;
  });
  return `
    <h4>শিক্ষক</h4>
    <input id="teacherName" placeholder="Name">
    <input id="teacherSubject" placeholder="Subject">
    <input id="teacherPhoto" placeholder="Photo URL">
    <button id="addTeacherBtn">Add</button>
    <div id="teacherList">${list || 'No teachers'}</div>
    <script>
      document.getElementById('addTeacherBtn').onclick = async () => {
        await db.collection('teachers').add({
          name: document.getElementById('teacherName').value,
          subject: document.getElementById('teacherSubject').value,
          photo: document.getElementById('teacherPhoto').value,
          active: true
        });
        alert('Teacher added'); loadWebsiteTab('teachers');
      };
    </script>
  `;
}

// --- Gallery Editor ---
async function galleryEditorHTML() {
  const images = await db.collection('galleries').get();
  let list = '';
  images.forEach(doc => {
    const img = doc.data();
    list += `<div style="display:inline-block; margin:8px;">
      <img src="${img.url}" width="100"><br>
      <button onclick="deleteImage('${doc.id}')">Delete</button>
    </div>`;
  });
  return `
    <h4>গ্যালারি</h4>
    <input id="imageUrl" placeholder="Image URL">
    <input id="imageCaption" placeholder="Caption">
    <button id="addImageBtn">Add</button>
    <div id="galleryPreview">${list}</div>
    <script>
      document.getElementById('addImageBtn').onclick = async () => {
        await db.collection('galleries').add({
          url: document.getElementById('imageUrl').value,
          caption: document.getElementById('imageCaption').value,
          uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Image added'); loadWebsiteTab('gallery');
      };
    </script>
  `;
}

// --- Video Editor ---
async function videoEditorHTML() {
  const videos = await db.collection('videos').get();
  let list = '';
  videos.forEach(doc => {
    const v = doc.data();
    list += `<div class="glass card" style="margin:8px; padding:8px;">
      ${v.title} <button onclick="deleteVideo('${doc.id}')">Delete</button>
    </div>`;
  });
  return `
    <h4>ভিডিও</h4>
    <input id="videoTitle" placeholder="Title">
    <input id="videoUrl" placeholder="YouTube embed URL">
    <button id="addVideoBtn">Add</button>
    <div>${list}</div>
    <script>
      document.getElementById('addVideoBtn').onclick = async () => {
        await db.collection('videos').add({
          title: document.getElementById('videoTitle').value,
          url: document.getElementById('videoUrl').value
        });
        alert('Video added'); loadWebsiteTab('videos');
      };
    </script>
  `;
}

// --- Stats Editor ---
async function statsEditorHTML() {
  const doc = await db.collection('settings').doc('stats').get();
  const data = doc.exists ? doc.data() : { students: 0, teachers: 0, courses: 0, years: 0 };
  return `
    <h4>হোমপেজ পরিসংখ্যান</h4>
    <label>ছাত্র: <input id="statStudents" type="number" value="${data.students}"></label>
    <label>শিক্ষক: <input id="statTeachers" type="number" value="${data.teachers}"></label>
    <label>কোর্স: <input id="statCourses" type="number" value="${data.courses}"></label>
    <label>অভিজ্ঞতা (বছর): <input id="statYears" type="number" value="${data.years}"></label>
    <button id="saveStatsBtn">সংরক্ষণ</button>
    <script>
      document.getElementById('saveStatsBtn').onclick = async () => {
        await db.collection('settings').doc('stats').set({
          students: +document.getElementById('statStudents').value,
          teachers: +document.getElementById('statTeachers').value,
          courses: +document.getElementById('statCourses').value,
          years: +document.getElementById('statYears').value
        });
        alert('Stats saved');
      };
    </script>
  `;
}

// ==================== USER MANAGER ====================
async function renderUserManager(container) {
  container.innerHTML = `
    <h3>ইউজার ম্যানেজমেন্ট</h3>
    <select id="userRoleSelect">
      <option value="students">ছাত্র</option>
      <option value="teachers">শিক্ষক</option>
      <option value="managers">ম্যানেজার</option>
      <option value="admins">অ্যাডমিন</option>
      <option value="chairman">চেয়ারম্যান</option>
      <option value="secure-admin">সুপার অ্যাডমিন</option>
    </select>
    <button id="listUsersBtn">তালিকা দেখুন</button>
    <button id="addUserBtn">নতুন যোগ করুন</button>
    <div id="userListArea" style="margin-top:16px;"></div>
  `;
  document.getElementById('listUsersBtn').onclick = () => listUsers();
  document.getElementById('addUserBtn').onclick = () => addUserForm();
}

async function listUsers() {
  const role = document.getElementById('userRoleSelect').value;
  const snap = await db.collection(role).get();
  let html = '';
  snap.forEach(doc => {
    const data = doc.data();
    html += `<div class="glass card" style="margin:4px; padding:8px;">
      ${data.name || data.email || doc.id} <button onclick="deleteUser('${role}','${doc.id}')">Delete</button>
    </div>`;
  });
  document.getElementById('userListArea').innerHTML = html || 'কোনো ইউজার নেই';
}

function addUserForm() {
  const role = document.getElementById('userRoleSelect').value;
  document.getElementById('userListArea').innerHTML = `
    <h4>নতুন ${role} যোগ করুন</h4>
    <div id="dynamicUserForm"></div>
  `;
  // Simple form based on role
  const formDiv = document.getElementById('dynamicUserForm');
  if (role === 'students') {
    formDiv.innerHTML = `
      <input id="newId" placeholder="Student ID">
      <input id="newName" placeholder="Name">
      <input id="newClass" placeholder="Class">
      <input type="password" id="newPass" placeholder="Password">
      <button id="createStudentBtn">তৈরি করুন</button>
    `;
    document.getElementById('createStudentBtn').onclick = async () => {
      await db.collection('students').doc(document.getElementById('newId').value).set({
        name: document.getElementById('newName').value,
        class: document.getElementById('newClass').value,
        password: document.getElementById('newPass').value,
        activeStatus: true
      });
      alert('ছাত্র তৈরি হয়েছে'); listUsers();
    };
  } else if (role === 'teachers') {
    formDiv.innerHTML = `
      <input id="newName" placeholder="Name">
      <input id="newSubject" placeholder="Subject">
      <input id="newId" placeholder="Teacher ID">
      <input type="password" id="newPass" placeholder="Password">
      <button id="createTeacherBtn">তৈরি করুন</button>
    `;
    document.getElementById('createTeacherBtn').onclick = async () => {
      await db.collection('teachers').doc(document.getElementById('newId').value).set({
        name: document.getElementById('newName').value,
        subject: document.getElementById('newSubject').value,
        password: document.getElementById('newPass').value
      });
      alert('শিক্ষক তৈরি হয়েছে'); listUsers();
    };
  } else {
    formDiv.innerHTML = `<p>For managers/admins/chairman use Firebase Auth email/password creation.</p>
      <input id="newEmail" placeholder="Email">
      <input type="password" id="newPass" placeholder="Password">
      <button id="createAuthUserBtn">Create</button>
    `;
    document.getElementById('createAuthUserBtn').onclick = async () => {
      const email = document.getElementById('newEmail').value;
      const pass = document.getElementById('newPass').value;
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await db.collection(role).doc(cred.user.uid).set({ email, active: true });
        alert('User created');
      } catch(e) { alert(e.message); }
    };
  }
}

async function deleteUser(collection, id) {
  if (confirm('Sure delete?')) {
    await db.collection(collection).doc(id).delete();
    alert('Deleted');
    listUsers();
  }
}

// ==================== ACADEMIC MANAGER ====================
function renderAcademicManager(container) {
  container.innerHTML = `
    <h3>একাডেমিক ম্যানেজার</h3>
    <div class="dashboard-grid">
      <button onclick="loadAcademicSub('attendance')">📋 উপস্থিতি</button>
      <button onclick="loadAcademicSub('marks')">📊 মার্কস</button>
      <button onclick="loadAcademicSub('homework')">📝 হোমওয়ার্ক</button>
      <button onclick="loadAcademicSub('routine')">🕒 রুটিন</button>
      <button onclick="loadAcademicSub('leaderboard')">🏆 লিডারবোর্ড</button>
      <button onclick="loadAcademicSub('quiz')">❓ কুইজ</button>
    </div>
    <div id="academicSubContent" class="glass" style="margin-top:16px; padding:16px;"></div>
  `;
}

function loadAcademicSub(sub) {
  const area = document.getElementById('academicSubContent');
  switch(sub) {
    case 'attendance': renderAttendanceUI('academicSubContent'); break;
    case 'marks': renderMarksEntry('academicSubContent'); break;
    case 'homework': renderHomeworkManager('academicSubContent'); break;
    case 'routine': renderRoutineManager('academicSubContent'); break;
    case 'leaderboard': renderLeaderboard('academicSubContent'); break;
    case 'quiz': area.innerHTML = '<p>Quiz manager coming soon.</p>'; break;
  }
}

// ==================== SITE SETTINGS ====================
async function renderSiteSettings(container) {
  const doc = await db.collection('settings').doc('site').get();
  const s = doc.exists ? doc.data() : {};
  container.innerHTML = `
    <h3>সাইট সেটিংস</h3>
    <label>ইনস্টিটিউট নাম: <input id="siteName" value="${s.name || ''}"></label>
    <label>ফোন: <input id="sitePhone" value="${s.phone || ''}"></label>
    <label>ইমেইল: <input id="siteEmail" value="${s.email || ''}"></label>
    <label>ঠিকানা: <input id="siteAddress" value="${s.address || ''}"></label>
    <label>ফেসবুক: <input id="siteFacebook" value="${s.facebook || ''}"></label>
    <label>ইউটিউব: <input id="siteYoutube" value="${s.youtube || ''}"></label>
    <label>গুগল ম্যাপ লিংক: <input id="siteMap" value="${s.map || ''}"></label>
    <label>প্রাইমারি রং: <input type="color" id="sitePrimary" value="${s.primary || '#1A73E8'}"></label>
    <label>সেকেন্ডারি রং: <input type="color" id="siteSecondary" value="${s.secondary || '#00BFA5'}"></label>
    <button id="saveSettings">সংরক্ষণ</button>
    <script>
      document.getElementById('saveSettings').onclick = async () => {
        await db.collection('settings').doc('site').set({
          name: document.getElementById('siteName').value,
          phone: document.getElementById('sitePhone').value,
          email: document.getElementById('siteEmail').value,
          address: document.getElementById('siteAddress').value,
          facebook: document.getElementById('siteFacebook').value,
          youtube: document.getElementById('siteYoutube').value,
          map: document.getElementById('siteMap').value,
          primary: document.getElementById('sitePrimary').value,
          secondary: document.getElementById('siteSecondary').value
        });
        alert('Settings saved');
      };
    </script>
  `;
}

// ==================== SYSTEM TOOLS ====================
function renderSystemTools(container) {
  container.innerHTML = `
    <h3>সিস্টেম টুলস</h3>
    <button onclick="updateLeaderboardNow()">🏆 এখনই লিডারবোর্ড আপডেট করুন</button>
    <button onclick="triggerOCR()">🔍 OCR রেজাল্ট আপলোড</button>
    <button onclick="viewLogs()">📋 লগ দেখুন</button>
  `;
}

async function updateLeaderboardNow() {
  await updateWeeklyLeaderboard();
  alert('লিডারবোর্ড আপডেট হয়েছে');
}

function triggerOCR() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    const classId = prompt('ক্লাস ID:');
    const week = prompt('সপ্তাহ (e.g., Week-1):');
    if (classId && week) {
      await processOCRUpload(file, classId, week);
      alert('OCR সম্পন্ন হয়েছে, লিডারবোর্ড আপডেট হয়েছে');
    }
  };
  input.click();
}

async function viewLogs() {
  const logs = await db.collection('logs').orderBy('timestamp','desc').limit(50).get();
  let html = '';
  logs.forEach(doc => {
    const l = doc.data();
    html += `<p>[${l.timestamp?.toDate().toLocaleString()}] ${l.action} by ${l.user}</p>`;
  });
  document.getElementById('superContent').innerHTML = `<h3>লগ</h3>${html || 'No logs'}`;
}
