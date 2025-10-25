// API endpoints - ใช้เส้นทางที่ถูกต้อง
const UNITS_API = '/staff/api/units';

// DOM elements
const tbody = document.getElementById('tbody');
const inputName = document.getElementById('unitName');
const addBtn = document.getElementById('addBtn');

// Load units from database
async function loadUnits() {
  try {
    showLoading();
    const response = await fetch(UNITS_API);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const units = await response.json();
    renderUnits(units);
  } catch (error) {
    console.error('Error loading units:', error);
    showError('ไม่สามารถโหลดข้อมูลหน่วยทันตกรรมได้: ' + error.message);
  }
}

// Render units to table
function renderUnits(units) {
  if (!units || units.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="loading">ไม่มีข้อมูลหน่วยทันตกรรม</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = units.map((unit) => `
    <tr data-unit-id="${unit.id}">
      <td><strong>${unit.id}</strong></td>
      <td>
        <input type="text" 
               value="${escapeHtml(unit.unit_name)}" 
               data-unit-id="${unit.id}"
               style="width:100%"
               ${unit.status === 'INACTIVE' ? 'disabled' : ''} />
      </td>
      <td>
        <span class="pill ${unit.status === 'ACTIVE' ? 'active' : 'inactive'}">
          ${unit.status === 'ACTIVE' ? 'พร้อมใช้งาน' : 'ปิดใช้งาน'}
        </span>
      </td>
      <td>
        <div class="actions">
          <button class="btn ${unit.status === 'ACTIVE' ? 'warning' : 'primary'}" 
                  onclick="toggleUnitStatus(${unit.id}, '${unit.status}')">
            ${unit.status === 'ACTIVE' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </button>
          <button class="btn danger" 
                  onclick="deleteUnit(${unit.id}, '${escapeHtml(unit.unit_name)}')">
            ลบ
          </button>
          <button class="btn primary" 
                  onclick="updateUnitName(${unit.id})"
                  ${unit.status === 'INACTIVE' ? 'disabled' : ''}>
            บันทึกชื่อ
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Add new unit
async function addUnit() {
  const unitName = inputName.value.trim();
  
  if (!unitName) {
    alert('กรุณากรอกชื่อ Unit');
    return;
  }

  try {
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

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'เกิดข้อผิดพลาดในการเพิ่มข้อมูล');
    }

    const result = await response.json();
    showSuccess('เพิ่มหน่วยทันตกรรมเรียบร้อยแล้ว');
    inputName.value = '';
    await loadUnits(); // Reload data
  } catch (error) {
    console.error('Error adding unit:', error);
    showError(error.message || 'ไม่สามารถเพิ่มหน่วยทันตกรรมได้');
  }
}

// Update unit name
async function updateUnitName(unitId) {
  const input = document.querySelector(`input[data-unit-id="${unitId}"]`);
  const newName = input.value.trim();

  if (!newName) {
    alert('กรุณากรอกชื่อ Unit');
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

    showSuccess('อัพเดทชื่อหน่วยทันตกรรมเรียบร้อยแล้ว');
  } catch (error) {
    console.error('Error updating unit:', error);
    showError(error.message || 'ไม่สามารถอัพเดทชื่อหน่วยทันตกรรมได้');
  }
}

// Toggle unit status
async function toggleUnitStatus(unitId, currentStatus) {
  const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
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

// Event listeners
addBtn.addEventListener('click', addUnit);

inputName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addUnit();
  }
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadUnits();
});