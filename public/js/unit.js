// API endpoints 
const UNITS_API = '/staff/api/units';

console.log('JavaScript loaded successfully');
console.log('UNITS_API:', UNITS_API);

// DOM elements
let tbody, inputName, addBtn;

// Initialize DOM elements
function initializeElements() {
  tbody = document.getElementById('tbody');
  inputName = document.getElementById('unitName');
  addBtn = document.getElementById('addBtn');
  
  console.log('DOM elements:', { tbody, inputName, addBtn });
  
  // ตรวจสอบว่าพบ elements ทั้งหมดไหม
  if (!tbody || !inputName || !addBtn) {
    console.error('Missing required DOM elements:');
    console.error('- tbody:', tbody);
    console.error('- inputName:', inputName);
    console.error('- addBtn:', addBtn);
    return false;
  }
  
  return true;
}

// Event listeners
function setupEventListeners() {
  addBtn.addEventListener('click', addUnit);

  inputName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addUnit();
    }
  });
  
  console.log('Event listeners setup successfully');
}

// Load units from database
async function loadUnits() {
  try {
    console.log('Starting to load units...');
    showLoading();
    
    const response = await fetch(UNITS_API);
    console.log('API Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const units = await response.json();
    console.log('Units data received:', units);
    
    renderUnits(units);
  } catch (error) {
    console.error('Error loading units:', error);
    showError('ไม่สามารถโหลดข้อมูลหน่วยทันตกรรมได้: ' + error.message);
  }
}

// Render units to table
function renderUnits(units) {
  console.log('Rendering units:', units);
  
  if (!units || units.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="loading">ไม่มีข้อมูลหน่วยทันตกรรม</td>
      </tr>
    `;
    console.log('No units to display');
    return;
  }

  tbody.innerHTML = units.map((unit) => {
    // แก้ไขให้รองรับทั้ง 'active' และ 'ACTIVE'
    const isActive = unit.status === 'ACTIVE' || unit.status === 'active';
    console.log(`Unit ${unit.id}: ${unit.unit_name}, status: ${unit.status}, isActive: ${isActive}`);
    
    return `
    <tr data-unit-id="${unit.id}">
      <td><strong>${unit.id}</strong></td>
      <td>
        <input type="text" 
               value="${escapeHtml(unit.unit_name)}" 
               data-unit-id="${unit.id}"
               style="width:100%"
               ${!isActive ? 'disabled' : ''}
               onkeypress="handleUnitNameKeypress(event, ${unit.id})"
               onblur="updateUnitName(${unit.id})" />
      </td>
      <td>
        <span class="pill ${isActive ? 'active' : 'inactive'}">
          ${isActive ? 'พร้อมใช้งาน' : 'ปิดใช้งาน'}
        </span>
      </td>
      <td>
        <div class="actions">
          <button class="btn ${isActive ? 'warning' : 'primary'}" 
                  onclick="toggleUnitStatus(${unit.id}, '${unit.status}')">
            ${isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </button>
          <button class="btn danger" 
                  onclick="deleteUnit(${unit.id}, '${escapeHtml(unit.unit_name)}')">
            ลบ
          </button>
        </div>
      </td>
    </tr>
    `;
  }).join('');

  console.log('Units rendered successfully');
}

// Handle Enter key in unit name input
function handleUnitNameKeypress(event, unitId) {
  if (event.key === 'Enter') {
    event.preventDefault();
    updateUnitName(unitId);
  }
}

// Add new unit
async function addUnit() {
  console.log('Add unit button clicked');
  const unitName = inputName.value.trim();
  console.log('Unit name:', unitName);
  
  if (!unitName) {
    alert('กรุณากรอกชื่อ Unit');
    return;
  }

  try {
    console.log('Sending POST request to:', UNITS_API);
    const response = await fetch(UNITS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        unit_name: unitName,
        status: 'ACTIVE'
      }),
    });

    console.log('POST response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'เกิดข้อผิดพลาดในการเพิ่มข้อมูล');
    }

    const result = await response.json();
    console.log('POST response data:', result);
    
    showSuccess('เพิ่มหน่วยทันตกรรมเรียบร้อยแล้ว');
    inputName.value = '';
    await loadUnits(); // Reload data
  } catch (error) {
    console.error('Error adding unit:', error);
    showError(error.message || 'ไม่สามารถเพิ่มหน่วยทันตกรรมได้');
  }
}

// Update unit name (อัตโนมัติเมื่อกด Enter หรือออกจาก field)
async function updateUnitName(unitId) {
  console.log('Update unit name for ID:', unitId);
  const input = document.querySelector(`input[data-unit-id="${unitId}"]`);
  const newName = input.value.trim();
  console.log('New name:', newName);

  if (!newName) {
    alert('กรุณากรอกชื่อ Unit');
    input.value = input.defaultValue; // คืนค่าเดิมถ้าชื่อว่าง
    return;
  }

  // ตรวจสอบว่าชื่อเปลี่ยนจริงๆ ไหม
  const originalName = input.defaultValue;
  if (newName === originalName) {
    console.log('Unit name not changed, skipping update');
    return;
  }

  try {
    const response = await fetch(`${UNITS_API}/${unitId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        unit_name: newName
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'เกิดข้อผิดพลาดในการอัพเดทข้อมูล');
    }

    // อัพเดท defaultValue เพื่อใช้ตรวจสอบการเปลี่ยนแปลงครั้งต่อไป
    input.defaultValue = newName;
    
    showSuccess('อัพเดทชื่อหน่วยทันตกรรมเรียบร้อยแล้ว');
  } catch (error) {
    console.error('Error updating unit:', error);
    showError(error.message || 'ไม่สามารถอัพเดทชื่อหน่วยทันตกรรมได้');
    // คืนค่าเดิมถ้าเกิด error
    input.value = originalName;
  }
}

// Toggle unit status
async function toggleUnitStatus(unitId, currentStatus) {
  console.log('Toggle status for unit:', unitId, 'current status:', currentStatus);
  // แปลง status เป็น uppercase
  const normalizedStatus = currentStatus.toUpperCase();
  const newStatus = normalizedStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  
  const confirmMessage = newStatus === 'ACTIVE' 
    ? 'คุณต้องการเปิดใช้งานหน่วยทันตกรรมนี้ใช่หรือไม่?'
    : 'คุณต้องการปิดใช้งานหน่วยทันตกรรมนี้ใช่หรือไม่?';

  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    const response = await fetch(`${UNITS_API}/${unitId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: newStatus
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
    }

    showSuccess(`เปลี่ยนสถานะหน่วยทันตกรรมเรียบร้อยแล้ว`);
    await loadUnits(); // Reload data
  } catch (error) {
    console.error('Error toggling unit status:', error);
    showError(error.message || 'ไม่สามารถเปลี่ยนสถานะหน่วยทันตกรรมได้');
  }
}

// Delete unit
async function deleteUnit(unitId, unitName) {
  console.log('Delete unit:', unitId, unitName);
  if (!confirm(`คุณต้องการลบหน่วยทันตกรรม "${unitName}" ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) {
    return;
  }

  try {
    const response = await fetch(`${UNITS_API}/${unitId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'เกิดข้อผิดพลาดในการลบข้อมูล');
    }

    showSuccess('ลบหน่วยทันตกรรมเรียบร้อยแล้ว');
    await loadUnits(); // Reload data
  } catch (error) {
    console.error('Error deleting unit:', error);
    showError(error.message || 'ไม่สามารถลบหน่วยทันตกรรมได้');
  }
}

// Utility functions
function showLoading() {
  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="loading">กำลังโหลดข้อมูล...</td>
    </tr>
  `;
}

function showError(message) {
  alert(`ข้อผิดพลาด: ${message}`);
}

function showSuccess(message) {
  alert(`สำเร็จ: ${message}`);
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded');
  
  if (initializeElements()) {
    setupEventListeners();
    loadUnits();
  } else {
    console.error('Failed to initialize application');
    showError('ไม่สามารถโหลดระบบจัดการ Units ได้');
  }
});