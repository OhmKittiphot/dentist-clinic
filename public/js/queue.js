const SLOT_LABELS = ['10:00-11:00','11:00-12:00','12:00-13:00','13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00','17:00-18:00','18:00-19:00'];

let dentists = [], units = [], availability = {}, appointments = [], queueItems = [];
let selectedQueueId = null, selectedSuggested = null;

const dateEl = document.getElementById('date');
const queueBody = document.getElementById('queueBody');
const qSearch = document.getElementById('qSearch');
const qStatusFilter = document.getElementById('qStatusFilter');
const selLabel = document.getElementById('selLabel');
const denSel = document.getElementById('denSel');
const unitSel = document.getElementById('unitSel');
const slotSuggest = document.getElementById('slotSuggest');
const btnAssign = document.getElementById('btnAssign');
const btnToday = document.getElementById('btnToday');
const btnTomorrow = document.getElementById('btnTomorrow');

//view switching
const viewAssign = document.getElementById('viewAssign');
const viewUnit = document.getElementById('viewUnit');
const viewDent = document.getElementById('viewDent');
const viewAgenda = document.getElementById('viewAgenda');
const panelAssign = document.getElementById('panelAssign');
const panelUnit = document.getElementById('panelUnit');
const panelDent = document.getElementById('panelDent');
const panelAgenda = document.getElementById('panelAgenda');
const agendaBody = document.getElementById('agendaBody');
const boardUnit = document.getElementById('boardUnit');
const boardDent = document.getElementById('boardDent');

async function loadDataForDate(){
  const date = dateEl.value; if(!date) return;
  const resp = await fetch(`/staff/queue-data?date=${date}`);
  if(!resp.ok){ alert('ไม่สามารถโหลดข้อมูลได้'); return; }
  const data = await resp.json();

  queueItems = data.queueItems.map(i=>({...i, status:i.status.toLowerCase()}));
  appointments = data.appointments.map(i=>({...i, slot:i.slot}));

  calculateAvailability(date, appointments);
  renderQueue(); 
  renderAgenda();
  renderBoardByUnit();
  renderBoardByDent();
}

function calculateAvailability(date, booked){
  availability = {};
  dentists.forEach(d=>units.forEach(u=>{
    const key = `${date}|${d.id}|${u.id}`;
    availability[key] = new Set(SLOT_LABELS);
  }));
  booked.forEach(app=>{ 
    const key=`${app.date}|${app.dentist_id||app.dentist}|${app.unit_id||app.unit}`; 
    availability[key]?.delete(app.slot); 
  });
}

function patName(item){ return `${item.first_name||''} ${item.last_name||''}`.trim(); }
function svcName(item){ return item.service_description||item.service||''; }
function slotAvailable(date, slot, den, unit){ return availability[`${date}|${den}|${unit}`]?.has(slot); }

function renderQueue(){
  const s=qSearch.value.toLowerCase(), st=qStatusFilter.value;
  const items = queueItems.filter(i=>{
    if(st!=='all' && i.status!==st) return false;
    if(!i.first_name) return true;
    return patName(i).toLowerCase().includes(s)||svcName(i).toLowerCase().includes(s);
  });
  
  queueBody.innerHTML=''; 
  
  if (items.length === 0) {
    queueBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">ไม่มีข้อมูลคิวในวันนี้</td></tr>';
    return;
  }
  
  items.forEach(item=>{
    const tr=document.createElement('tr');
    const st=item.status==='scheduled'?'<span class="pill ok">จัดคิวแล้ว</span>':'<span class="pill">รอจัดคิว</span>';
    tr.innerHTML=`<td>${item.time}</td><td>${patName(item)}</td><td>${svcName(item)}</td><td>${st}</td><td><button data-pick="${item.id}" ${item.status==='scheduled'?'disabled':''}>เลือก</button></td>`;
    tr.querySelector('button')?.addEventListener('click',()=>startAssign(item.id));
    queueBody.appendChild(tr);
  });
}

// เพิ่มฟังก์ชันที่หายไป
function renderAgenda() {
  if (!agendaBody) return;
  
  agendaBody.innerHTML = '';
  
  if (appointments.length === 0) {
    agendaBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">ไม่มีนัดหมายในวันนี้</td></tr>';
    return;
  }
  
  appointments.forEach(app=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${app.slot}</td>
      <td>${app.unit_name || 'N/A'}</td>
      <td>${patName(app)}</td>
      <td>${svcName(app)}</td>
      <td>${app.doc_pre_name || ''}${app.doc_first_name || ''} ${app.doc_last_name || ''}</td>
    `;
    agendaBody.appendChild(tr);
  });
}

function renderBoardByUnit() {
  if (!boardUnit) return;
  
  boardUnit.innerHTML = '';
  
  if (units.length === 0) {
    boardUnit.innerHTML = '<div style="text-align:center;padding:20px;">ไม่มีข้อมูลหน่วยทันตกรรม</div>';
    return;
  }
  
  units.forEach(unit=>{
    const unitCard = document.createElement('div');
    unitCard.className = 'card';
    unitCard.innerHTML = `<h4>${unit.name}</h4>`;
    
    const unitAppointments = appointments.filter(a=>a.unit_id == unit.id);
    
    if (unitAppointments.length === 0) {
      unitCard.innerHTML += '<div>ไม่มีนัดหมาย</div>';
    } else {
      unitAppointments.forEach(app=>{
        const appDiv = document.createElement('div');
        appDiv.className = 'drop';
        appDiv.innerHTML = `${app.slot} - ${patName(app)}`;
        unitCard.appendChild(appDiv);
      });
    }
    
    boardUnit.appendChild(unitCard);
  });
}

function renderBoardByDent() {
  if (!boardDent) return;
  
  boardDent.innerHTML = '';
  
  if (dentists.length === 0) {
    boardDent.innerHTML = '<div style="text-align:center;padding:20px;">ไม่มีข้อมูลทันตแพทย์</div>';
    return;
  }
  
  dentists.forEach(dentist=>{
    const dentCard = document.createElement('div');
    dentCard.className = 'card';
    dentCard.innerHTML = `<h4>${dentist.name}</h4>`;
    
    const dentAppointments = appointments.filter(a=>a.dentist_id == dentist.id);
    
    if (dentAppointments.length === 0) {
      dentCard.innerHTML += '<div>ไม่มีนัดหมาย</div>';
    } else {
      dentAppointments.forEach(app=>{
        const appDiv = document.createElement('div');
        appDiv.className = 'drop';
        appDiv.innerHTML = `${app.slot} - ${patName(app)}`;
        dentCard.appendChild(appDiv);
      });
    }
    
    boardDent.appendChild(dentCard);
  });
}

function fillSel(sel, arr){ 
  sel.innerHTML=''; 
  arr.forEach(x=>{ 
    const o=document.createElement('option'); 
    o.value=x.id; 
    o.textContent=`${x.name} (${x.id})`; 
    sel.appendChild(o); 
  }); 
}

function startAssign(id){ 
  const item=queueItems.find(q=>q.id===id); 
  if(!item) return; 
  selectedQueueId=id; 
  selLabel.textContent=`${item.date} · ${item.time} · ${patName(item)} · ${svcName(item)}`; 
  btnAssign.disabled=false; 
}

// เพิ่มฟังก์ชันสำหรับเปลี่ยน view
function switchView(viewName) {
  // ซ่อนทั้งหมด
  [panelAssign, panelUnit, panelDent, panelAgenda].forEach(panel => {
    if (panel) panel.style.display = 'none';
  });
  
  // ลบ active class ทั้งหมด
  [viewAssign, viewUnit, viewDent, viewAgenda].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  
  // แสดง panel ที่เลือกและตั้งค่า active
  switch(viewName) {
    case 'assign':
      if (panelAssign) panelAssign.style.display = 'block';
      if (viewAssign) viewAssign.classList.add('active');
      break;
    case 'unit':
      if (panelUnit) panelUnit.style.display = 'block';
      if (viewUnit) viewUnit.classList.add('active');
      break;
    case 'dent':
      if (panelDent) panelDent.style.display = 'block';
      if (viewDent) viewDent.classList.add('active');
      break;
    case 'agenda':
      if (panelAgenda) panelAgenda.style.display = 'block';
      if (viewAgenda) viewAgenda.classList.add('active');
      break;
  }
}

btnAssign.addEventListener('click', async ()=>{
  if(!selectedQueueId) return;
  const item = queueItems.find(q=>q.id===selectedQueueId);
  const payload={
    requestId:item.id, 
    patientId:item.patient_id, 
    dentistId:denSel.value, 
    unitId:unitSel.value, 
    date:item.date, 
    slot:item.time, 
    serviceDescription:item.service_description 
  };
  const resp = await fetch('/staff/assign-queue',{
    method:'POST', 
    headers:{'Content-Type':'application/json'}, 
    body:JSON.stringify(payload)
  });
  if(!resp.ok) alert('เกิดข้อผิดพลาด'); 
  else { 
    alert('จัดคิวสำเร็จ'); 
    loadDataForDate(); 
    // รีเซ็ต form
    selectedQueueId = null;
    selLabel.textContent = '—';
    btnAssign.disabled = true;
  }
});

// Init
async function initPage(){
  dateEl.value=(new Date()).toISOString().slice(0,10);
  const resp = await fetch('/staff/queue-master-data');
  if(!resp.ok){ alert('ไม่โหลด master data ได้'); return; }
  const master = await resp.json(); 
  dentists=master.dentists; 
  units=master.units;
  fillSel(denSel,dentists); 
  fillSel(unitSel,units);
  
  // เพิ่ม event listeners สำหรับเปลี่ยน view
  if (viewAssign) viewAssign.addEventListener('click', () => switchView('assign'));
  if (viewUnit) viewUnit.addEventListener('click', () => switchView('unit'));
  if (viewDent) viewDent.addEventListener('click', () => switchView('dent'));
  if (viewAgenda) viewAgenda.addEventListener('click', () => switchView('agenda'));
  
  await loadDataForDate();
}

dateEl.addEventListener('change',loadDataForDate);
btnToday.addEventListener('click',()=>{ 
  dateEl.value=(new Date()).toISOString().slice(0,10); 
  loadDataForDate(); 
});
btnTomorrow.addEventListener('click',()=>{ 
  const t=new Date(); 
  t.setDate(t.getDate()+1); 
  dateEl.value=t.toISOString().slice(0,10); 
  loadDataForDate(); 
});
qSearch.addEventListener('input',renderQueue);
qStatusFilter.addEventListener('change',renderQueue);

initPage();