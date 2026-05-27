// Login for students & teachers (ID + password)
async function loginWithId(role, id, password) {
  const collection = role === 'student' ? 'students' : 'teachers';
  const doc = await db.collection(collection).doc(id).get();
  if (!doc.exists) throw new Error('ID not found');
  const data = doc.data();
  // Simple password check (in production, hash or use Firebase Auth for teachers)
  if (data.password !== password) throw new Error('Wrong password');
  // Store session
  localStorage.setItem('maac_user', JSON.stringify({
    role,
    id,
    name: data.name,
    class: data.class || null,
    loggedInAt: Date.now()
  }));
  return { role, id, ...data };
}

// Secure login for manager/admin/chairman (email/password via Firebase Auth)
async function secureLogin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  const user = cred.user;
  // Verify role in Firestore
  for (const role of ['admin', 'manager', 'chairman', 'secure-admin']) {
    const doc = await db.collection(role).doc(user.uid).get();
    if (doc.exists) {
      localStorage.setItem('maac_user', JSON.stringify({ role, uid: user.uid, email }));
      return { role, uid: user.uid };
    }
  }
  throw new Error('Access denied');
}

function logout() {
  auth.signOut();
  localStorage.removeItem('maac_user');
  window.location.href = '/';
}

function getCurrentUser() {
  const stored = localStorage.getItem('maac_user');
  return stored ? JSON.parse(stored) : null;
}

// Route guard
function requireAuth(allowedRoles = []) {
  const user = getCurrentUser();
  if (!user) { window.location.href = '/'; return null; }
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    window.location.href = '/';
    return null;
  }
  return user;
}
