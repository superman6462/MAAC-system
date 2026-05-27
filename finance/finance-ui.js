async function renderFinanceModule(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h3>💰 ফাইন্যান্স মডিউল</h3>
    <div class="tabs">
      <button id="tabFeeCollection">ফি সংগ্রহ</button>
      <button id="tabDueList">ডিউ লিস্ট</button>
      <button id="tabReport">রিপোর্ট</button>
    </div>
    <div id="financeContent"></div>
  `;

  document.getElementById('tabFeeCollection').onclick = () => renderFeeCollection('financeContent');
  document.getElementById('tabDueList').onclick = () => renderDueList('financeContent');
  document.getElementById('tabReport').onclick = () => renderReport('financeContent');
}

async function renderFeeCollection(containerId) {
  const classes = await getCachedCollection('classes');
  let opts = classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById(containerId).innerHTML = `
    <select id="feeClassSelect">${opts}</select>
    <input type="month" id="feeMonth" value="${new Date().toISOString().slice(0,7)}">
    <button id="loadStudentsForFee">লোড</button>
    <div id="studentFeeList"></div>
  `;
  document.getElementById('loadStudentsForFee').onclick = async () => {
    const classId = document.getElementById('feeClassSelect').value;
    const month = document.getElementById('feeMonth').value;
    const students = await getCachedCollection('students', { field: 'class', op: '==', value: classId });
    let html = '';
    students.forEach(s => {
      const paid = s.fees && s.fees[month] === 'paid';
      html += `<div>
        <span>${s.name}</span> ${paid ? '✅ Paid' : `<button onclick="collectFee('${s.id}','${month}')">Pay</button>`}
      </div>`;
    });
    document.getElementById('studentFeeList').innerHTML = html;
  };
  window.collectFee = async (studentId, month) => {
    const amount = prompt('Amount:');
    if (amount) {
      await addFeePayment(studentId, Number(amount), month);
      alert('Fee collected');
      document.getElementById('loadStudentsForFee').click(); // refresh
    }
  };
}

async function renderDueList(containerId) {
  const classes = await getCachedCollection('classes');
  let opts = classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById(containerId).innerHTML = `
    <select id="dueClassSelect">${opts}</select>
    <input type="month" id="dueMonth" value="${new Date().toISOString().slice(0,7)}">
    <button id="loadDue">লোড</button>
    <div id="dueList"></div>
  `;
  document.getElementById('loadDue').onclick = async () => {
    const classId = document.getElementById('dueClassSelect').value;
    const month = document.getElementById('dueMonth').value;
    const dueList = await getFeeDueList(classId, month);
    document.getElementById('dueList').innerHTML = dueList.map(s => `<p>${s.name} (ID: ${s.id})</p>`).join('') || '<p>No dues</p>';
  };
}

async function renderReport(containerId) {
  const month = prompt('Enter month (YYYY-MM):', new Date().toISOString().slice(0,7));
  if (!month) return;
  const report = await getMonthlyReport(month);
  document.getElementById(containerId).innerHTML = `<p>Total collected: ${report.total} BDT | Payments: ${report.count}</p>`;
}
