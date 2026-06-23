/* ============================================================
   FIREBASE INIT
============================================================ */
firebase.initializeApp({
  apiKey: "AIzaSyCwRPJ7Rh-0yA_ZNSfsMv2JIFqQVL_YDqI",
  authDomain: "maac-system.firebaseapp.com",
  projectId: "maac-system",
  storageBucket: "maac-system.firebasestorage.app",
  messagingSenderId: "888172288312",
  appId: "1:888172288312:web:29e2e182e2dbd55df209cd"
});
const auth = firebase.auth();
const db   = firebase.firestore();

/* ============================================================
   GOOGLE DRIVE — AUTO CONNECT (no button)
   Strategy: Firebase already signed the admin in with Google.
   We reuse that Google account silently via GIS token client
   with prompt:'' so no popup ever appears.
   Client ID: from client_secret JSON (web app credential)
============================================================ */
const GOOGLE_CLIENT_ID = '888172288312-c336gfvpfm1q2qglmrcb9of1tj6jktct.apps.googleusercontent.com';
const DRIVE_FOLDER_ID  = '17TkAb01lkQLseNzVpWkpUm-L-ZZkgRe-';
let accessToken        = null;
let tokenClient        = null;
let _driveReady        = false;

// Queue of { resolve, reject } pairs waiting for Drive to be ready
const _driveQueue = [];

function setDriveStatus(text, connected) {
  const el = document.getElementById('driveStatus');
  const tx = document.getElementById('driveStatusText');
  if (!el || !tx) return;
  tx.textContent = text;
  el.style.opacity = connected ? '1' : '0.5';
  if (connected) el.classList.add('connected');
  else el.classList.remove('connected');
}

// Called automatically after Firebase confirms the admin user
function autoConnectDrive(userEmail) {
  // Wait for GIS script to load (it's async), poll briefly
  const tryInit = (attempts) => {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      initTokenClient(userEmail);
    } else if (attempts > 0) {
      setTimeout(() => tryInit(attempts - 1), 300);
    } else {
      setDriveStatus('Drive unavailable', false);
    }
  };
  tryInit(20); // up to 6 seconds
}

function initTokenClient(userEmail) {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    // hint: pre-fills the account so user never has to choose
    hint: userEmail || '',
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        // Silent attempt failed — Drive won't work but admin can still use other features
        console.warn('Drive silent auth failed:', tokenResponse.error);
        setDriveStatus('Drive: re-login needed', false);
        // Flush queue with error
        _driveQueue.forEach(({ reject }) => reject(new Error(tokenResponse.error)));
        _driveQueue.length = 0;
        return;
      }
      accessToken = tokenResponse.access_token;
      _driveReady = true;
      setDriveStatus('Drive Connected', true);
      // Flush any queued upload promises
      _driveQueue.forEach(({ resolve }) => resolve());
      _driveQueue.length = 0;
    },
    error_callback: (err) => {
      // Non-OAuth errors (e.g. popup blocked — but we use prompt:'' so no popup)
      console.warn('Drive GIS error:', err);
      setDriveStatus('Drive unavailable', false);
      _driveQueue.forEach(({ reject }) => reject(new Error(err.type || 'Drive error')) );
      _driveQueue.length = 0;
    }
  });

  // Request token silently — prompt:'' means:
  // if user already granted Drive scope to this client → no popup, instant token
  // if not yet granted → will open a one-time consent popup (only first time)
  tokenClient.requestAccessToken({ prompt: '' });
}

// Returns a Promise — resolves when Drive is ready, or immediately if already ready
function waitForDrive() {
  if (_driveReady && accessToken) return Promise.resolve();
  return new Promise((resolve, reject) => {
    _driveQueue.push({ resolve, reject });
  });
}

// Upload file to Drive, waiting for auth if needed
async function uploadToDrive(file) {
  await waitForDrive();

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: file.name, parents: [DRIVE_FOLDER_ID] })], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken },
    body: form
  });
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      // Token expired — clear and retry once with a fresh token
      accessToken = null; _driveReady = false;
      setDriveStatus('Drive: refreshing…', false);
      autoConnectDrive();
      await waitForDrive();
      return uploadToDrive(file); // retry
    }
    throw new Error(data.error?.message || 'Upload failed (HTTP ' + res.status + ')');
  }

  // Make publicly readable
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  return `https://drive.google.com/uc?export=view&id=${data.id}`;
}

/* ============================================================
   TOAST
============================================================ */
function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success: 'check-circle', error: 'circle-xmark', info: 'circle-info' };
  t.innerHTML = `<i class="fas fa-${icons[type]||'info'}"></i> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ============================================================
   AUTH
============================================================ */
let panelShown = false;

auth.onAuthStateChanged(user => {
  if (user && !panelShown) checkAccess(user);
  else if (!user && !panelShown) redirectToLogin();
});

async function checkAccess(user) {
  document.getElementById('loadStatus').textContent = 'Verifying access…';
  try {
    const doc = await db.collection('secure-admin').doc(user.uid).get();
    if (doc.exists) {
      showPanel(user);
    } else {
      document.getElementById('loadingScreen').innerHTML = `
        <div class="loader-error">
          <i class="fas fa-lock" style="font-size:2rem; margin-bottom:12px; display:block;"></i>
          <strong>Access Denied</strong><br><br>
          Your account is not authorized as Super Admin.<br><br>
          <a href="/login.html">← Return to Login</a>
        </div>`;
      auth.signOut();
    }
  } catch (e) {
    document.getElementById('loadingScreen').innerHTML = `<div class="loader-error">Error: ${e.message}<br><a href="/login.html">← Login</a></div>`;
  }
}

function redirectToLogin() {
  document.getElementById('loadStatus').textContent = 'Redirecting to login…';
  setTimeout(() => window.location.href = '/login.html', 800);
}

function showPanel(user) {
  panelShown = true;
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('mainPanel').style.display = 'block';

  // Set user info
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('userInitial').textContent = (user.email || 'A')[0].toUpperCase();

  // Auto-connect Drive silently using the admin's Google account
  autoConnectDrive(user.email);
  setupSidebar();
  loadTab('dashboard');
  loadNoticeBadge();
}

function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  auth.signOut().then(() => window.location.href = '/login.html');
}

/* ============================================================
   SIDEBAR & ROUTING
============================================================ */
let currentTab = 'dashboard';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  hero: 'Hero & Banner',
  courses: 'Courses',
  teachers: 'Teachers',
  gallery: 'Gallery',
  videos: 'Videos',
  notices: 'Notice Board',
  students: 'Students',
  attendance: 'Attendance',
  teacherAttendance: 'Teacher Attendance',
  leaderboard: 'Leaderboard',
  exams: 'Exams & Results',
  quiz: 'Quiz Management',
  routines: 'Routines',
  lessonPlans: 'Lesson Plans',
  finance: 'Fee Collections & Expenses',
  dueNotifications: 'Due Notifications',
  siteSettings: 'Site Settings',
  stats: 'Homepage Stats',
  admins: 'Administrators',
  logs: 'System Logs'
};

function setupSidebar() {
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      navItems.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      currentTab = tab;
      document.getElementById('pageTitle').textContent = PAGE_TITLES[tab] || tab;
      loadTab(tab);
      // Close on mobile
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('visible');
    });
  });

  // Mobile toggle
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('visible');
  });
  document.getElementById('sidebarClose').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
  });
}

function loadTab(tab) {
  const area = document.getElementById('contentArea');
  area.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div>';
  const fn = TABS[tab];
  if (fn) fn(area);
  else area.innerHTML = `<div class="empty-state"><i class="fas fa-tools"></i><p>Coming soon</p></div>`;
}

async function loadNoticeBadge() {
  try {
    const snap = await db.collection('notifications').where('type','==','notice').get();
    document.getElementById('noticeBadge').textContent = snap.size;
  } catch(e) {}
}

/* ============================================================
   HELPER — DELETE DOC
============================================================ */
async function delDoc(coll, id, reloadFn) {
  if (!confirm('Delete this item? This cannot be undone.')) return;
  try {
    await db.collection(coll).doc(id).delete();
    showToast('Deleted successfully', 'success');
    if (reloadFn) reloadFn();
  } catch(e) { showToast('Delete failed: ' + e.message, 'error'); }
}

/* ============================================================
   TABS
============================================================ */
const TABS = {

  /* ---- DASHBOARD ---- */
  async dashboard(area) {
    let students = 0, teachers = 0, notices = 0, dues = 0, totalFees = 0;
    try {
      const [sSnap, tSnap, nSnap, dSnap, fSnap] = await Promise.all([
        db.collection('students').get(),
        db.collection('teachers').get(),
        db.collection('notifications').where('type','==','notice').get(),
        db.collection('dueNotifications').get(),
        db.collection('fees').get()
      ]);
      students = sSnap.size; teachers = tSnap.size; notices = nSnap.size; dues = dSnap.size;
      fSnap.forEach(d => { totalFees += (d.data().amount || 0); });
    } catch(e) {}

    area.innerHTML = `
      <div class="stats-row">
        <div class="stat-card">
          <div class="icon" style="background:rgba(201,168,76,0.12); color:var(--gold)"><i class="fas fa-user-graduate"></i></div>
          <div class="num">${students}</div>
          <div class="lbl">Total Students</div>
          <div class="trend trend-up"><i class="fas fa-arrow-trend-up"></i> Active</div>
        </div>
        <div class="stat-card">
          <div class="icon" style="background:rgba(30,203,225,0.12); color:var(--teal)"><i class="fas fa-chalkboard-user"></i></div>
          <div class="num">${teachers}</div>
          <div class="lbl">Teachers</div>
        </div>
        <div class="stat-card">
          <div class="icon" style="background:rgba(139,92,246,0.12); color:var(--purple)"><i class="fas fa-bullhorn"></i></div>
          <div class="num">${notices}</div>
          <div class="lbl">Active Notices</div>
        </div>
        <div class="stat-card">
          <div class="icon" style="background:rgba(34,197,94,0.12); color:var(--green)"><i class="fas fa-circle-check"></i></div>
          <div class="num">Live</div>
          <div class="lbl">System Status</div>
          <div class="trend trend-up"><i class="fas fa-check"></i> All systems normal</div>
        </div>
      </div>
      <div class="stats-row" style="margin-bottom:28px;">
        <div class="stat-card">
          <div class="icon" style="background:rgba(239,68,68,0.12); color:var(--red)"><i class="fas fa-bell"></i></div>
          <div class="num">${dues}</div>
          <div class="lbl">Due Notifications</div>
          <div class="trend trend-down"><i class="fas fa-exclamation-triangle"></i> Unpaid</div>
        </div>
        <div class="stat-card">
          <div class="icon" style="background:rgba(34,197,94,0.12); color:var(--green)"><i class="fas fa-coins"></i></div>
          <div class="num">৳${totalFees.toLocaleString()}</div>
          <div class="lbl">Total Fee Collected</div>
          <div class="trend trend-up"><i class="fas fa-arrow-trend-up"></i> All time</div>
        </div>
        <div class="stat-card" style="cursor:pointer;" onclick="loadTabById('quiz')">
          <div class="icon" style="background:rgba(139,92,246,0.12); color:var(--purple)"><i class="fas fa-question-circle"></i></div>
          <div class="num"><i class="fas fa-arrow-right" style="font-size:1rem;"></i></div>
          <div class="lbl">Quiz Management</div>
        </div>
        <div class="stat-card" style="cursor:pointer;" onclick="loadTabById('lessonPlans')">
          <div class="icon" style="background:rgba(30,203,225,0.12); color:var(--teal)"><i class="fas fa-book-open-reader"></i></div>
          <div class="num"><i class="fas fa-arrow-right" style="font-size:1rem;"></i></div>
          <div class="lbl">Lesson Plans</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px;">
        <div class="card">
          <div class="card-header"><span class="card-title">Quick Actions</span></div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <button class="btn btn-primary" onclick="loadTabById('students')"><i class="fas fa-user-plus"></i> Add Student</button>
            <button class="btn btn-ghost" onclick="loadTabById('notices')"><i class="fas fa-bullhorn"></i> Post Notice</button>
            <button class="btn btn-ghost" onclick="loadTabById('attendance')"><i class="fas fa-clipboard-check"></i> Take Attendance</button>
            <button class="btn btn-ghost" onclick="loadTabById('leaderboard')"><i class="fas fa-trophy"></i> Update Leaderboard</button>
            <button class="btn btn-ghost" onclick="loadTabById('finance')"><i class="fas fa-coins"></i> Record Fee Payment</button>
            <button class="btn btn-ghost" onclick="loadTabById('dueNotifications')"><i class="fas fa-bell"></i> Assign Due Notification</button>
            <button class="btn btn-ghost" onclick="loadTabById('quiz')"><i class="fas fa-question-circle"></i> Manage Quizzes</button>
            <button class="btn btn-ghost" onclick="loadTabById('lessonPlans')"><i class="fas fa-book-open-reader"></i> Lesson Plans</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">System Info</span></div>
          <div style="font-size:0.85rem; display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Firebase Project</span><span class="chip chip-green">maac-system</span></div>
            <div style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Auth Provider</span><span class="chip chip-blue">Google OAuth</span></div>
            <div style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Storage</span><span class="chip chip-gold">Google Drive</span></div>
            <div style="display:flex; justify-content:space-between;"><span style="color:var(--muted)">Website</span><span class="chip chip-green">Live ✓</span></div>
          </div>
        </div>
      </div>`;
  },

  /* ---- HERO SETTINGS ---- */
  async hero(area) {
    let heading = '', subheading = '';
    try {
      const doc = await db.collection('settings').doc('hero').get();
      if (doc.exists) { heading = doc.data().heading || ''; subheading = doc.data().subheading || ''; }
    } catch(e) {}

    area.innerHTML = `
      <div class="card">
        <div class="card-header"><span class="card-title">Hero Section Content</span></div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Hero Heading (HTML allowed)</label>
            <textarea class="form-input" id="heroHeading" rows="3">${heading}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Hero Subheading</label>
            <textarea class="form-input" id="heroSub" rows="3">${subheading}</textarea>
          </div>
          <div>
            <button class="btn btn-primary" onclick="saveHero()"><i class="fas fa-save"></i> Save Changes</button>
          </div>
        </div>
      </div>`;

    window.saveHero = async () => {
      try {
        await db.collection('settings').doc('hero').set({
          heading: document.getElementById('heroHeading').value,
          subheading: document.getElementById('heroSub').value
        });
        showToast('Hero content saved!', 'success');
      } catch(e) { showToast('Save failed: ' + e.message, 'error'); }
    };
  },

  /* ---- COURSES ---- */
  async courses(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Add Course</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Course Title</label>
            <input class="form-input" id="cTitle" placeholder="e.g. SSC Preparation">
          </div>
          <div class="form-group">
            <label class="form-label">Tag / Category</label>
            <input class="form-input" id="cTag" placeholder="e.g. Board Exam">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Description</label>
            <textarea class="form-input" id="cDesc" placeholder="Course description…"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Icon (Emoji)</label>
            <input class="form-input" id="cIcon" placeholder="📚">
          </div>
          <div class="form-group" style="align-self:end;">
            <button class="btn btn-primary" onclick="addCourse()"><i class="fas fa-plus"></i> Add Course</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">All Courses</span></div>
        <div id="courseList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadCourseList();

    window.addCourse = async () => {
      const title = document.getElementById('cTitle').value.trim();
      if (!title) { showToast('Title is required', 'error'); return; }
      try {
        await db.collection('courses').add({
          title, tag: document.getElementById('cTag').value,
          description: document.getElementById('cDesc').value,
          icon: document.getElementById('cIcon').value || '📚',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Course added!', 'success');
        ['cTitle','cTag','cDesc','cIcon'].forEach(id => document.getElementById(id).value = '');
        await loadCourseList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadCourseList() {
      const snap = await db.collection('courses').get();
      const el = document.getElementById('courseList');
      if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i><p>No courses yet</p></div>'; return; }
      let rows = '';
      snap.forEach(doc => {
        const c = doc.data();
        rows += `<tr>
          <td>${c.icon||'📚'}</td>
          <td><strong>${c.title}</strong></td>
          <td>${c.description||'—'}</td>
          <td><span class="chip chip-gold">${c.tag||'—'}</span></td>
          <td><button class="btn btn-danger btn-sm" onclick="delDoc('courses','${doc.id}',()=>TABS.courses(document.getElementById('contentArea')))"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      });
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Icon</th><th>Title</th><th>Description</th><th>Tag</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  },

  /* ---- TEACHERS ---- */
  async teachers(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Add Teacher</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input class="form-input" id="tName" placeholder="Teacher name">
          </div>
          <div class="form-group">
            <label class="form-label">Subject</label>
            <input class="form-input" id="tSubject" placeholder="e.g. Physics">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Photo Source</label>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <button type="button" class="btn btn-ghost btn-sm" id="tPhotoTabFile" onclick="switchTeacherPhotoTab(\'file\')" style="background:rgba(201,168,76,0.12);color:var(--gold);">
                <i class="fas fa-upload"></i> Upload File
              </button>
              <button type="button" class="btn btn-ghost btn-sm" id="tPhotoTabUrl" onclick="switchTeacherPhotoTab(\'url\')">
                <i class="fas fa-link"></i> Image URL
              </button>
            </div>
            <div id="tPhotoFileWrap">
              <input class="form-input" type="file" id="tPhoto" accept="image/*">
            </div>
            <div id="tPhotoUrlWrap" style="display:none;">
              <input class="form-input" id="tPhotoUrl" placeholder="https://example.com/photo.jpg">
            </div>
          </div>
          <div class="form-group" style="align-self:end;">
            <button class="btn btn-primary" onclick="addTeacher()"><i class="fas fa-user-plus"></i> Add Teacher</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">All Teachers</span></div>
        <div id="teacherList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadTeacherList();

    window.switchTeacherPhotoTab = (tab) => {
      const fileWrap = document.getElementById('tPhotoFileWrap');
      const urlWrap  = document.getElementById('tPhotoUrlWrap');
      const fileBtn  = document.getElementById('tPhotoTabFile');
      const urlBtn   = document.getElementById('tPhotoTabUrl');
      if (tab === 'file') {
        fileWrap.style.display = ''; urlWrap.style.display = 'none';
        fileBtn.style.cssText = 'background:rgba(201,168,76,0.12);color:var(--gold);';
        urlBtn.style.cssText  = '';
      } else {
        fileWrap.style.display = 'none'; urlWrap.style.display = '';
        urlBtn.style.cssText  = 'background:rgba(201,168,76,0.12);color:var(--gold);';
        fileBtn.style.cssText = '';
      }
    };

    window.addTeacher = async () => {
      const name = document.getElementById('tName').value.trim();
      if (!name) { showToast('Name is required', 'error'); return; }
      let photo = '';
      const urlInput  = document.getElementById('tPhotoUrl');
      const fileInput = document.getElementById('tPhoto');
      const isUrlMode = document.getElementById('tPhotoUrlWrap').style.display !== 'none';
      if (isUrlMode) {
        photo = (urlInput ? urlInput.value.trim() : '');
      } else {
        const file = fileInput ? fileInput.files[0] : null;
        if (file) {
          try { photo = await uploadToDrive(file); }
          catch(e) { showToast('Upload error: ' + e.message, 'error'); return; }
        }
      }
      try {
        await db.collection('teachers').add({
          name, subject: document.getElementById('tSubject').value, photo,
          addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Teacher added!', 'success');
        ['tName','tSubject'].forEach(id => document.getElementById(id).value = '');
        if (urlInput) urlInput.value = '';
        await loadTeacherList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadTeacherList() {
      const snap = await db.collection('teachers').get();
      const el = document.getElementById('teacherList');
      if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-chalkboard-user"></i><p>No teachers yet</p></div>'; return; }
      let rows = '';
      snap.forEach(doc => {
        const t = doc.data();
        rows += `<tr>
          <td><img src="${t.photo||'https://placehold.co/36x36/112040/c9a84c?text=T'}" width="36" height="36" style="border-radius:50%; object-fit:cover;"></td>
          <td><strong>${t.name}</strong></td>
          <td>${t.subject||'—'}</td>
          <td><button class="btn btn-danger btn-sm" onclick="delDoc('teachers','${doc.id}',()=>TABS.teachers(document.getElementById('contentArea')))"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      });
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Photo</th><th>Name</th><th>Subject</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  },

  /* ---- GALLERY ---- */
  async gallery(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Add Image</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Image Source</label>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <button type="button" class="btn btn-ghost btn-sm" id="gTabFile" onclick="switchGalleryTab(\'file\')" style="background:rgba(201,168,76,0.12);color:var(--gold);">
                <i class="fas fa-upload"></i> Upload File
              </button>
              <button type="button" class="btn btn-ghost btn-sm" id="gTabUrl" onclick="switchGalleryTab(\'url\')">
                <i class="fas fa-link"></i> Image URL
              </button>
            </div>
            <div id="gFileWrap">
              <input class="form-input" type="file" id="gFile" accept="image/*">
            </div>
            <div id="gUrlWrap" style="display:none;">
              <input class="form-input" id="gUrl" placeholder="https://example.com/image.jpg">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Caption (optional)</label>
            <input class="form-input" id="gCap" placeholder="Image caption">
          </div>
          <div style="align-self:end;">
            <button class="btn btn-primary" onclick="addGalleryImage()"><i class="fas fa-plus"></i> Add Image</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Gallery Images</span></div>
        <div id="galleryGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px;"></div>
      </div>`;

    await loadGalleryGrid();

    window.switchGalleryTab = (tab) => {
      const fileWrap = document.getElementById('gFileWrap');
      const urlWrap  = document.getElementById('gUrlWrap');
      const fileBtn  = document.getElementById('gTabFile');
      const urlBtn   = document.getElementById('gTabUrl');
      if (tab === 'file') {
        fileWrap.style.display = ''; urlWrap.style.display = 'none';
        fileBtn.style.cssText = 'background:rgba(201,168,76,0.12);color:var(--gold);';
        urlBtn.style.cssText  = '';
      } else {
        fileWrap.style.display = 'none'; urlWrap.style.display = '';
        urlBtn.style.cssText  = 'background:rgba(201,168,76,0.12);color:var(--gold);';
        fileBtn.style.cssText = '';
      }
    };

    window.addGalleryImage = async () => {
      const isUrlMode = document.getElementById('gUrlWrap').style.display !== 'none';
      let url = '';
      if (isUrlMode) {
        url = document.getElementById('gUrl').value.trim();
        if (!url) { showToast('Enter an image URL', 'error'); return; }
      } else {
        const file = document.getElementById('gFile').files[0];
        if (!file) { showToast('Select an image file', 'error'); return; }
        showToast('Uploading…', 'info');
        try { url = await uploadToDrive(file); }
        catch(e) { showToast('Upload error: ' + e.message, 'error'); return; }
      }
      try {
        await db.collection('galleries').add({ url, caption: document.getElementById('gCap').value, uploadedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Image added!', 'success');
        document.getElementById('gCap').value = '';
        const gUrl = document.getElementById('gUrl');
        if (gUrl) gUrl.value = '';
        await loadGalleryGrid();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadGalleryGrid() {
      const snap = await db.collection('galleries').get();
      const el = document.getElementById('galleryGrid');
      if (snap.empty) { el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-images"></i><p>No images yet</p></div>'; return; }
      el.innerHTML = '';
      snap.forEach(doc => {
        const g = doc.data();
        const div = document.createElement('div');
        div.style.cssText = 'position:relative; border-radius:10px; overflow:hidden;';
        div.innerHTML = `
          <img src="${g.url}" style="width:100%; height:120px; object-fit:cover; display:block;" loading="lazy">
          <button onclick="delDoc('galleries','${doc.id}',loadGalleryGrid)" style="position:absolute;top:6px;right:6px;background:rgba(239,68,68,0.9);border:none;border-radius:6px;padding:4px 8px;cursor:pointer;color:#fff;font-size:0.75rem;"><i class="fas fa-trash"></i></button>`;
        el.appendChild(div);
      });
    }
  },

  /* ---- VIDEOS ---- */
  async videos(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Add Video</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">Video Title</label>
            <input class="form-input" id="vTitle" placeholder="Video title">
          </div>
          <div class="form-group">
            <label class="form-label">YouTube Embed URL</label>
            <input class="form-input" id="vUrl" placeholder="https://www.youtube.com/embed/...">
          </div>
          <div>
            <button class="btn btn-primary" onclick="addVideo()"><i class="fas fa-plus"></i> Add Video</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">All Videos</span></div>
        <div id="videoList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadVideoList();

    window.addVideo = async () => {
      const title = document.getElementById('vTitle').value.trim();
      const url   = document.getElementById('vUrl').value.trim();
      if (!title || !url) { showToast('Title and URL required', 'error'); return; }
      try {
        await db.collection('videos').add({ title, url, addedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Video added!', 'success');
        ['vTitle','vUrl'].forEach(id => document.getElementById(id).value = '');
        await loadVideoList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadVideoList() {
      const snap = await db.collection('videos').get();
      const el = document.getElementById('videoList');
      if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-video"></i><p>No videos yet</p></div>'; return; }
      let rows = '';
      snap.forEach(doc => {
        const v = doc.data();
        rows += `<tr>
          <td><strong>${v.title}</strong></td>
          <td><span style="font-size:0.78rem; color:var(--muted); word-break:break-all;">${v.url}</span></td>
          <td><button class="btn btn-danger btn-sm" onclick="delDoc('videos','${doc.id}',()=>TABS.videos(document.getElementById('contentArea')))"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      });
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Title</th><th>URL</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  },

  /* ---- NOTICES ---- */
  async notices(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Post Notice</span></div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Notice Title</label>
            <input class="form-input" id="nTitle" placeholder="Notice title">
          </div>
          <div class="form-group">
            <label class="form-label">Body / Details</label>
            <textarea class="form-input" id="nBody" placeholder="Notice details…" rows="3"></textarea>
          </div>
          <div>
            <button class="btn btn-primary" onclick="addNotice()"><i class="fas fa-bullhorn"></i> Post Notice</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">All Notices</span></div>
        <div id="noticeList"></div>
      </div>`;

    await loadNoticeList();

    window.addNotice = async () => {
      const title = document.getElementById('nTitle').value.trim();
      if (!title) { showToast('Title required', 'error'); return; }
      try {
        await db.collection('notifications').add({
          type: 'notice', title, body: document.getElementById('nBody').value,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Notice posted!', 'success');
        ['nTitle','nBody'].forEach(id => document.getElementById(id).value = '');
        await loadNoticeList();
        loadNoticeBadge();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadNoticeList() {
      const snap = await db.collection('notifications').where('type','==','notice').orderBy('timestamp','desc').limit(20).get();
      const el = document.getElementById('noticeList');
      if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-bullhorn"></i><p>No notices posted</p></div>'; return; }
      let rows = '';
      snap.forEach(doc => {
        const n = doc.data();
        const date = n.timestamp ? new Date(n.timestamp.seconds*1000).toLocaleDateString() : '—';
        rows += `<tr>
          <td><strong>${n.title}</strong></td>
          <td style="max-width:300px;">${n.body||'—'}</td>
          <td>${date}</td>
          <td><button class="btn btn-danger btn-sm" onclick="delDoc('notifications','${doc.id}',()=>TABS.notices(document.getElementById('contentArea')))"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      });
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Body</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  },

  /* ---- STUDENTS ---- */
  async students(area) {
    area.innerHTML = `
      <div class="tab-bar">
        <button class="tab-btn active" onclick="showStudentTab('list',this)">Student List</button>
        <button class="tab-btn" onclick="showStudentTab('add',this)">Add Student</button>
      </div>
      <div id="studentTabContent"></div>`;

    window.showStudentTab = (tab, btn) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const c = document.getElementById('studentTabContent');
      if (tab === 'add') {
        c.innerHTML = `
          <div class="card">
            <div class="card-header"><span class="card-title">Create Student Account</span></div>
            <div class="form-grid form-grid-2">
              <div class="form-group"><label class="form-label">Student ID</label><input class="form-input" id="sId" placeholder="e.g. S2025001"></div>
              <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="sName" placeholder="Student name"></div>
              <div class="form-group"><label class="form-label">Class / Batch</label><input class="form-input" id="sClass" placeholder="e.g. Class 10, Batch A"></div>
              <div class="form-group"><label class="form-label">Password</label><input class="form-input" type="password" id="sPass" placeholder="Set password"></div>
              <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="sPhone" placeholder="+880..."></div>
              <div class="form-group" style="align-self:end;">
                <button class="btn btn-primary" onclick="createStudent()"><i class="fas fa-user-plus"></i> Create Student</button>
              </div>
            </div>
          </div>`;
      } else {
        loadStudentList(c);
      }
    };

    window.createStudent = async () => {
      const id = document.getElementById('sId').value.trim();
      const name = document.getElementById('sName').value.trim();
      if (!id || !name) { showToast('ID and Name required', 'error'); return; }
      try {
        await db.collection('students').doc(id).set({
          name, class: document.getElementById('sClass').value,
          password: document.getElementById('sPass').value,
          phone: document.getElementById('sPhone').value,
          activeStatus: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Student created!', 'success');
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadStudentList(c) {
      c.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div>';
      const snap = await db.collection('students').get();
      if (snap.empty) { c.innerHTML = '<div class="empty-state"><i class="fas fa-user-graduate"></i><p>No students yet</p></div>'; return; }
      let rows = '';
      snap.forEach(doc => {
        const s = doc.data();
        rows += `<tr>
          <td><strong>${doc.id}</strong></td>
          <td>${s.name||'—'}</td>
          <td>${s.class||'—'}</td>
          <td>${s.phone||'—'}</td>
          <td><span class="chip ${s.activeStatus ? 'chip-green' : 'chip-red'}">${s.activeStatus ? 'Active' : 'Inactive'}</span></td>
          <td><button class="btn btn-danger btn-sm" onclick="delDoc('students','${doc.id}',()=>loadStudentList(document.getElementById('studentTabContent')))"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      });
      c.innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Class</th><th>Phone</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }

    showStudentTab('list', document.querySelector('.tab-btn'));
  },

  /* ---- ATTENDANCE ---- */
  async attendance(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header">
          <span class="card-title">Attendance — ${new Date().toLocaleDateString('en-BD', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</span>
        </div>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px;">
          <div class="form-group" style="min-width:200px;">
            <label class="form-label">Select Date</label>
            <input type="date" class="form-input" id="attDate" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="form-group" style="align-self:end;">
            <button class="btn btn-primary" onclick="loadStudentsForAttendance()"><i class="fas fa-list"></i> Load Students</button>
          </div>
        </div>
        <div id="attendanceArea"><div class="empty-state"><i class="fas fa-clipboard-check"></i><p>Click "Load Students" to begin</p></div></div>
        <div id="saveAttBtn" style="display:none; margin-top:16px;">
          <button class="btn btn-primary" onclick="saveAttendance()"><i class="fas fa-save"></i> Save Attendance</button>
        </div>
      </div>`;

    window.loadStudentsForAttendance = async () => {
      const snap = await db.collection('students').get();
      const area2 = document.getElementById('attendanceArea');
      if (snap.empty) { area2.innerHTML = '<div class="empty-state"><p>No students found</p></div>'; return; }
      let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
      snap.forEach(doc => {
        const s = doc.data();
        html += `<div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--input-bg); border-radius:8px; border:1px solid var(--border);">
          <span><strong>${doc.id}</strong> — ${s.name}</span>
          <div style="display:flex; gap:8px;">
            <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:0.85rem;">
              <input type="radio" name="att_${doc.id}" value="present" checked> <span style="color:var(--green)">Present</span>
            </label>
            <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:0.85rem;">
              <input type="radio" name="att_${doc.id}" value="absent"> <span style="color:var(--red)">Absent</span>
            </label>
            <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:0.85rem;">
              <input type="radio" name="att_${doc.id}" value="late"> <span style="color:var(--amber)">Late</span>
            </label>
          </div>
        </div>`;
      });
      html += '</div>';
      area2.innerHTML = html;
      document.getElementById('saveAttBtn').style.display = 'block';
      window._attStudents = [];
      snap.forEach(doc => window._attStudents.push(doc.id));
    };

    window.saveAttendance = async () => {
      const date = document.getElementById('attDate').value;
      const records = {};
      (window._attStudents||[]).forEach(id => {
        const sel = document.querySelector(`input[name="att_${id}"]:checked`);
        records[id] = sel ? sel.value : 'present';
      });
      try {
        await db.collection('attendance').doc(date).set({ date, records, savedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Attendance saved!', 'success');
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };
  },

  /* ---- LEADERBOARD ---- */
  async leaderboard(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Add / Update Score</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Student ID</label><input class="form-input" id="lbId" placeholder="Student ID"></div>
          <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="lbName" placeholder="Student name"></div>
          <div class="form-group"><label class="form-label">Class</label><input class="form-input" id="lbClass" placeholder="e.g. Class 10"></div>
          <div class="form-group"><label class="form-label">Score</label><input class="form-input" type="number" id="lbScore" placeholder="e.g. 95"></div>
          <div>
            <button class="btn btn-primary" onclick="saveLeaderboard()"><i class="fas fa-trophy"></i> Save Score</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Leaderboard</span></div>
        <div id="lbList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadLB();

    window.saveLeaderboard = async () => {
      const id = document.getElementById('lbId').value.trim();
      if (!id) { showToast('Student ID required', 'error'); return; }
      try {
        await db.collection('leaderboard').doc(id).set({
          name: document.getElementById('lbName').value,
          class: document.getElementById('lbClass').value,
          score: +document.getElementById('lbScore').value,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast('Score saved!', 'success');
        await loadLB();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadLB() {
      const snap = await db.collection('leaderboard').orderBy('score','desc').limit(20).get();
      const el = document.getElementById('lbList');
      if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-trophy"></i><p>No data yet</p></div>'; return; }
      let rows = ''; let rank = 1;
      snap.forEach(doc => {
        const s = doc.data();
        const medals = ['🥇','🥈','🥉'];
        rows += `<tr>
          <td>${medals[rank-1]||rank}</td>
          <td><strong>${s.name||doc.id}</strong></td>
          <td>${s.class||'—'}</td>
          <td><strong style="color:var(--gold)">${s.score||0}</strong></td>
          <td><button class="btn btn-danger btn-sm" onclick="delDoc('leaderboard','${doc.id}',loadLB)"><i class="fas fa-trash"></i></button></td>
        </tr>`;
        rank++;
      });
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Name</th><th>Class</th><th>Score</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  },

  /* ---- EXAMS & RESULTS ---- */
  async exams(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Create Exam / Result</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Exam Title</label><input class="form-input" id="exTitle" placeholder="e.g. Weekly Test #12"></div>
          <div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="exDate" value="${new Date().toISOString().slice(0,10)}"></div>
          <div class="form-group"><label class="form-label">Total Marks</label><input class="form-input" type="number" id="exTotal" placeholder="100"></div>
          <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="exSubject" placeholder="e.g. Math"></div>
          <div>
            <button class="btn btn-primary" onclick="createExam()"><i class="fas fa-file-pen"></i> Create Exam</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Exams</span></div>
        <div id="examList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadExamList();

    window.createExam = async () => {
      const title = document.getElementById('exTitle').value.trim();
      if (!title) { showToast('Title required', 'error'); return; }
      try {
        await db.collection('exams').add({
          title, date: document.getElementById('exDate').value,
          total: +document.getElementById('exTotal').value || 100,
          subject: document.getElementById('exSubject').value,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Exam created!', 'success');
        await loadExamList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadExamList() {
      const snap = await db.collection('exams').orderBy('createdAt','desc').limit(10).get();
      const el = document.getElementById('examList');
      if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-file-pen"></i><p>No exams yet</p></div>'; return; }
      let rows = '';
      snap.forEach(doc => {
        const e = doc.data();
        rows += `<tr>
          <td><strong>${e.title}</strong></td>
          <td>${e.subject||'—'}</td>
          <td>${e.date||'—'}</td>
          <td>${e.total||'—'}</td>
          <td><button class="btn btn-danger btn-sm" onclick="delDoc('exams','${doc.id}',loadExamList)"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      });
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Subject</th><th>Date</th><th>Total</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  },

  /* ---- SITE SETTINGS ---- */
  async siteSettings(area) {
    let s = {};
    try {
      const doc = await db.collection('settings').doc('site').get();
      if (doc.exists) s = doc.data();
    } catch(e) {}

    area.innerHTML = `
      <div class="card">
        <div class="card-header"><span class="card-title">Site Settings</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Institute Name</label><input class="form-input" id="ssName" value="${s.name||''}"></div>
          <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="ssPhone" value="${s.phone||''}"></div>
          <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="ssEmail" value="${s.email||''}"></div>
          <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="ssAddr" value="${s.address||''}"></div>
          <div class="form-group"><label class="form-label">Facebook URL</label><input class="form-input" id="ssFB" value="${s.facebook||''}"></div>
          <div class="form-group"><label class="form-label">YouTube URL</label><input class="form-input" id="ssYT" value="${s.youtube||''}"></div>
          <div class="form-group"><label class="form-label">WhatsApp Number</label><input class="form-input" id="ssWA" value="${s.whatsapp||''}"></div>
          <div class="form-group"><label class="form-label">Google Maps Embed URL</label><input class="form-input" id="ssMap" value="${s.map||''}"></div>
          <div style="grid-column:1/-1;">
            <button class="btn btn-primary" onclick="saveSiteSettings()"><i class="fas fa-save"></i> Save Settings</button>
          </div>
        </div>
      </div>`;

    window.saveSiteSettings = async () => {
      try {
        await db.collection('settings').doc('site').set({
          name: document.getElementById('ssName').value,
          phone: document.getElementById('ssPhone').value,
          email: document.getElementById('ssEmail').value,
          address: document.getElementById('ssAddr').value,
          facebook: document.getElementById('ssFB').value,
          youtube: document.getElementById('ssYT').value,
          whatsapp: document.getElementById('ssWA').value,
          map: document.getElementById('ssMap').value,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Settings saved!', 'success');
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };
  },

  /* ---- HOMEPAGE STATS ---- */
  async stats(area) {
    let s = { students: 0, teachers: 0, courses: 0, years: 0 };
    try {
      const doc = await db.collection('settings').doc('stats').get();
      if (doc.exists) s = { ...s, ...doc.data() };
    } catch(e) {}

    area.innerHTML = `
      <div class="card">
        <div class="card-header"><span class="card-title">Homepage Statistics</span></div>
        <p style="font-size:0.85rem; color:var(--muted); margin-bottom:20px;">These numbers appear on the homepage stats banner.</p>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Total Students</label><input class="form-input" type="number" id="stStu" value="${s.students}"></div>
          <div class="form-group"><label class="form-label">Total Teachers</label><input class="form-input" type="number" id="stTea" value="${s.teachers}"></div>
          <div class="form-group"><label class="form-label">Total Courses</label><input class="form-input" type="number" id="stCou" value="${s.courses}"></div>
          <div class="form-group"><label class="form-label">Years of Experience</label><input class="form-input" type="number" id="stYea" value="${s.years}"></div>
          <div>
            <button class="btn btn-primary" onclick="saveStats()"><i class="fas fa-save"></i> Save Stats</button>
          </div>
        </div>
      </div>`;

    window.saveStats = async () => {
      try {
        await db.collection('settings').doc('stats').set({
          students: +document.getElementById('stStu').value,
          teachers: +document.getElementById('stTea').value,
          courses:  +document.getElementById('stCou').value,
          years:    +document.getElementById('stYea').value
        });
        showToast('Stats updated!', 'success');
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };
  },

  /* ---- ADMINS ---- */
  async admins(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Grant Super Admin Access</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">User UID (Firebase)</label><input class="form-input" id="adminUid" placeholder="Firebase UID"></div>
          <div class="form-group"><label class="form-label">Label / Name</label><input class="form-input" id="adminLabel" placeholder="Admin name"></div>
          <div><button class="btn btn-primary" onclick="grantAdmin()"><i class="fas fa-shield-halved"></i> Grant Access</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Current Admins</span></div>
        <div id="adminList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadAdminList();

    window.grantAdmin = async () => {
      const uid = document.getElementById('adminUid').value.trim();
      if (!uid) { showToast('UID required', 'error'); return; }
      try {
        await db.collection('secure-admin').doc(uid).set({ label: document.getElementById('adminLabel').value, grantedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Admin access granted!', 'success');
        await loadAdminList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadAdminList() {
      const snap = await db.collection('secure-admin').get();
      const el = document.getElementById('adminList');
      if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-shield-halved"></i><p>No admins</p></div>'; return; }
      let rows = '';
      snap.forEach(doc => {
        const a = doc.data();
        rows += `<tr>
          <td><code style="font-size:0.78rem; color:var(--muted)">${doc.id}</code></td>
          <td>${a.label||'—'}</td>
          <td><span class="chip chip-gold">Super Admin</span></td>
          <td><button class="btn btn-danger btn-sm" onclick="delDoc('secure-admin','${doc.id}',loadAdminList)"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      });
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>UID</th><th>Label</th><th>Role</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  },

  /* ---- TEACHER ATTENDANCE ---- */
  async teacherAttendance(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Mark Teacher Attendance</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Teacher Name</label>
            <input class="form-input" id="ta-name" placeholder="Teacher name"></div>
          <div class="form-group"><label class="form-label">Date</label>
            <input class="form-input" type="date" id="ta-date" value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-input" id="ta-status">
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Late">Late</option>
              <option value="Leave">Leave</option>
            </select></div>
          <div class="form-group"><label class="form-label">Note (optional)</label>
            <input class="form-input" id="ta-note" placeholder="Optional note"></div>
          <div><button class="btn btn-primary" onclick="markTeacherAttendance()"><i class="fas fa-check"></i> Mark Attendance</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Teacher Attendance Records</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <input class="form-input btn-sm" type="date" id="ta-filter-date" style="width:160px;" onchange="filterTeacherAtt()">
            <button class="btn btn-ghost btn-sm" onclick="filterTeacherAtt()"><i class="fas fa-filter"></i> Filter</button>
          </div>
        </div>
        <div id="teacherAttList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadTeacherAttList();

    window.markTeacherAttendance = async () => {
      const name = document.getElementById('ta-name').value.trim();
      const date = document.getElementById('ta-date').value;
      const status = document.getElementById('ta-status').value;
      const note = document.getElementById('ta-note').value.trim();
      if (!name || !date) { showToast('Name and Date required', 'error'); return; }
      try {
        await db.collection('teacherAttendance').add({ name, date, status, note, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Teacher attendance marked!', 'success');
        document.getElementById('ta-name').value = '';
        document.getElementById('ta-note').value = '';
        await loadTeacherAttList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    window.filterTeacherAtt = async () => await loadTeacherAttList();

    async function loadTeacherAttList() {
      const el = document.getElementById('teacherAttList');
      try {
        let query = db.collection('teacherAttendance').orderBy('date', 'desc').limit(50);
        const snap = await query.get();
        const filterDate = document.getElementById('ta-filter-date')?.value;
        if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-check"></i><p>No records found</p></div>'; return; }
        let rows = '';
        snap.forEach(doc => {
          const r = doc.data();
          if (filterDate && r.date !== filterDate) return;
          const chip = r.status === 'Present' ? 'chip-green' : r.status === 'Absent' ? 'chip-red' : r.status === 'Late' ? 'chip-gold' : 'chip-blue';
          rows += `<tr>
            <td>${r.name}</td><td>${r.date}</td>
            <td><span class="chip ${chip}">${r.status}</span></td>
            <td style="color:var(--muted);font-size:0.8rem">${r.note || '—'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="delDoc('teacherAttendance','${doc.id}',loadTeacherAttList)"><i class="fas fa-trash"></i></button></td>
          </tr>`;
        });
        el.innerHTML = rows ? `<div class="table-wrap"><table><thead><tr><th>Teacher</th><th>Date</th><th>Status</th><th>Note</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>` :
          '<div class="empty-state"><i class="fas fa-clipboard-check"></i><p>No records for selected date</p></div>';
      } catch(e) { el.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
    }
  },

  /* ---- QUIZ MANAGEMENT ---- */
  async quiz(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Create Quiz</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Quiz Title</label><input class="form-input" id="qz-title" placeholder="Quiz title"></div>
          <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="qz-subject" placeholder="Subject"></div>
          <div class="form-group"><label class="form-label">Class</label>
            <select class="form-input" id="qz-class">
              <option value="All">All Classes</option>
              ${['Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10'].map(c=>`<option>${c}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Duration (minutes)</label><input class="form-input" type="number" id="qz-duration" value="30"></div>
          <div class="form-group" style="grid-column:1/-1"><label class="form-label">Description</label><textarea class="form-input" id="qz-desc" placeholder="Quiz description / instructions"></textarea></div>
          <div><button class="btn btn-primary" onclick="createQuiz()"><i class="fas fa-plus"></i> Create Quiz</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">All Quizzes</span>
          <button class="btn btn-ghost btn-sm" onclick="TABS.quiz(document.getElementById('contentArea'))"><i class="fas fa-rotate"></i> Refresh</button>
        </div>
        <div id="quizList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadQuizList();

    window.createQuiz = async () => {
      const title = document.getElementById('qz-title').value.trim();
      const subject = document.getElementById('qz-subject').value.trim();
      const cls = document.getElementById('qz-class').value;
      const duration = parseInt(document.getElementById('qz-duration').value) || 30;
      const desc = document.getElementById('qz-desc').value.trim();
      if (!title || !subject) { showToast('Title and Subject required', 'error'); return; }
      try {
        await db.collection('quizzes').add({ title, subject, class: cls, duration, description: desc, status: 'active', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Quiz created!', 'success');
        ['qz-title','qz-subject','qz-desc'].forEach(id => document.getElementById(id).value = '');
        await loadQuizList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    async function loadQuizList() {
      const el = document.getElementById('quizList');
      try {
        const snap = await db.collection('quizzes').orderBy('createdAt', 'desc').get();
        if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-question-circle"></i><p>No quizzes yet</p></div>'; return; }
        let rows = '';
        snap.forEach(doc => {
          const q = doc.data();
          const statusChip = q.status === 'active' ? 'chip-green' : 'chip-red';
          rows += `<tr>
            <td><strong>${q.title}</strong></td><td>${q.subject}</td><td>${q.class || 'All'}</td>
            <td>${q.duration || '—'} min</td>
            <td><span class="chip ${statusChip}">${q.status || 'active'}</span></td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="toggleQuizStatus('${doc.id}','${q.status || 'active'}')">
                <i class="fas fa-${q.status === 'active' ? 'lock' : 'lock-open'}"></i>
              </button>
              <button class="btn btn-danger btn-sm" onclick="delDoc('quizzes','${doc.id}',()=>TABS.quiz(document.getElementById('contentArea')))"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`;
        });
        el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Title</th><th>Subject</th><th>Class</th><th>Duration</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      } catch(e) { el.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
    }

    window.toggleQuizStatus = async (id, currentStatus) => {
      const newStatus = currentStatus === 'active' ? 'closed' : 'active';
      try {
        await db.collection('quizzes').doc(id).update({ status: newStatus });
        showToast(`Quiz ${newStatus}!`, 'success');
        await loadQuizList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };
  },

  /* ---- ROUTINES ---- */
  async routines(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Upload Student Routine</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Routine Title</label><input class="form-input" id="rt-title" placeholder="e.g. Class 6 Weekly Routine"></div>
          <div class="form-group"><label class="form-label">Class</label>
            <select class="form-input" id="rt-class">
              <option value="All">All Classes</option>
              ${['Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10'].map(c=>`<option>${c}</option>`).join('')}
            </select></div>
          <div class="form-group" style="grid-column:1/-1"><label class="form-label">Routine Image URL (Google Drive)</label>
            <input class="form-input" id="rt-url" placeholder="https://drive.google.com/..."></div>
          <div><button class="btn btn-primary" onclick="addRoutine()"><i class="fas fa-upload"></i> Upload Routine</button></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Upload Teacher Routine</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Routine Title</label><input class="form-input" id="trt-title" placeholder="e.g. Teachers Weekly Routine"></div>
          <div class="form-group"><label class="form-label">Routine Image URL</label>
            <input class="form-input" id="trt-url" placeholder="https://drive.google.com/..."></div>
          <div><button class="btn btn-primary" onclick="addTeacherRoutine()"><i class="fas fa-upload"></i> Upload Teacher Routine</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">All Routines</span>
          <button class="btn btn-ghost btn-sm" onclick="loadAllRoutines()"><i class="fas fa-rotate"></i> Refresh</button>
        </div>
        <div id="routinesList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    window.addRoutine = async () => {
      const title = document.getElementById('rt-title').value.trim();
      const cls = document.getElementById('rt-class').value;
      const url = document.getElementById('rt-url').value.trim();
      if (!title || !url) { showToast('Title and URL required', 'error'); return; }
      try {
        await db.collection('routines').add({ title, class: cls, imageUrl: url, type: 'student', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Routine uploaded!', 'success');
        document.getElementById('rt-title').value = ''; document.getElementById('rt-url').value = '';
        await loadAllRoutines();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    window.addTeacherRoutine = async () => {
      const title = document.getElementById('trt-title').value.trim();
      const url = document.getElementById('trt-url').value.trim();
      if (!title || !url) { showToast('Title and URL required', 'error'); return; }
      try {
        await db.collection('teacherRoutines').add({ title, imageUrl: url, type: 'teacher', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Teacher routine uploaded!', 'success');
        document.getElementById('trt-title').value = ''; document.getElementById('trt-url').value = '';
        await loadAllRoutines();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    window.loadAllRoutines = async () => {
      const el = document.getElementById('routinesList');
      try {
        const [sSnap, tSnap] = await Promise.all([
          db.collection('routines').orderBy('createdAt', 'desc').get(),
          db.collection('teacherRoutines').orderBy('createdAt', 'desc').get()
        ]);
        let html = '';
        if (!sSnap.empty) {
          html += '<div style="font-weight:600;font-size:0.85rem;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.08em;">Student Routines</div>';
          sSnap.forEach(doc => {
            const r = doc.data();
            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <div><div style="font-weight:600">${r.title}</div><div style="font-size:0.78rem;color:var(--muted)">${r.class || 'All'}</div></div>
              <div style="display:flex;gap:8px;">
                <a href="${r.imageUrl}" target="_blank" class="btn btn-ghost btn-sm"><i class="fas fa-eye"></i></a>
                <button class="btn btn-danger btn-sm" onclick="delDoc('routines','${doc.id}',loadAllRoutines)"><i class="fas fa-trash"></i></button>
              </div></div>`;
          });
        }
        if (!tSnap.empty) {
          html += '<div style="font-weight:600;font-size:0.85rem;color:var(--muted);margin:16px 0 10px;text-transform:uppercase;letter-spacing:.08em;">Teacher Routines</div>';
          tSnap.forEach(doc => {
            const r = doc.data();
            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
              <div><div style="font-weight:600">${r.title}</div><div style="font-size:0.78rem;color:var(--muted)">All Teachers</div></div>
              <div style="display:flex;gap:8px;">
                <a href="${r.imageUrl}" target="_blank" class="btn btn-ghost btn-sm"><i class="fas fa-eye"></i></a>
                <button class="btn btn-danger btn-sm" onclick="delDoc('teacherRoutines','${doc.id}',loadAllRoutines)"><i class="fas fa-trash"></i></button>
              </div></div>`;
          });
        }
        el.innerHTML = html || '<div class="empty-state"><i class="fas fa-calendar-days"></i><p>No routines uploaded yet</p></div>';
      } catch(e) { el.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
    };
    await window.loadAllRoutines();
  },

  /* ---- LESSON PLANS ---- */
  async lessonPlans(area) {
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Add Lesson Plan</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="lp-subject" placeholder="Subject"></div>
          <div class="form-group"><label class="form-label">Class</label>
            <select class="form-input" id="lp-class">
              ${['Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10'].map(c=>`<option>${c}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="lp-date" value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="form-group"><label class="form-label">Day</label>
            <select class="form-input" id="lp-day">
              ${['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday'].map(d=>`<option>${d}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Time</label><input class="form-input" type="time" id="lp-time"></div>
          <div class="form-group"><label class="form-label">Teacher</label><input class="form-input" id="lp-teacher" placeholder="Teacher name"></div>
          <div class="form-group" style="grid-column:1/-1"><label class="form-label">Topic / Description</label><textarea class="form-input" id="lp-topic" placeholder="Lesson topic and description"></textarea></div>
          <div class="form-group" style="grid-column:1/-1"><label class="form-label">Notes (optional)</label><input class="form-input" id="lp-notes" placeholder="Additional notes"></div>
          <div><button class="btn btn-primary" onclick="addLessonPlan()"><i class="fas fa-plus"></i> Add Lesson Plan</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">All Lesson Plans</span>
          <div style="display:flex;gap:8px;">
            <select class="form-input btn-sm" id="lp-filter-cls" style="width:130px;" onchange="loadLessonPlans()">
              <option value="">All Classes</option>
              ${['Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10'].map(c=>`<option>${c}</option>`).join('')}
            </select>
            <button class="btn btn-ghost btn-sm" onclick="loadLessonPlans()"><i class="fas fa-rotate"></i></button>
          </div>
        </div>
        <div id="lpList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    window.addLessonPlan = async () => {
      const subject = document.getElementById('lp-subject').value.trim();
      const cls = document.getElementById('lp-class').value;
      const date = document.getElementById('lp-date').value;
      const day = document.getElementById('lp-day').value;
      const time = document.getElementById('lp-time').value;
      const teacher = document.getElementById('lp-teacher').value.trim();
      const topic = document.getElementById('lp-topic').value.trim();
      const notes = document.getElementById('lp-notes').value.trim();
      if (!subject || !date || !topic) { showToast('Subject, Date and Topic required', 'error'); return; }
      try {
        await db.collection('lessonPlans').add({ subject, class: cls, date, day, time, teacher, topic, notes, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Lesson plan added!', 'success');
        ['lp-subject','lp-time','lp-teacher','lp-topic','lp-notes'].forEach(id => document.getElementById(id).value = '');
        await loadLessonPlans();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    window.loadLessonPlans = async () => {
      const el = document.getElementById('lpList');
      const filterCls = document.getElementById('lp-filter-cls')?.value || '';
      try {
        const snap = await db.collection('lessonPlans').orderBy('date', 'desc').limit(50).get();
        if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-book-open-reader"></i><p>No lesson plans yet</p></div>'; return; }
        let rows = '';
        snap.forEach(doc => {
          const l = doc.data();
          if (filterCls && l.class !== filterCls) return;
          rows += `<tr>
            <td>${l.date}</td><td>${l.day || '—'}</td><td>${l.subject}</td><td>${l.class}</td>
            <td style="font-weight:600">${l.topic}</td>
            <td>${l.teacher || '—'}</td>
            <td>${l.time || '—'}</td>
            <td style="color:var(--muted);font-size:0.78rem">${l.notes || '—'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="delDoc('lessonPlans','${doc.id}',loadLessonPlans)"><i class="fas fa-trash"></i></button></td>
          </tr>`;
        });
        el.innerHTML = rows ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Day</th><th>Subject</th><th>Class</th><th>Topic</th><th>Teacher</th><th>Time</th><th>Notes</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` :
          '<div class="empty-state"><i class="fas fa-book-open-reader"></i><p>No plans found for selected class</p></div>';
      } catch(e) { el.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
    };
    await window.loadLessonPlans();
  },

  /* ---- FINANCE (Fee Collections & Expenses) ---- */
  async finance(area) {
    const classes = ['Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Record Fee Payment</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Student Name</label><input class="form-input" id="ff-name" placeholder="Student name"></div>
          <div class="form-group"><label class="form-label">Class</label>
            <select class="form-input" id="ff-class"><option value="">— Select —</option>${classes.map(c=>`<option>${c}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">Fee Type</label>
            <select class="form-input" id="ff-type">
              <option>Monthly Fee</option><option>Admission Fee</option><option>Exam Fee</option><option>Other</option>
            </select></div>
          <div class="form-group"><label class="form-label">Month</label>
            <select class="form-input" id="ff-month">${months.map(m=>`<option>${m}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">Amount (৳)</label><input class="form-input" type="number" id="ff-amount" placeholder="0"></div>
          <div class="form-group"><label class="form-label">Year</label><input class="form-input" type="number" id="ff-year" value="${new Date().getFullYear()}"></div>
          <div><button class="btn btn-primary" onclick="recordFee()"><i class="fas fa-save"></i> Record Fee</button></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Record Expense</span></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Purpose</label><input class="form-input" id="ex-purpose" placeholder="Expense purpose"></div>
          <div class="form-group"><label class="form-label">Amount (৳)</label><input class="form-input" type="number" id="ex-amount" placeholder="0"></div>
          <div><button class="btn btn-primary" onclick="recordExpense()"><i class="fas fa-save"></i> Record Expense</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Fee Collections & Expenses</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <select class="form-input btn-sm" id="fin-filter-month" style="width:140px;" onchange="loadFinanceRecords()">
              <option value="">All Months</option>${months.map(m=>`<option>${m}</option>`).join('')}
            </select>
            <select class="form-input btn-sm" id="fin-filter-cls" style="width:130px;" onchange="loadFinanceRecords()">
              <option value="">All Classes</option>${classes.map(c=>`<option>${c}</option>`).join('')}
            </select>
            <button class="btn btn-ghost btn-sm" onclick="loadFinanceRecords()"><i class="fas fa-rotate"></i></button>
          </div>
        </div>
        <div id="financeList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    // Set current month
    document.getElementById('ff-month').value = months[new Date().getMonth()];

    window.recordFee = async () => {
      const name = document.getElementById('ff-name').value.trim();
      const cls = document.getElementById('ff-class').value;
      const feeType = document.getElementById('ff-type').value;
      const month = document.getElementById('ff-month').value;
      const amount = parseFloat(document.getElementById('ff-amount').value) || 0;
      const year = document.getElementById('ff-year').value;
      if (!name || !cls || !amount) { showToast('Name, Class and Amount required', 'error'); return; }
      const now = new Date();
      try {
        await db.collection('fees').add({
          studentName: name, studentClass: cls, feeType, month, year, amount,
          date: now.toISOString().split('T')[0],
          time: now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),
          recordedBy: 'Super Admin', createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`Fee recorded: ${name} — ${feeType} (${month})`, 'success');
        document.getElementById('ff-name').value = ''; document.getElementById('ff-amount').value = '';
        await loadFinanceRecords();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    window.recordExpense = async () => {
      const purpose = document.getElementById('ex-purpose').value.trim();
      const amount = parseFloat(document.getElementById('ex-amount').value) || 0;
      if (!purpose || !amount) { showToast('Purpose and Amount required', 'error'); return; }
      const now = new Date();
      try {
        await db.collection('expenses').add({
          purpose, amount,
          date: now.toISOString().split('T')[0],
          time: now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),
          recordedBy: 'Super Admin', createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`Expense recorded: ${purpose} — ৳${amount}`, 'success');
        document.getElementById('ex-purpose').value = ''; document.getElementById('ex-amount').value = '';
        await loadFinanceRecords();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    window.loadFinanceRecords = async () => {
      const el = document.getElementById('financeList');
      const filterMonth = document.getElementById('fin-filter-month')?.value || '';
      const filterCls = document.getElementById('fin-filter-cls')?.value || '';
      try {
        const [feesSnap, expSnap] = await Promise.all([
          db.collection('fees').orderBy('createdAt', 'desc').limit(100).get(),
          db.collection('expenses').orderBy('createdAt', 'desc').limit(50).get()
        ]);
        let fees = [], expenses = [];
        feesSnap.forEach(d => { const f = {id:d.id,...d.data()}; if((!filterMonth||f.month===filterMonth)&&(!filterCls||f.studentClass===filterCls)) fees.push(f); });
        expSnap.forEach(d => expenses.push({id:d.id,...d.data()}));
        const totalFees = fees.reduce((s,f)=>s+(f.amount||0),0);
        const totalExp = expenses.reduce((s,e)=>s+(e.amount||0),0);
        let html = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
          <div class="stat-card"><div class="icon" style="background:rgba(34,197,94,.12);color:var(--green)"><i class="fas fa-money-bill-trend-up"></i></div><div class="num">৳${totalFees.toLocaleString()}</div><div class="lbl">Total Collected</div></div>
          <div class="stat-card"><div class="icon" style="background:rgba(239,68,68,.12);color:var(--red)"><i class="fas fa-arrow-trend-down"></i></div><div class="num">৳${totalExp.toLocaleString()}</div><div class="lbl">Total Expenses</div></div>
          <div class="stat-card"><div class="icon" style="background:rgba(201,168,76,.12);color:var(--gold)"><i class="fas fa-wallet"></i></div><div class="num">৳${(totalFees-totalExp).toLocaleString()}</div><div class="lbl">Net Balance</div></div>
        </div>`;
        if (fees.length) {
          let feeRows = fees.map(f=>`<tr><td>${f.date}</td><td>${f.studentName}</td><td>${f.studentClass}</td><td><span class="chip chip-blue">${f.feeType}</span></td><td>${f.month} ${f.year||''}</td><td style="color:var(--green);font-weight:600">৳${(f.amount||0).toLocaleString()}</td><td><button class="btn btn-danger btn-sm" onclick="delDoc('fees','${f.id}',loadFinanceRecords)"><i class="fas fa-trash"></i></button></td></tr>`).join('');
          html += `<div style="font-weight:600;margin-bottom:8px;">💰 Fee Collections (${fees.length})</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>Class</th><th>Type</th><th>Period</th><th>Amount</th><th></th></tr></thead><tbody>${feeRows}</tbody></table></div>`;
        }
        if (expenses.length && !filterMonth && !filterCls) {
          let expRows = expenses.map(e=>`<tr><td>${e.date}</td><td>${e.purpose}</td><td style="color:var(--red);font-weight:600">৳${(e.amount||0).toLocaleString()}</td><td>${e.recordedBy||'—'}</td><td><button class="btn btn-danger btn-sm" onclick="delDoc('expenses','${e.id}',loadFinanceRecords)"><i class="fas fa-trash"></i></button></td></tr>`).join('');
          html += `<div style="font-weight:600;margin:16px 0 8px;">💸 Expenses (${expenses.length})</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Purpose</th><th>Amount</th><th>By</th><th></th></tr></thead><tbody>${expRows}</tbody></table></div>`;
        }
        el.innerHTML = html || '<div class="empty-state"><i class="fas fa-coins"></i><p>No records found</p></div>';
      } catch(e) { el.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
    };
    await window.loadFinanceRecords();
  },

  /* ---- DUE NOTIFICATIONS ---- */
  async dueNotifications(area) {
    const classes = ['Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10'];
    area.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-header"><span class="card-title">Assign Due Notification</span></div>
        <p style="font-size:0.84rem;color:var(--muted);margin-bottom:16px;">Select a student and the due month. They will see a red alert banner in their Notice tab.</p>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Class (filter)</label>
            <select class="form-input" id="du-cls" onchange="loadDueStudentsList()">
              <option value="">All Classes</option>${classes.map(c=>`<option>${c}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Student</label>
            <select class="form-input" id="du-student"><option value="">— Select Student —</option></select></div>
          <div class="form-group"><label class="form-label">Due Month</label>
            <input class="form-input" id="du-month" placeholder="e.g. January 2025"></div>
          <div class="form-group"><label class="form-label">Note (optional)</label>
            <input class="form-input" id="du-note" placeholder="e.g. Fee not paid"></div>
          <div><button class="btn btn-primary" onclick="assignDueNotification()"><i class="fas fa-bell"></i> Assign Due</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Active Due Notifications</span>
          <button class="btn btn-ghost btn-sm" onclick="loadDueList()"><i class="fas fa-rotate"></i> Refresh</button>
        </div>
        <div id="dueList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    await loadDueList();
    window.loadDueStudentsList = loadDueStudentsList;
    await loadDueStudentsList();

    async function loadDueStudentsList() {
      const cls = document.getElementById('du-cls')?.value || '';
      const sel = document.getElementById('du-student'); if (!sel) return;
      try {
        let q = db.collection('students');
        const snap = await q.get();
        let students = [];
        snap.forEach(d => { const s={id:d.id,...d.data()}; if(!cls||s.class===cls) students.push(s); });
        students.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
        sel.innerHTML = '<option value="">— Select Student —</option>' + students.map(s=>`<option value="${s.id}">${s.name} (${s.class})</option>`).join('');
      } catch(e) { console.warn('Students load error:', e.message); }
    }

    window.assignDueNotification = async () => {
      const studentId = document.getElementById('du-student').value;
      const month = document.getElementById('du-month').value.trim();
      const note = document.getElementById('du-note').value.trim();
      if (!studentId || !month) { showToast('Student and Month required', 'error'); return; }
      try {
        const studentDoc = await db.collection('students').doc(studentId).get();
        const student = studentDoc.data() || {};
        await db.collection('dueNotifications').add({
          studentId, studentName: student.name || 'Unknown', studentClass: student.class || '',
          month, note, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Due notification assigned!', 'success');
        document.getElementById('du-month').value = ''; document.getElementById('du-note').value = '';
        await loadDueList();
      } catch(e) { showToast('Error: ' + e.message, 'error'); }
    };

    window.loadDueList = loadDueList;
    async function loadDueList() {
      const el = document.getElementById('dueList');
      try {
        const snap = await db.collection('dueNotifications').orderBy('createdAt', 'desc').get();
        if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-bell"></i><p>No active due notifications</p></div>'; return; }
        let rows = '';
        snap.forEach(d => {
          const r = d.data();
          rows += `<tr>
            <td><strong>${r.studentName || '—'}</strong></td><td>${r.studentClass || '—'}</td>
            <td><span class="chip chip-gold">💰 ${r.month}</span></td>
            <td style="color:var(--muted);font-size:0.8rem">${r.note || '—'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="delDoc('dueNotifications','${d.id}',loadDueList)"><i class="fas fa-trash"></i></button></td>
          </tr>`;
        });
        el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Due Month</th><th>Note</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      } catch(e) { el.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
    }
  },

  /* ---- LOGS ---- */
  async logs(area) {
    area.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">System Logs</span>
          <button class="btn btn-ghost btn-sm" onclick="TABS.logs(document.getElementById('contentArea'))"><i class="fas fa-rotate"></i> Refresh</button>
        </div>
        <div id="logList"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></div>
      </div>`;

    try {
      const snap = await db.collection('logs').orderBy('timestamp','desc').limit(30).get();
      const el = document.getElementById('logList');
      if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-terminal"></i><p>No logs yet</p></div>'; return; }
      let rows = '';
      snap.forEach(doc => {
        const l = doc.data();
        const date = l.timestamp ? new Date(l.timestamp.seconds*1000).toLocaleString() : '—';
        rows += `<tr>
          <td>${date}</td>
          <td><span class="chip ${l.level==='error'?'chip-red':l.level==='warn'?'chip-gold':'chip-blue'}">${l.level||'info'}</span></td>
          <td>${l.message||'—'}</td>
          <td style="font-size:0.78rem; color:var(--muted)">${l.user||'—'}</td>
        </tr>`;
      });
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Level</th><th>Message</th><th>User</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } catch(e) {
      document.getElementById('logList').innerHTML = `<div class="empty-state"><p>Logs collection not set up yet</p></div>`;
    }
  }
};

/* ============================================================
   HELPER
============================================================ */
function loadTabById(tab) {
  document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('pageTitle').textContent = PAGE_TITLES[tab] || tab;
  currentTab = tab;
  loadTab(tab);
}
