// public/js/queue.js
const SLOT_LABELS = ['10:00-11:00','11:00-12:00','12:00-13:00','13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00','17:00-18:00','18:00-19:00'];

let dentists = [], units = [], availability = {}, appointments = [], queueItems = [], dentistAvailability = [];
let selectedQueueId = null, selectedSlot = null;

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
const btnCancel = document.getElementById('cancelSelection');

// view switching
const viewAssign = document.getElementById('viewAssign');
const viewAgenda = document.getElementById('viewAgenda');
const panelAssign = document.getElementById('panelAssign');
const panelAgenda = document.getElementById('panelAgenda');
const agendaBody = document.getElementById('agendaBody');

/* ===============================
 * โหลดข้อมูลสำหรับวันที่เลือก
 * =============================== */
async function loadDataForDate(){
  const date = dateEl.value; 
  if(!date) return;
  
  console.log('Loading data for date:', date);
  
  try {
    const resp = await fetch(`/staff/queue-data?date=${date}`);
    if(!resp.ok){ 
      const errorText = await resp.text();
      console.error('Failed to load queue data:', resp.status, errorText);
      throw new Error(`ไม่สามารถโหลดข้อมูลได้: ${resp.status}`);
    }
    const data = await resp.json();
    console.log('Queue data loaded:', data);

    queueItems = data.queueItems.map(i=>({...i, status:i.status.toLowerCase()}));
    appointments = data.appointments.map(i=>({...i, slot:i.slot}));
    dentistAvailability = data.availability || [];

    console.log('Processed data:', {
      queueItems: queueItems.length,
      appointments: appointments.length,
      availability: dentistAvailability.length
    });

    calculateAvailability(date, appointments);
    renderQueue(); 
    renderAgenda();
    
  } catch (error) {
    console.error('Error loading data for date:', error);
    alert('ไม่สามารถโหลดข้อมูลได้: ' + error.message);
    
    queueItems = [];
    appointments = [];
    dentistAvailability = [];
    renderQueue();
    renderAgenda();
  }
}

/* ===============================
 * คำนวณความว่างจาก dentist_availability
 * =============================== */
function calculateAvailability(date, booked){
  availability = {};
  
  console.log('=== CALCULATING AVAILABILITY ===');
  console.log('Date:', date);
  console.log('Dentists:', dentists);
  console.log('Units:', units);
  console.log('Dentist Availability Data:', dentistAvailability);
  console.log('Booked Appointments:', booked);
  
  // สร้าง availability จาก dentist_availability
  dentists.forEach(d => {
    units.forEach(u => {
      const key = `${date}|${d.id}|${u.id}`;
      availability[key] = new Set();
      
      // เพิ่ม slot ที่ว่างจาก dentist_availability
      dentistAvailability.forEach(avail => {
        if (avail.dentist_id == d.id && avail.unit_id == u.id && avail.date === date) {
          availability[key].add(avail.slot_text);
          console.log(`Added slot: ${avail.slot_text} for key: ${key}`);
        }
      });
      
      // Log ถ้ามี slots
      if (availability[key].size > 0) {
        console.log(`Key ${key} has ${availability[key].size} slots:`, Array.from(availability[key]));
      }
    });
  });
  
  // ลบ slot ที่ถูกจองแล้ว
  booked.forEach(app => { 
    const key = `${app.date}|${app.dentist_id}|${app.unit_id}`; 
    if (availability[key]) {
      console.log(`Removing booked slot: ${app.slot} from key: ${key}`);
      availability[key].delete(app.slot);
    }
  });
  
  console.log('Final availability:', availability);
  console.log('=== END CALCULATING AVAILABILITY ===');
}

/* ===============================
 * Helper Functions
 * =============================== */
function patName(item){ 
  return `${item.pre_name || ''}${item.first_name||''} ${item.last_name||''}`.trim(); 
}

function svcName(item){ 
  return item.service_description || item.service || ''; 
}

function slotAvailable(date, slot, den, unit){ 
  return availability[`${date}|${den}|${unit}`]?.has(slot); 
}

/* ===============================
 * แสดงรายการคิว
 * =============================== */
function renderQueue(){
  const s = qSearch.value.toLowerCase();
  const st = qStatusFilter.value;
  
  const items = queueItems.filter(i => {
    if (st !== 'all' && i.status !== st) return false;
    if (!i.first_name) return true;
    return patName(i).toLowerCase().includes(s) || svcName(i).toLowerCase().includes(s);
  });
  
  queueBody.innerHTML = ''; 
  
  if (items.length === 0) {
    queueBody.innerHTML = '<tr><td colspan="5" class="empty-state">ไม่มีข้อมูลคิวในวันนี้</td></tr>';
    return;
  }
  
  items.forEach(item => {
    const tr = document.createElement('tr');
    const statusPill = item.status === 'scheduled' 
      ? '<span class="pill ok">จัดคิวแล้ว</span>' 
      : '<span class="pill">รอจัดคิว</span>';
    
    tr.innerHTML = `
      <td>${item.time}</td>
      <td>${patName(item)}</td>
      <td>${svcName(item)}</td>
      <td>${statusPill}</td>
      <td>
        <button data-pick="${item.id}" ${item.status === 'scheduled' ? 'disabled' : ''} 
                class="btn-select">
          ${item.status === 'scheduled' ? 'จัดคิวแล้ว' : 'เลือก'}
        </button>
      </td>
    `;
    
    const selectBtn = tr.querySelector('button[data-pick]');
    if (selectBtn && !selectBtn.disabled) {
      selectBtn.addEventListener('click', () => startAssign(item.id));
    }
    
    queueBody.appendChild(tr);
  });
}

/* ===============================
 * แสดง Agenda
 * =============================== */
function renderAgenda() {
  if (!agendaBody) return;
  
  agendaBody.innerHTML = '';
  
  if (appointments.length === 0) {
    agendaBody.innerHTML = '<tr><td colspan="5" class="empty-state">ไม่มีนัดหมายในวันนี้</td></tr>';
    return;
  }
  
  appointments.forEach(app => {
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

/* ===============================
 * แสดงช่องเวลาที่มี
 * =============================== */
function renderTimeSlots() {
  if (!selectedQueueId) return;

  const item = queueItems.find(q => q.id === selectedQueueId);
  if (!item) return;

  const selectedDentist = denSel.value;
  const selectedUnit = unitSel.value;
  const selectedDate = item.date;

  const timeSlotsContainer = document.querySelector('.time-slots');
  if (!timeSlotsContainer) return;

  // ล้าง time slots เดิม
  timeSlotsContainer.innerHTML = '';

  if (!selectedDentist || !selectedUnit) {
    timeSlotsContainer.innerHTML = '<div class="slot-info">กรุณาเลือกทันตแพทย์และหน่วยทันตกรรม</div>';
    return;
  }

  // หา slots ที่ว่าง
  const key = `${selectedDate}|${selectedDentist}|${selectedUnit}`;
  const availableSlots = availability[key] || new Set();

  console.log('=== DEBUG TIME SLOTS ===');
  console.log('Selected Date:', selectedDate);
  console.log('Selected Dentist:', selectedDentist);
  console.log('Selected Unit:', selectedUnit);
  console.log('Key:', key);
  console.log('Available slots:', Array.from(availableSlots));
  console.log('All availability keys:', Object.keys(availability));
  console.log('Dentist availability raw:', dentistAvailability);

  if (availableSlots.size === 0) {
    // แสดงข้อความช่วยเหลือที่ชัดเจนขึ้น
    timeSlotsContainer.innerHTML = `
      <div class="slot-unavailable">
        <strong>ไม่มีช่วงเวลาว่างสำหรับ:</strong><br>
        ทันตแพทย์ ID: ${selectedDentist}<br>
        ห้อง ID: ${selectedUnit}<br>
        วันที่: ${selectedDate}
        <br><br>
        <small>กรุณาตรวจสอบว่าได้เพิ่มช่วงเวลาว่างใน dentist_availability แล้วหรือยัง</small>
      </div>
    `;
    updateSlotSuggestions();
    return;
  }

  // แสดง time slots
  const rows = [
    ['10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00'],
    ['14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00'],
    ['18:00-19:00']
  ];

  rows.forEach((rowSlots, idx) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'time-row';

    rowSlots.forEach(slot => {
      const slotDiv = document.createElement('div');
      slotDiv.className = 'time-slot';
      slotDiv.textContent = slot;
      slotDiv.dataset.slot = slot;

      if (availableSlots.has(slot)) {
        slotDiv.classList.add('available');
        slotDiv.addEventListener('click', () => selectTimeSlot(slot));
      } else {
        slotDiv.classList.add('unavailable');
      }

      // ถ้าเป็น slot ที่ user เลือกมา ให้ highlight
      if (slot === item.time) {
        slotDiv.classList.add('selected');
        selectedSlot = slot;
      }

      rowDiv.appendChild(slotDiv);
    });

    timeSlotsContainer.appendChild(rowDiv);
  });

  // อัปเดตปุ่มยืนยัน
  updateAssignButton();
}

/* ===============================
 * เลือกช่วงเวลา
 * =============================== */
function selectTimeSlot(slot) {
  selectedSlot = slot;
  
  // ลบ selected class จากทั้งหมด
  document.querySelectorAll('.time-slot').forEach(el => {
    el.classList.remove('selected');
  });
  
  // เพิ่ม selected class ให้กับที่เลือก
  const selectedEl = document.querySelector(`.time-slot[data-slot="${slot}"]`);
  if (selectedEl) {
    selectedEl.classList.add('selected');
  }

  console.log('Selected slot:', slot);
  updateSlotSuggestions();
  updateAssignButton();
}

/* ===============================
 * อัปเดตข้อความแสดงสถานะ
 * =============================== */
function updateSlotSuggestions() {
  if (!selectedQueueId || !selectedSlot) {
    slotSuggest.innerHTML = '<div class="slot-info">กรุณาเลือกช่วงเวลา</div>';
    return;
  }

  const item = queueItems.find(q => q.id === selectedQueueId);
  if (!item) return;

  const selectedDentist = denSel.value;
  const selectedUnit = unitSel.value;

  if (!selectedDentist || !selectedUnit) {
    slotSuggest.innerHTML = '<div class="slot-info">กรุณาเลือกทันตแพทย์และหน่วยทันตกรรม</div>';
    return;
  }

  const isAvailable = slotAvailable(item.date, selectedSlot, selectedDentist, selectedUnit);
  
  if (isAvailable) {
    slotSuggest.innerHTML = `<div class="slot-available">✓ เวลา ${selectedSlot} ว่าง สามารถจองได้</div>`;
  } else {
    slotSuggest.innerHTML = `<div class="slot-unavailable">✗ เวลา ${selectedSlot} ไม่ว่าง</div>`;
  }
}

/* ===============================
 * อัปเดตสถานะปุ่มยืนยัน
 * =============================== */
function updateAssignButton() {
  if (!selectedQueueId || !selectedSlot) {
    btnAssign.disabled = true;
    return;
  }

  const item = queueItems.find(q => q.id === selectedQueueId);
  if (!item) {
    btnAssign.disabled = true;
    return;
  }

  const selectedDentist = denSel.value;
  const selectedUnit = unitSel.value;

  if (!selectedDentist || !selectedUnit) {
    btnAssign.disabled = true;
    return;
  }

  const isAvailable = slotAvailable(item.date, selectedSlot, selectedDentist, selectedUnit);
  btnAssign.disabled = !isAvailable;
}

/* ===============================
 * Fill dropdown
 * =============================== */
function fillSel(sel, arr, type){ 
  sel.innerHTML = type === 'dentist' 
    ? '<option value="">-- เลือกทันตแพทย์ --</option>'
    : '<option value="">-- เลือกหน่วย --</option>'; 
  
  arr.forEach(x => { 
    const o = document.createElement('option'); 
    o.value = x.id; 
    o.textContent = type === 'dentist' 
      ? `${x.name} (${x.license_number || x.id})`
      : x.unit_name || x.name;
    sel.appendChild(o); 
  }); 
}

/* ===============================
 * เริ่มกระบวนการจัดคิว
 * =============================== */
function startAssign(id){ 
  const item = queueItems.find(q => q.id === id); 
  if(!item) return; 
  
  selectedQueueId = id;
  selectedSlot = item.time; // เซ็ตเวลาเริ่มต้นเป็นที่ผู้ป่วยเลือกมา
  
  selLabel.textContent = `${item.date} · ${item.time} · ${patName(item)} · ${svcName(item)}`; 
  
  // รีเซ็ต dropdown
  denSel.value = '';
  unitSel.value = '';
  
  renderTimeSlots();
  updateSlotSuggestions();
  updateAssignButton();
}

/* ===============================
 * ยกเลิกการเลือก
 * =============================== */
function cancelSelection() {
  selectedQueueId = null;
  selectedSlot = null;
  
  selLabel.textContent = '—';
  denSel.value = '';
  unitSel.value = '';
  btnAssign.disabled = true;
  slotSuggest.innerHTML = '<div class="slot-info">กรุณาเลือกรายการจาก CustomerTime</div>';
  
  const timeSlotsContainer = document.querySelector('.time-slots');
  if (timeSlotsContainer) {
    timeSlotsContainer.innerHTML = '<div class="slot-info">กรุณาเลือกรายการจาก CustomerTime</div>';
  }
}

/* ===============================
 * สลับ View
 * =============================== */
function switchView(viewName) {
  [panelAssign, panelAgenda].forEach(panel => {
    if (panel) panel.style.display = 'none';
  });
  
  [viewAssign, viewAgenda].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  
  switch(viewName) {
    case 'assign':
      if (panelAssign) panelAssign.style.display = 'block';
      if (viewAssign) viewAssign.classList.add('active');
      break;
    case 'agenda':
      if (panelAgenda) panelAgenda.style.display = 'block';
      if (viewAgenda) viewAgenda.classList.add('active');
      break;
  }
}

/* ===============================
 * ยืนยันการจัดคิว
 * =============================== */
btnAssign.addEventListener('click', async () => {
  if(!selectedQueueId || !selectedSlot) return;
  
  const item = queueItems.find(q => q.id === selectedQueueId);
  const payload = {
    requestId: item.id, 
    patientId: item.patient_id, 
    dentistId: denSel.value, 
    unitId: unitSel.value, 
    date: item.date, 
    slot: selectedSlot, // ใช้ slot ที่เลือก ไม่ใช่ item.time
    serviceDescription: item.service_description 
  };
  
  console.log('Assigning queue with payload:', payload);
  
  try {
    const resp = await fetch('/staff/assign-queue', {
      method: 'POST', 
      headers: {'Content-Type': 'application/json'}, 
      body: JSON.stringify(payload)
    });
    
    if(!resp.ok) {
      const errorData = await resp.json();
      throw new Error(errorData.error || 'เกิดข้อผิดพลาด');
    }
    
    const result = await resp.json();
    alert('จัดคิวสำเร็จ!'); 
    
    // โหลดข้อมูลใหม่
    await loadDataForDate(); 
    
    // รีเซ็ต form
    cancelSelection();
    
  } catch (error) {
    console.error('Assign error:', error);
    alert('เกิดข้อผิดพลาด: ' + error.message);
  }
});

/* ===============================
 * Initialize Page
 * =============================== */
async function initPage(){
  try {
    dateEl.value = (new Date()).toISOString().slice(0,10);
    console.log('Initializing queue page...');
    
    // Load master data
    console.log('Loading master data...');
    const resp = await fetch('/staff/queue-master-data');
    if(!resp.ok){ 
      const errorText = await resp.text();
      console.error('Failed to load master data:', resp.status, errorText);
      throw new Error(`ไม่โหลด master data ได้: ${resp.status}`);
    }
    const master = await resp.json(); 
    console.log('Master data loaded:', master);
    
    dentists = master.dentists || [];
    units = master.units || [];
    
    console.log('Dentists:', dentists);
    console.log('Units:', units);
    
    fillSel(denSel, dentists, 'dentist'); 
    fillSel(unitSel, units, 'unit');
    
    // Event listeners
    if (viewAssign) viewAssign.addEventListener('click', () => switchView('assign'));
    if (viewAgenda) viewAgenda.addEventListener('click', () => switchView('agenda'));
    
    denSel.addEventListener('change', () => {
      renderTimeSlots();
      updateSlotSuggestions();
      updateAssignButton();
    });
    
    unitSel.addEventListener('change', () => {
      renderTimeSlots();
      updateSlotSuggestions();
      updateAssignButton();
    });
    
    if (btnCancel) {
      btnCancel.addEventListener('click', cancelSelection);
    }
    
    await loadDataForDate();
    console.log('Queue page initialized successfully');
  } catch (error) {
    console.error('Error initializing queue page:', error);
    alert('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + error.message);
  }
}

/* ===============================
 * Event Listeners
 * =============================== */
dateEl.addEventListener('change', loadDataForDate);

btnToday.addEventListener('click', () => { 
  dateEl.value = (new Date()).toISOString().slice(0,10); 
  loadDataForDate(); 
});

btnTomorrow.addEventListener('click', () => { 
  const t = new Date(); 
  t.setDate(t.getDate() + 1); 
  dateEl.value = t.toISOString().slice(0,10); 
  loadDataForDate(); 
});

qSearch.addEventListener('input', renderQueue);
qStatusFilter.addEventListener('change', renderQueue);

// Initialize
initPage();