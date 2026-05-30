// ========== FIREBASE INIT (safe duplicate check) ==========
if (!firebase.apps.length) {
  firebase.initializeApp({
    apiKey: "AIzaSyCwRPJ7Rh-0yA_ZNSfsMv2JIFqQVL_YDqI",
    authDomain: "maac-system.firebaseapp.com",
    projectId: "maac-system",
    storageBucket: "maac-system.firebasestorage.app",
    messagingSenderId: "888172288312",
    appId: "1:888172288312:web:29e2e182e2dbd55df209cd"
  });
}
const auth = firebase.auth();
const db = firebase.firestore();

// ========== GLOBAL STATE ==========
let currentUser = null;

// ========== AUTH CHECK ==========
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '/login.html';
    return;
  }
  const doc = await db.collection('secure-admin').doc(user.uid).get();
  if (!doc.exists) {
    alert('Access denied: You are not a Super Admin.');
    auth.signOut();
    window.location.href = '/login.html';
    return;
  }
  currentUser = user;
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('superContent').style.display = 'block';
  document.getElementById('loadingMsg').style.display = 'none';
  loadModule('dashboard'); // default
});

// ========== SIDEBAR NAVIGATION ==========
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#superSidebar button').forEach(btn => {
    btn.addEventListener('click', () => loadModule(btn.dataset.module));
  });
});

// ========== MODULE LOADER ==========
function loadModule(moduleName) {
  const content = document.getElementById('dynamicContent');
  content.innerHTML = '';
  switch(moduleName) {
    case 'dashboard': renderSuperDashboard(content); break;
    case 'website': renderWebsiteManager(content); break;
    case 'users': renderUserManager(content); break;
    case 'academic': renderAcademicManager(content); break;
    case 'finance': renderFinancePanel(content); break;
    case 'settings': renderSiteSettings(content); break;
    case 'system': renderSystemTools(content); break;
    default: content.innerHTML = '<p>Module not found.</p>';
  }
}

// ========== LOGOUT ==========
function logout() {
  auth.signOut().then(() => {
    window.location.href = '/login.html';
  });
}

// ==================== DASHBOARD ====================
async function renderSuperDashboard(container) {
  const [studentCount, teacherCount, noticeCount] = await Promise.all([
    db.collection('students').get().then(s => s.size),
    db.collection('teachers').get().then(s => s.size),
    db.collection('notifications').where('type','==','notice').get().then(s => s.size)
  ]);
  container.innerHTML = `
    <h3>📊 সিস্টেম ওভারভিউ</h3>
    <div class="dashboard-grid">
      <div class="glass card">👥 মোট ছাত্র: <b>${studentCount}</b></div>
      <div class="glass card">👨‍🏫 মোট শিক্ষক: <b>${teacherCount}</b></div>
      <div class="glass card">📢 নোটিশ: <b>${noticeCount}</b></div>
    </div>
  `;
}

// ==================== WEBSITE MANAGER ====================
function renderWebsiteManager(container) {
  container.innerHTML = `
    <h3>🌐 ওয়েবসাইট কন্টেন্ট</h3>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
      <button onclick="loadWebsiteTab('hero')">হিরো</button>
      <button onclick="loadWebsiteTab('notices')">নোটিশ</button>
      <button onclick="loadWebsiteTab('teachers')">শিক্ষক</button>
      <button onclick="loadWebsiteTab('gallery')">গ্যালারি</button>
      <button onclick="loadWebsiteTab('videos')">ভিডিও</button>
      <button onclick="loadWebsiteTab('stats')">পরিসংখ্যান</button>
    </div>
    <div id="websiteTabContent" class="glass" style="padding:16px;"></div>
  `;
  loadWebsiteTab('hero');
}

async function loadWebsiteTab(tab) {
  const area = document.getElementById('websiteTabContent');
  switch(tab) {
    case 'hero': area.innerHTML = heroEditorHTML(); break;
    case 'notices': area.innerHTML = await noticesEditorHTML(); break;
    case 'teachers': area.innerHTML = await teachersEditorHTML(); break;
    case 'gallery': area.innerHTML = await galleryEditorHTML(); break;
    case 'videos': area.innerHTML = await videoEditorHTML(); break;
    case 'stats': area.innerHTML = await statsEditorHTML(); break;
  }
}

function heroEditorHTML() {
  return `
    <h4>হিরো সেকশন</h4>
    <input id="heroHeading" placeholder="Heading">
    <input id="heroSubheading" placeholder="Subheading">
    <button onclick="saveHero()">সংরক্ষণ</button>
  `;
}
async function saveHero() {
  await db.collection('settings').doc('hero').set({
    heading: document.getElementById('heroHeading').value,
    subheading: document.getElementById('heroSubheading').value
  }, { merge: true });
  alert('Saved');
}

async function noticesEditorHTML() {
  const snap = await db.collection('notifications').where('type','==','notice').orderBy('timestamp','desc').get();
  let list = '';
  snap.forEach(doc => {
    const n = doc.data();
    list += `<div class="glass" style="margin:4px; padding:8px;"><b>${n.title}</b> <button onclick="deleteNotice('${doc.id}')">❌</button></div>`;
  });
  return `
    <h4>নোটিশ</h4>
    <input id="noticeTitle" placeholder="Title"><br>
    <textarea id="noticeBody" placeholder="Body"></textarea><br>
    <button onclick="addNotice()">Add</button>
    <div style="margin-top:12px;">${list || 'None'}</div>
  `;
}
async function addNotice() {
  await db.collection('notifications').add({
    title: document.getElementById('noticeTitle').value,
    body: document.getElementById('noticeBody').value,
    type: 'notice',
    priority: 'normal',
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('Notice added');
  loadWebsiteTab('notices');
}
async function deleteNotice(id) {
  await db.collection('notifications').doc(id).delete();
  loadWebsiteTab('notices');
}

async function teachersEditorHTML() {
  const snap = await db.collection('teachers').get();
  let list = '';
  snap.forEach(doc => {
    const t = doc.data();
    list += `<div class="glass" style="margin:4px; padding:8px;">${t.name} - ${t.subject} <button onclick="deleteDoc('teachers','${doc.id}')">❌</button></div>`;
  });
  return `
    <h4>শিক্ষক</h4>
    <input id="tName" placeholder="Name"><input id="tSubject" placeholder="Subject"><input id="tPhoto" placeholder="Photo URL">
    <button onclick="addTeacher()">Add</button>
    <div>${list || 'None'}</div>
  `;
}
async function addTeacher() {
  await db.collection('teachers').add({
    name: document.getElementById('tName').value,
    subject: document.getElementById('tSubject').value,
    photo: document.getElementById('tPhoto').value
  });
  alert('Teacher added');
  loadWebsiteTab('teachers');
}

async function galleryEditorHTML() {
  const snap = await db.collection('galleries').get();
  let list = '';
  snap.forEach(doc => {
    const g = doc.data();
    list += `<img src="${g.url}" width="80" style="margin:4px;"> <button onclick="deleteDoc('galleries','${doc.id}')">❌</button>`;
  });
  return `
    <h4>গ্যালারি</h4>
    <input id="imgUrl" placeholder="Image URL"><input id="imgCap" placeholder="Caption">
    <button onclick="addImage()">Add</button>
    <div>${list || 'None'}</div>
  `;
}
async function addImage() {
  await db.collection('galleries').add({
    url: document.getElementById('imgUrl').value,
    caption: document.getElementById('imgCap').value,
    uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('Image added');
  loadWebsiteTab('gallery');
}

async function videoEditorHTML() {
  const snap = await db.collection('videos').get();
  let list = '';
  snap.forEach(doc => {
    const v = doc.data();
    list += `<div>${v.title} <button onclick="deleteDoc('videos','${doc.id}')">❌</button></div>`;
  });
  return `
    <h4>ভিডিও</h4>
    <input id="vTitle" placeholder="Title"><input id="vUrl" placeholder="YouTube Embed URL">
    <button onclick="addVideo()">Add</button>
    <div>${list || 'None'}</div>
  `;
}
async function addVideo() {
  await db.collection('videos').add({
    title: document.getElementById('vTitle').value,
    url: document.getElementById('vUrl').value
  });
  alert('Video added');
  loadWebsiteTab('videos');
}

async function statsEditorHTML() {
  const doc = await db.collection('settings').doc('stats').get();
  const s = doc.exists ? doc.data() : { students:0, teachers:0, courses:0, years:0 };
  return `
    <h4>হোমপেজ পরিসংখ্যান</h4>
    <label>ছাত্র: <input id="stStudents" type="number" value="${s.students}"></label>
    <label>শিক্ষক: <input id="stTeachers" type="number" value="${s.teachers}"></label>
    <label>কোর্স: <input id="stCourses" type="number" value="${s.courses}"></label>
    <label>অভিজ্ঞতা (বছর): <input id="stYears" type="number" value="${s.years}"></label>
    <button onclick="saveStats()">সংরক্ষণ</button>
  `;
}
async function saveStats() {
  await db.collection('settings').doc('stats').set({
    students: +document.getElementById('stStudents').value,
    teachers: +document.getElementById('stTeachers').value,
    courses: +document.getElementById('stCourses').value,
    years: +document.getElementById('stYears').value
  });
  alert('Stats saved');
}

// ==================== USER MANAGER ====================
async function renderUserManager(container) {
  container.innerHTML = `
    <h3>👥 ইউজার ম্যানেজমেন্ট</h3>
    <select id="roleSelect">
      <option value="students">ছাত্র</option>
      <option value="teachers">শিক্ষক</option>
      <option value="managers">ম্যানেজার</option>
      <option value="admins">অ্যাডমিন</option>
      <option value="chairman">চেয়ারম্যান</option>
    </select>
    <button onclick="listUsers()">তালিকা</button>
    <button onclick="showAddUserForm()">+ নতুন</button>
    <div id="userListArea" style="margin-top:16px;"></div>
  `;
}

async function listUsers() {
  const role = document.getElementById('roleSelect').value;
  const snap = await db.collection(role).get();
  let html = '';
  snap.forEach(doc => {
    const d = doc.data();
    html += `<div class="glass" style="margin:4px; padding:8px;">${d.name || d.email || doc.id} <button onclick="deleteDoc('${role}','${doc.id}')">❌</button></div>`;
  });
  document.getElementById('userListArea').innerHTML = html || '<p>কোনো ইউজার নেই</p>';
}

function showAddUserForm() {
  const role = document.getElementById('roleSelect').value;
  const area = document.getElementById('userListArea');
  if (role === 'students') {
    area.innerHTML = `<input id="sId" placeholder="ID"><input id="sName" placeholder="Name"><input id="sClass" placeholder="Class"><input type="password" id="sPass" placeholder="Password"><button onclick="addStudent()">তৈরি</button>`;
  } else if (role === 'teachers') {
    area.innerHTML = `<input id="tId" placeholder="ID"><input id="tName" placeholder="Name"><input id="tSubject" placeholder="Subject"><input type="password" id="tPass" placeholder="Password"><button onclick="addTeacherUser()">তৈরি</button>`;
  } else {
    area.innerHTML = `<input id="authEmail" placeholder="Email"><input type="password" id="authPass" placeholder="Password"><button onclick="addAuthUser('${role}')">তৈরি</button>`;
  }
}

async function addStudent() {
  await db.collection('students').doc(document.getElementById('sId').value).set({
    name: document.getElementById('sName').value,
    class: document.getElementById('sClass').value,
    password: document.getElementById('sPass').value,
    activeStatus: true
  });
  alert('Student created');
  listUsers();
}

async function addTeacherUser() {
  await db.collection('teachers').doc(document.getElementById('tId').value).set({
    name: document.getElementById('tName').value,
    subject: document.getElementById('tSubject').value,
    password: document.getElementById('tPass').value
  });
  alert('Teacher created');
  listUsers();
}

async function addAuthUser(role) {
  const email = document.getElementById('authEmail').value;
  const pass = document.getElementById('authPass').value;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection(role).doc(cred.user.uid).set({ email, active: true });
    alert('User created');
    listUsers();
  } catch(e) { alert(e.message); }
}

async function deleteDoc(collection, id) {
  if (confirm('Delete?')) {
    await db.collection(collection).doc(id).delete();
    alert('Deleted');
    listUsers();
  }
}

// ==================== ACADEMIC ====================
function renderAcademicManager(container) {
  container.innerHTML = `
    <h3>📚 একাডেমিক</h3>
    <button onclick="alert('Attendance module')">📋 উপস্থিতি</button>
    <button onclick="alert('Marks module')">📊 মার্কস</button>
    <button onclick="alert('Homework module')">📝 হোমওয়ার্ক</button>
    <button onclick="alert('Routine module')">🕒 রুটিন</button>
    <button onclick="alert('Leaderboard module')">🏆 লিডারবোর্ড</button>
  `;
}

// ==================== FINANCE ====================
function renderFinancePanel(container) {
  container.innerHTML = `
    <h3>💰 ফাইন্যান্স</h3>
    <p>Finance module coming soon.</p>
  `;
}

// ==================== SETTINGS ====================
async function renderSiteSettings(container) {
  const doc = await db.collection('settings').doc('site').get();
  const s = doc.exists ? doc.data() : {};
  container.innerHTML = `
    <h3>⚙️ সাইট সেটিংস</h3>
    <label>নাম: <input id="siteName" value="${s.name || ''}"></label>
    <label>ফোন: <input id="sitePhone" value="${s.phone || ''}"></label>
    <label>ইমেইল: <input id="siteEmail" value="${s.email || ''}"></label>
    <label>ঠিকানা: <input id="siteAddress" value="${s.address || ''}"></label>
    <label>ফেসবুক: <input id="siteFB" value="${s.facebook || ''}"></label>
    <label>ইউটিউব: <input id="siteYT" value="${s.youtube || ''}"></label>
    <label>ম্যাপ: <input id="siteMap" value="${s.map || ''}"></label>
    <label>প্রাইমারি রং: <input type="color" id="sitePrimary" value="${s.primary || '#1A73E8'}"></label>
    <label>সেকেন্ডারি রং: <input type="color" id="siteSecondary" value="${s.secondary || '#00BFA5'}"></label>
    <button onclick="saveSiteSettings()">সংরক্ষণ</button>
  `;
}
async function saveSiteSettings() {
  await db.collection('settings').doc('site').set({
    name: document.getElementById('siteName').value,
    phone: document.getElementById('sitePhone').value,
    email: document.getElementById('siteEmail').value,
    address: document.getElementById('siteAddress').value,
    facebook: document.getElementById('siteFB').value,
    youtube: document.getElementById('siteYT').value,
    map: document.getElementById('siteMap').value,
    primary: document.getElementById('sitePrimary').value,
    secondary: document.getElementById('siteSecondary').value
  });
  alert('Settings saved');
}

// ==================== SYSTEM TOOLS ====================
function renderSystemTools(container) {
  container.innerHTML = `
    <h3>🛠️ সিস্টেম টুলস</h3>
    <button onclick="alert('Leaderboard updated')">🏆 লিডারবোর্ড আপডেট</button>
    <button onclick="alert('Logs coming soon')">📋 লগ দেখুন</button>
  `;
}        alert('হিরো আপডেট হয়েছে');
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
