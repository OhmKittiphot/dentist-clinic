document.addEventListener('DOMContentLoaded', function() {
  // ตัวแปร global
  let currentAppointmentId = null;
  
  // โหลดข้อมูลประวัติการนัดหมาย
  loadRecentAppointments();
  loadStatistics();

  // ยกเลิกนัดหมาย
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('btn-cancel')) {
      cancelAppointment(e.target.dataset.id);
    }
  });

  // เลื่อนนัดหมาย
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('btn-reschedule')) {
      openRescheduleModal(e.target.dataset.id);
    }
  });

  // Modal events
  const modal = document.getElementById('rescheduleModal');
  const btnRsCancel = document.getElementById('btnRsCancel');
  const rescheduleForm = document.getElementById('rescheduleForm');

  btnRsCancel?.addEventListener('click', closeRescheduleModal);

  rescheduleForm?.addEventListener('submit', function(e) {
    e.preventDefault();
    submitReschedule();
  });

  // ปิด modal เมื่อคลิกนอกเนื้อหา
  modal?.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeRescheduleModal();
    }
  });

  // ฟังก์ชันโหลดประวัติการนัดหมายล่าสุด
  async function loadRecentAppointments() {
    try {
      const response = await fetch('/patient/appointment-history?limit=5');
      const data = await response.json();
      
      const container = document.getElementById('recentAppointments');
      const loading = document.getElementById('loadingAppointments');
      const empty = document.getElementById('emptyAppointments');

      if (loading) loading.style.display = 'none';

      if (!data.success || !data.requests || data.requests.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
      }

      container.innerHTML = data.requests.map(request => {
        const date = new Date(request.requested_date);
        const dateTh = date.toLocaleDateString('th-TH');
        const statusMap = {
          'NEW': 'รอจัดคิว',
          'PENDING': 'รอจัดคิว',
          'CONFIRMED': 'ยืนยันแล้ว',
          'CANCELLED': 'ยกเลิก',
          'COMPLETED': 'เสร็จสิ้น'
        };
        const statusText = statusMap[request.status] || request.status;
        const statusClass = request.status.toLowerCase();

        return `
          <tr>
            <td>${dateTh}</td>
            <td>${request.treatment}</td>
            <td><span class="status-chip ${statusClass}">${statusText}</span></td>
            <td>
              <div class="table-actions">
                ${request.status === 'NEW' || request.status === 'PENDING' ? `
                  <button class="btn-action btn-cancel-request" data-id="${request.id}" title="ยกเลิกคำขอ">
                    ❌
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // เพิ่ม event listener สำหรับปุ่มยกเลิกคำขอ
      document.querySelectorAll('.btn-cancel-request').forEach(btn => {
        btn.addEventListener('click', function() {
          cancelAppointmentRequest(this.dataset.id);
        });
      });

    } catch (error) {
      console.error('Error loading recent appointments:', error);
      const loading = document.getElementById('loadingAppointments');
      const empty = document.getElementById('emptyAppointments');
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.innerHTML = '<p>เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
        empty.style.display = 'block';
      }
    }
  }

  // ฟังก์ชันโหลดสถิติ
  async function loadStatistics() {
    try {
      const response = await fetch('/patient/dashboard-stats');
      const data = await response.json();
      
      if (data.success) {
        document.getElementById('totalAppointments').textContent = data.totalAppointments || 0;
        document.getElementById('completedAppointments').textContent = data.completedAppointments || 0;
        document.getElementById('pendingPayments').textContent = data.pendingPayments || 0;
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  }

  // ฟังก์ชันยกเลิกนัดหมาย
  async function cancelAppointment(appointmentId) {
    if (!confirm('ยืนยันการยกเลิกนัดหมายนี้?')) return;

    const btn = document.querySelector(`.btn-cancel[data-id="${appointmentId}"]`);
    if (btn) btn.disabled = true;

    try {
      const response = await fetch(`/patient/appointments/${appointmentId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'ยกเลิกนัดหมายไม่สำเร็จ');
      }
      
      alert('ยกเลิกนัดหมายสำเร็จ');
      location.reload();
      
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
      if (btn) btn.disabled = false;
    }
  }

  // ฟังก์ชันยกเลิกคำขอนัดหมาย
  async function cancelAppointmentRequest(requestId) {
    if (!confirm('ยืนยันการยกเลิกคำขอนัดหมายนี้?')) return;

    try {
      const response = await fetch(`/patient/appointment-requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'ยกเลิกคำขอไม่สำเร็จ');
      }
      
      alert('ยกเลิกคำขอนัดหมายสำเร็จ');
      loadRecentAppointments(); // รีเฟรชข้อมูล
      
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  }

  // ฟังก์ชันเปิด modal เลื่อนนัดหมาย
  function openRescheduleModal(appointmentId) {
    currentAppointmentId = appointmentId;
    const modal = document.getElementById('rescheduleModal');
    const form = document.getElementById('rescheduleForm');
    
    // รีเซ็ตฟอร์ม
    form.reset();
    
    // ตั้งค่าข้อมูลเริ่มต้น
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('rsDate').min = today;
    
    modal.style.display = 'flex';
  }

  // ฟังก์ชันปิด modal
  function closeRescheduleModal() {
    const modal = document.getElementById('rescheduleModal');
    modal.style.display = 'none';
    currentAppointmentId = null;
  }

  // ฟังก์ชันส่งคำขอเลื่อนนัดหมาย
  async function submitReschedule() {
    const form = document.getElementById('rescheduleForm');
    const formData = new FormData(form);
    
    const requestData = {
      requested_date: formData.get('rsDate'),
      requested_time_slot: formData.get('rsSlot'),
      notes: formData.get('rsNote') || ''
    };

    // Validation
    if (!requestData.requested_date || !requestData.requested_time_slot) {
      alert('กรุณาเลือกวันที่และช่วงเวลาใหม่');
      return;
    }

    const btnSubmit = document.getElementById('btnRsSubmit');
    const btnText = btnSubmit.querySelector('.btn-text');
    const btnLoading = btnSubmit.querySelector('.btn-loading');

    btnSubmit.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
      const response = await fetch(`/patient/appointments/${currentAppointmentId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'เลื่อนนัดหมายไม่สำเร็จ');
      }
      
      alert('เลื่อนนัดหมายสำเร็จ คลินิกจะยืนยันคิวใหม่อีกครั้ง');
      closeRescheduleModal();
      location.reload();
      
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      btnSubmit.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  }
});