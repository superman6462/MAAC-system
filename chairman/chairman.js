document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth(['chairman']);
  if (!user) return;
  await loadAnalytics();
});

async function loadAnalytics() {
  const heatmap = await getAttendanceHeatmap();
  const feeTrend = await getFeeTrends();
  renderCharts(heatmap, feeTrend);
}

function renderCharts(heatmap, feeTrend) {
  const ctx1 = document.getElementById('attChart').getContext('2d');
  new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: Object.keys(heatmap),
      datasets: [{ label: 'Daily Attendance', data: Object.values(heatmap), backgroundColor: '#1A73E8' }]
    }
  });
  const ctx2 = document.getElementById('feeChart').getContext('2d');
  new Chart(ctx2, {
    type: 'line',
    data: {
      labels: Object.keys(feeTrend),
      datasets: [{ label: 'Fee Collection (BDT)', data: Object.values(feeTrend), borderColor: '#00BFA5' }]
    }
  });
}
