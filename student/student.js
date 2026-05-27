document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth(['student']);
  if (!user) return;

  document.getElementById('studentName').textContent = user.name;

  // Load quick overview
  loadDashboard(user.id);
  
  // Setup route tabs
  document.querySelectorAll('.bottom-nav-mobile a').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      loadSection(e.target.getAttribute('href').substring(1));
    });
  });

  async function loadDashboard(studentId) {
    const student = await getCachedDoc('students', studentId);
    if (student) {
      // Show attendance %, latest homework, weekly result
      document.getElementById('contentArea').innerHTML = `
        <div class="glass card">📅 Attendance: ${student.attendance || 0}%</div>
        <div class="glass card">📝 Homework: ${student.homeworkStatus || 'No pending'}</div>
        <div class="glass card">🏆 Weekly Rank: ${student.weeklyRank || 'N/A'}</div>
      `;
    }
  }

  function loadSection(section) {
    // Based on section, import relevant module (lazy load)
    if (section === 'attendance') loadAttendanceUI();
    // ... other sections
  }
});
