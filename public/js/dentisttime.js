// public/js/dentisttime.js
const SLOT_LABELS = [
  '10:00-11:00','11:00-12:00','12:00-13:00',
  '13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00'
];

const dateEl = document.getElementById('date');
const unitSel = document.getElementById('unitSel');
const slotsEl = document.getElementById('slots');
const labelEl = document.getElementById('label');
const btnSave = document.getElementById('btnSave');
const btnClear = document.getElementById('btnClear');
const btnToday = document.getElementById('today');
const btnTomorrow = document.getElementById('tomorrow');
const toastEl = document.getElementById('toast');

function fmtThai(d){
  return d.toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'short',day:'numeric'});
}
function getSelectedSlots(){
  return Array.from(slotsEl.querySelectorAll('.slot.selected')).map(x=>x.textContent.trim());
}
function refreshSaveBtn(){
  btnSave.disabled = !(dateEl.value && unitSel.value && getSelectedSlots().length);
}
function showToast(msg){
  if(!toastEl) return alert(msg);
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(()=>toastEl.classList.remove('show'), 1600);
}

function renderSlots(labels){
  slotsEl.innerHTML = '';
  if (!labels.length) {
    slotsEl.innerHTML = `<div class="muted" style="padding:12px">ไม่มีช่วงเวลาที่ลงได้สำหรับเงื่อนไขนี้</div>`;
    refreshSaveBtn();
    return;
  }
  labels.forEach(label=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='slot';
    btn.textContent=label;
    btn.addEventListener('click',()=>{
      btn.classList.toggle('selected');
      refreshSaveBtn();
    });
    slotsEl.appendChild(btn);
  });
  refreshSaveBtn();
}

/** โหลด Units ที่ ACTIVE ใส่ dropdown */
async function loadUnits(){
  const res = await fetch('/dentist/api/units');
  const rows = await res.json();
  unitSel.innerHTML = '';
  rows.forEach(u=>{
    const o=document.createElement('option');
    o.value = u.id;
    o.textContent = `${u.unit_name} (#${u.id})`;
    unitSel.appendChild(o);
  });
}

/** โหลด “ช่วงเวลาที่ยังลงได้” = SLOT_LABELS - saved - booked */
async function loadCandidates(){
  if(!dateEl.value){
    renderSlots([]);
    return;
  }
  if(!unitSel.value){
    slotsEl.innerHTML = `<div class="muted" style="padding:12px">กรุณาเลือก Unit (ห้อง) ก่อน</div>`;
    refreshSaveBtn();
    return;
  }
  const qs = new URLSearchParams({
    date: dateEl.value,
    unit_id: unitSel.value,
    mode: 'candidates'
  });
  const res = await fetch(`/dentist/api/availability?${qs.toString()}`);
  const data = await res.json(); // {candidates:[], saved:[], booked:[]}
  renderSlots(data.candidates || []);
}

/** บันทึก “เวลาว่างของฉัน” สำหรับห้องที่เลือก */
async function saveAvailability(){
  const slots = getSelectedSlots();
  if (!dateEl.value || !unitSel.value || slots.length === 0) {
    showToast('กรุณาเลือกวันที่ / ห้อง / ช่วงเวลา');
    return;
  }

  const payload = {
    date: dateEl.value,
    unit_id: Number(unitSel.value),
    slots
  };

  const res = await fetch('/dentist/api/availability', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });

  if (res.status === 409) {
    const e = await res.json().catch(()=>({}));
    const list = (e.conflicts || []).join(', ');
    alert(`บันทึกไม่ได้เนื่องจากช่วงเวลาถูกใช้แล้ว: ${list || 'บางช่วงเวลา'}`);
    // รีโหลด candidates เพื่ออัปเดตหน้าจอให้เห็นเวลาที่ยังลงได้จริง
    await loadCandidates();
    return;
  }

  if(!res.ok){
    const e = await res.json().catch(()=>({error:'unknown'}));
    alert('บันทึกไม่สำเร็จ: ' + (e.error || res.statusText));
    return;
  }

  showToast('บันทึกเรียบร้อยแล้ว');
  await loadCandidates(); // ช่องที่เพิ่งลงจะถูกหักออกทันที
}


// ---------- boot ----------
(function init(){
  dateEl.valueAsDate = new Date();
  labelEl.textContent = 'วันที่ ' + fmtThai(new Date());

  dateEl.addEventListener('change', ()=>{
    labelEl.textContent = 'วันที่ ' + (dateEl.value? fmtThai(new Date(dateEl.value)): '');
    loadCandidates();
  });
  unitSel.addEventListener('change', loadCandidates);
  btnSave.addEventListener('click', saveAvailability);
  btnClear.addEventListener('click', ()=>{ renderSlots([]); refreshSaveBtn(); });
  btnToday.addEventListener('click', ()=>{
    dateEl.valueAsDate = new Date();
    dateEl.dispatchEvent(new Event('change'));
  });
  btnTomorrow.addEventListener('click', ()=>{
    const d=new Date();
    d.setDate(d.getDate()+1);
    dateEl.valueAsDate=d;
    dateEl.dispatchEvent(new Event('change'));
  });

  (async()=>{
    await loadUnits();
    await loadCandidates();
  })();
})();
