document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth(['secure-admin']);
  if (!user) return;
  // Additional verification: only specific UID allowed?
  loadLogs(); // default
});

async function loadLogs() {
  const logs = await db.collection('logs').orderBy('timestamp', 'desc').limit(50).get();
  const html = [];
  logs.forEach(doc => {
    const l = doc.data();
    html.push(`<p>[${new Date(l.timestamp?.toDate()).toLocaleString()}] ${l.action} by ${l.user}</p>`);
  });
  document.getElementById('secureContent').innerHTML = html.join('') || 'No logs.';
}

function viewLoginHistory() {
  // Show all login attempts from 'logs' collection
  loadLogs();
}

async function manageChairman() {
  // Add/remove chairman accounts
  document.getElementById('secureContent').innerHTML = `
    <h3>চেয়ারম্যান অ্যাকাউন্ট ম্যানেজ</h3>
    <input id="chairmanEmail" placeholder="Email">
    <input type="password" id="chairmanPass" placeholder="Password">
    <button onclick="createChairman()">তৈরি করুন</button>
  `;
}

async function createChairman() {
  const email = document.getElementById('chairmanEmail').value;
  const password = document.getElementById('chairmanPass').value;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('chairman').doc(cred.user.uid).set({ email, active: true });
    alert('চেয়ারম্যান তৈরি হয়েছে');
  } catch (e) {
    alert(e.message);
  }
}
