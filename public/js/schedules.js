// public/js/schedules.js
document.addEventListener('DOMContentLoaded', function() {
  let dentists = [];
  let units = [];
  
  // Initialize page
  initPage();
  
  async function initPage() {
    await loadMasterData();
    await loadSchedules();
    setupEventListeners();
  }
  
  // Load master data (dentists and units)
  async function loadMasterData() {
    try {
      const response = await fetch('/staff/queue-master-data');
      const data = await response.json();
      
      dentists = data.dentists || [];
      units = data.units || [];
      
      // Fill dropdowns
      fillDropdown('dentistSelect', dentists, 'dentist');
      fillDropdown('bulkDentist', dentists, 'dentist');
      fillDropdown('filterDentist', dentists, 'dentist');
      fillDropdown('unitSelect', units, 'unit');
      fillDropdown('bulkUnit', units, 'unit');
      
    } catch (error) {
      console.error('Error loading master data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลพื้นฐาน');
    }
  }
  
  // Fill dropdown
  function fillDropdown(selectId, data, type) {
    const select = document.getElementById(selectId);
    if (!select) {
      console.warn(`Element with id '${selectId}' not found`);
      return;
    }
    
    select.innerHTML = type === 'dentist' 
      ? '<option value="">-- เลือกทันตแพทย์ --</option>'
      : '<option value="">-- เลือกหน่วยทันตกรรม --</option>';
    
    data.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = type === 'dentist' 
        ? `${item.name} (${item.license_number || item.id})`
        : item.unit_name;
      select.appendChild(option);
    });
  }
  
  // Load schedules
  async function loadSchedules() {
    try {
      const filterDate = document.getElementById('filterDate')?.value || '';
      const filterDentist = document.getElementById('filterDentist')?.value || '';
      
      let url = '/staff/api/schedules';
      const params = new URLSearchParams();
      
      if (filterDate) params.append('date', filterDate);
      if (filterDentist) params.append('dentistId', filterDentist);
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      const response = await fetch(url);
      const schedules = await response.json();
      
      renderSchedules(schedules);
      
    } catch (error) {
      console.error('Error loading schedules:', error);
      alert('เกิดข้อผิดพลาดในการโหลดตารางเวลา');
    }
  }
  
  // Render schedules table
  function renderSchedules(schedules) {
    const tbody = document.getElementById('schedulesBody');
    
    if (!tbody) {
      console.warn('Element with id "schedulesBody" not found');
      return;
    }
    
    if (!schedules || schedules.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">ไม่พบตารางเวลา</td></tr>';
      return;
    }
    
    tbody.innerHTML = schedules.map(schedule => {
      const statusClass = `status-${schedule.status.toLowerCase()}`;
      const statusText = {
        'AVAILABLE': 'ว่าง',
        'BOOKED': 'จองแล้ว',
        'UNAVAILABLE': 'ไม่ว่าง',
        'BREAK': 'พัก'
      }[schedule.status] || schedule.status;
      
      // Format date
      const date = new Date(schedule.schedule_date);
      const dateText = date.toLocaleDateString('th-TH');
      
      return `
        <tr>
          <td>${dateText}</td>
          <td>${schedule.dentist_name}</td>
          <td>${schedule.unit_name}</td>
          <td>${schedule.time_slot}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>
            <div class="action-buttons">
              ${schedule.status === 'BOOKED' ? '' : `
                <button class="btn btn-warning btn-update" data-id="${schedule.id}" data-status="UNAVAILABLE">
                  ไม่ว่าง
                </button>
                <button class="btn btn-danger btn-delete" data-id="${schedule.id}">
                  ลบ
                </button>
              `}
              ${schedule.status === 'UNAVAILABLE' ? `
                <button class="btn btn-primary btn-update" data-id="${schedule.id}" data-status="AVAILABLE">
                  ว่าง
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    // Add event listeners to action buttons
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', function() {
        deleteSchedule(this.dataset.id);
      });
    });
    
    document.querySelectorAll('.btn-update').forEach(btn => {
      btn.addEventListener('click', function() {
        updateScheduleStatus(this.dataset.id, this.dataset.status);
      });
    });
  }
  
  // Add single schedule
  async function addSchedule(formData) {
    try {
      const response = await fetch('/staff/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      
      alert('เพิ่มตารางเวลาสำเร็จ');
      document.getElementById('addScheduleForm')?.reset();
      await loadSchedules();
      
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  }
  
  // Add bulk schedules
  async function addBulkSchedules(formData) {
    try {
      const response = await fetch('/staff/api/schedules/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      
      alert(result.message);
      document.getElementById('bulkAddForm')?.reset();
      await loadSchedules();
      
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  }
  
  // Delete schedule
  async function deleteSchedule(scheduleId) {
    if (!confirm('ยืนยันการลบตารางเวลานี้?')) return;
    
    try {
      const response = await fetch(`/staff/api/schedules/${scheduleId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      
      alert('ลบตารางเวลาสำเร็จ');
      await loadSchedules();
      
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  }
  
  // Update schedule status
  async function updateScheduleStatus(scheduleId, status) {
    const statusText = status === 'AVAILABLE' ? 'ว่าง' : 'ไม่ว่าง';
    
    if (!confirm(`ยืนยันการเปลี่ยนสถานะเป็น "${statusText}"?`)) return;
    
    try {
      const response = await fetch(`/staff/api/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      
      alert('อัปเดตสถานะสำเร็จ');
      await loadSchedules();
      
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Add single schedule form
    const addScheduleForm = document.getElementById('addScheduleForm');
    if (addScheduleForm) {
      addScheduleForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = {
          dentist_id: document.getElementById('dentistSelect')?.value,
          unit_id: document.getElementById('unitSelect')?.value,
          schedule_date: document.getElementById('scheduleDate')?.value,
          time_slot: document.getElementById('timeSlotSelect')?.value,
          status: document.getElementById('statusSelect')?.value
        };
        
        // Validate required fields
        if (!formData.dentist_id || !formData.unit_id || !formData.schedule_date || !formData.time_slot) {
          alert('กรุณากรอกข้อมูลให้ครบถ้วน');
          return;
        }
        
        addSchedule(formData);
      });
    } else {
      console.warn('Form with id "addScheduleForm" not found');
    }
    
    // Add bulk schedules form
    const bulkAddForm = document.getElementById('bulkAddForm');
    if (bulkAddForm) {
      bulkAddForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const selectedSlots = Array.from(document.querySelectorAll('input[name="timeSlots"]:checked'))
          .map(checkbox => checkbox.value);
        
        if (selectedSlots.length === 0) {
          alert('กรุณาเลือกอย่างน้อยหนึ่งช่วงเวลา');
          return;
        }
        
        const formData = {
          dentist_id: document.getElementById('bulkDentist')?.value,
          unit_id: document.getElementById('bulkUnit')?.value,
          schedule_date: document.getElementById('bulkDate')?.value,
          time_slots: selectedSlots,
          status: 'AVAILABLE'
        };
        
        // Validate required fields
        if (!formData.dentist_id || !formData.unit_id || !formData.schedule_date) {
          alert('กรุณากรอกข้อมูลให้ครบถ้วน');
          return;
        }
        
        addBulkSchedules(formData);
      });
    } else {
      console.warn('Form with id "bulkAddForm" not found');
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('btnRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadSchedules);
    } else {
      console.warn('Button with id "btnRefresh" not found');
    }
    
    // Filter changes
    const filterDate = document.getElementById('filterDate');
    if (filterDate) {
      filterDate.addEventListener('change', loadSchedules);
    }
    
    const filterDentist = document.getElementById('filterDentist');
    if (filterDentist) {
      filterDentist.addEventListener('change', loadSchedules);
    }
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    
    const scheduleDate = document.getElementById('scheduleDate');
    if (scheduleDate) scheduleDate.value = today;
    
    const bulkDate = document.getElementById('bulkDate');
    if (bulkDate) bulkDate.value = today;
    
    const filterDateInput = document.getElementById('filterDate');
    if (filterDateInput) filterDateInput.value = today;
  }
});