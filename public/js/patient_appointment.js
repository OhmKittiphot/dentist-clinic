document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('appointmentForm');
  const confirmModal = document.getElementById('confirmModal');
  const confirmDetails = document.getElementById('confirmDetails');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnCancel = document.getElementById('btnCancel');
  const btnModalCancel = document.getElementById('btnModalCancel');
  const btnModalConfirm = document.getElementById('btnModalConfirm');

  // min date = today
  const dateInput = document.getElementById('requestedDate');
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;

  // Pre-filled
  const preNameSelect = document.getElementById('preName');
  const preNameHidden = document.getElementById('preNameHidden'); // อาจไม่มีถ้าไม่ได้ disabled
  const firstNameInput = document.getElementById('firstName');
  const lastNameInput = document.getElementById('lastName');

  const hasPreFilledName = firstNameInput.value && lastNameInput.value;
  if (hasPreFilledName) {
    markOK(firstNameInput);
    markOK(lastNameInput);
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (validateAllFields()) showConfirmationModal();
  });

  btnCancel.addEventListener('click', function() {
    if (confirm('ยกเลิกการกรอกข้อมูล? ข้อมูลที่กรอกจะหายไป')) {
      window.location.href = '/patient/dashboard';
    }
  });

  btnModalCancel.addEventListener('click', function() {
    confirmModal.style.display = 'none';
  });

  btnModalConfirm.addEventListener('click', function() {
    submitAppointmentRequest();
  });

  function validateAllFields() {
    let ok = true;
    // ข้ามฟิลด์ที่ disabled
    const requiredFields = Array.from(form.querySelectorAll('[required]')).filter(el => !el.disabled);
    requiredFields.forEach(field => {
      if (field.readOnly) return;
      if (!validateField({ target: field })) ok = false;
    });
    return ok;
  }

  function showConfirmationModal() {
    const formData = new FormData(form);
    // ถ้า select คำนำหน้าถูก disabled จะไม่มีใน FormData → ใช้ hidden แทน
    const preName = preNameHidden ? preNameHidden.value : (formData.get('preName') || '');
    const details = {
      preName: preName,
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      requestedDate: formData.get('requestedDate'),
      requestedTime: formData.get('requestedTime'),
      treatment: formData.get('treatment'),
      notes: formData.get('notes')
    };

    const date = new Date(details.requestedDate);
    const formattedDate = date.toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });
    const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
    const dayName = days[date.getDay()];

    const treatmentSelect = document.getElementById('treatment');
    const selectedOption = treatmentSelect.options[treatmentSelect.selectedIndex];
    const price = selectedOption ? selectedOption.getAttribute('data-price') : null;

    const priceHtml = (price && details.treatment !== 'อื่นๆ')
      ? `<p><strong>ราคาประมาณ:</strong> ${Number(price).toLocaleString()} บาท</p>` : '';

    confirmDetails.innerHTML = `
      <div class="confirmation-section">
        <h4>📋 ข้อมูลผู้ป่วย</h4>
        <p><strong>ชื่อ-สกุล:</strong> ${details.preName}${details.firstName} ${details.lastName}</p>
        <p><strong>เบอร์โทร:</strong> ${details.phone}</p>
        <p><strong>อีเมล:</strong> ${details.email || 'ไม่ระบุ'}</p>
      </div>
      <div class="confirmation-section">
        <h4>📅 ข้อมูลการนัดหมาย</h4>
        <p><strong>วันที่:</strong> ${formattedDate} (${dayName})</p>
        <p><strong>ช่วงเวลา:</strong> ${details.requestedTime}</p>
        <p><strong>บริการ:</strong> ${details.treatment}</p>
        ${priceHtml}
        <p><strong>หมายเหตุ:</strong> ${details.notes || 'ไม่มี'}</p>
      </div>
    `;
    confirmModal.style.display = 'flex';
  }

  async function submitAppointmentRequest() {
    const formData = new FormData(form);
    const body = {
      requested_date: formData.get('requestedDate'),
      requested_time_slot: formData.get('requestedTime'),
      treatment: formData.get('treatment'),
      notes: formData.get('notes') || ''
    };

    // เพิ่มคำนำหน้าลงไปแน่ๆ (จาก hidden ถ้ามี)
    body.pre_name = preNameHidden ? preNameHidden.value : (formData.get('preName') || '');

    // ถ้าไม่ได้ lock ชื่อ-นามสกุลไว้ ก็ส่งไปด้วย
    if (!firstNameInput.readOnly || !lastNameInput.readOnly) {
      body.first_name = formData.get('firstName');
      body.last_name = formData.get('lastName');
    }

    try {
      btnModalConfirm.disabled = true;
      btnModalConfirm.textContent = 'กำลังส่ง...';
      btnModalConfirm.style.opacity = '0.7';

      const resp = await fetch('/patient/appointment-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error || 'ส่งคำขอไม่สำเร็จ');

      confirmModal.style.display = 'none';
      const success = document.createElement('div');
      success.className = 'success-message';
      success.innerHTML = `
        <div style="text-align:center;padding:20px;">
          <h3 style="color: var(--success); margin-bottom: 15px;">✅ ส่งคำขอนัดหมายสำเร็จ!</h3>
          <p>ระบบได้รับคำขอแล้ว คลินิกจะติดต่อยืนยันอีกครั้ง</p>
          <p style="font-size:.9rem;color:var(--secondary)">กำลังกลับไปแดชบอร์ด…</p>
        </div>`;
      form.parentNode.insertBefore(success, form);
      form.style.display = 'none';
      setTimeout(()=>location.href='/patient/dashboard', 1200);
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      btnModalConfirm.disabled = false;
      btnModalConfirm.textContent = 'ยืนยันส่งคำขอ';
      btnModalConfirm.style.opacity = '1';
    }
  }

  // live validation
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach(el => {
    if (el.readOnly || el.disabled) return; // ข้าม disabled/readonly
    el.addEventListener('blur', validateField);
    el.addEventListener('input', validateField);
  });

  function validateField(e){
    const f = e.target;
    if (f.readOnly || f.disabled) return true;
    const v = (f.value||'').trim();

    if (f.required && !v){ return showErr(f,'กรุณากรอกข้อมูลในช่องนี้'); }
    if (f.type==='email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){ return showErr(f,'กรุณากรอกอีเมลให้ถูกต้อง'); }
    if (f.type==='tel' && v && !/^[0-9]{9,10}$/.test(v.replace(/-/g,''))){ return showErr(f,'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (9-10 หลัก)'); }
    if (f.type==='date' && v){
      const sd = new Date(v), td = new Date(); td.setHours(0,0,0,0);
      if (sd < td){ return showErr(f,'ไม่สามารถเลือกวันที่ในอดีตได้'); }
    }
    clearErr(f); markOK(f); return true;
  }

  function markOK(f){ f.style.borderColor='var(--success)'; f.style.backgroundColor='#f8fff8'; }
  function showErr(f,msg){ clearErr(f); f.style.borderColor='var(--danger)'; f.style.backgroundColor='#fff8f8';
    const d=document.createElement('div'); d.className='field-error'; d.style.color='var(--danger)';
    d.style.fontSize='.875rem'; d.style.marginTop='5px'; d.textContent=msg; f.parentNode.appendChild(d); return false; }
  function clearErr(f){ f.style.borderColor='var(--border)'; f.style.backgroundColor='';
    const ex=f.parentNode.querySelector('.field-error'); if (ex) ex.remove(); }

  // ราคาประมาณเมื่อเลือกบริการ
  const treatmentSelect = document.getElementById('treatment');
  const priceNote = document.getElementById('priceNote');
  const notesTextarea = document.getElementById('notes');
  treatmentSelect.addEventListener('change', function() {
    const opt = this.options[this.selectedIndex];
    const price = opt ? opt.getAttribute('data-price') : null;
    const name = opt ? opt.value : '';
    if (price && name !== 'อื่นๆ'){
      priceNote.textContent = `💰 ราคาประมาณ: ${Number(price).toLocaleString()} บาท`;
      priceNote.style.display = 'block';
      priceNote.style.color = 'var(--success)';
    } else {
      priceNote.style.display = 'none';
    }
    notesTextarea.placeholder = (name === 'อื่นๆ') ? 'กรุณาระบุบริการที่ต้องการ...' : 'ระบุอาการหรือข้อความเพิ่มเติม...';
  });
});
