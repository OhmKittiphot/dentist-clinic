document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('appointmentForm');
    const confirmModal = document.getElementById('confirmModal');
    const confirmDetails = document.getElementById('confirmDetails');
    const btnSubmit = document.getElementById('btnSubmit');
    const btnCancel = document.getElementById('btnCancel');
    const btnModalCancel = document.getElementById('btnModalCancel');
    const btnModalConfirm = document.getElementById('btnModalConfirm');


    // Set minimum date to today
    const dateInput = document.getElementById('requestedDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;

    // ตรวจสอบว่ามีข้อมูลผู้ป่วย pre-filled หรือไม่
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const hasPreFilledData = firstNameInput.value && lastNameInput.value;

    // ถ้ามีข้อมูล pre-filled ให้ disable validation บาง field
    if (hasPreFilledData) {
        console.log('พบข้อมูลผู้ป่วยจากระบบแล้ว');
        // Mark pre-filled fields as validated
        markFieldAsValid(firstNameInput);
        markFieldAsValid(lastNameInput);
    }

    // Form submit handler
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Validate all fields before showing modal
        if (validateAllFields()) {
            showConfirmationModal();
        }
    });

    // Cancel button handler
    btnCancel.addEventListener('click', function() {
        if (confirm('ยกเลิกการกรอกข้อมูล? ข้อมูลที่กรอกจะหายไป')) {
            window.location.href = '/patient/dashboard';
        }
    });

    // Modal cancel button handler
    btnModalCancel.addEventListener('click', function() {
        confirmModal.style.display = 'none';
    });

    // Modal confirm button handler
    btnModalConfirm.addEventListener('click', function() {
        submitAppointmentRequest();
    });

    function validateAllFields() {
        let isValid = true;
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            // ข้าม validation สำหรับ field ที่ readonly (ข้อมูลจากระบบ)
            if (field.readOnly) {
                return;
            }
            
            if (!validateField({ target: field })) {
                isValid = false;
                // Scroll to first error
                if (isValid) {
                    field.focus();
                }
            }
        });
        
        return isValid;
    }

    function showConfirmationModal() {
        const formData = new FormData(form);
        const details = {
            preName: formData.get('preName'),
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            phone: formData.get('phone'),
            email: formData.get('email'),
            requestedDate: formData.get('requestedDate'),
            requestedTime: formData.get('requestedTime'),
            treatment: formData.get('treatment'),
            notes: formData.get('notes')
        };

        // Format date for display
        const date = new Date(details.requestedDate);
        const formattedDate = date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // วันของสัปดาห์
        const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
        const dayName = days[date.getDay()];

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
                <p><strong>หมายเหตุ:</strong> ${details.notes || 'ไม่มี'}</p>
            </div>
            
        `;

        confirmModal.style.display = 'flex';
    }

    async function submitAppointmentRequest() {
        const formData = new FormData(form);
        
        // สร้าง request data - ส่งเฉพาะ field ที่จำเป็น
        const requestData = {
            requested_date: formData.get('requestedDate'),
            requested_time_slot: formData.get('requestedTime'),
            treatment: formData.get('treatment'),
            notes: formData.get('notes') || ''
        };

        // เพิ่มข้อมูลส่วนตัวถ้าไม่มีข้อมูล pre-filled
        if (!hasPreFilledData) {
            requestData.pre_name = formData.get('preName');
            requestData.first_name = formData.get('firstName');
            requestData.last_name = formData.get('lastName');
            requestData.phone = formData.get('phone');
            requestData.email = formData.get('email');
        }

        try {
            // Disable button and show loading
            btnModalConfirm.disabled = true;
            btnModalConfirm.textContent = 'กำลังส่ง...';
            btnModalConfirm.style.opacity = '0.7';

            const response = await fetch('/patient/appointment-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                showSuccessMessage();
            } else {
                throw new Error(result.error || 'เกิดข้อผิดพลาดในการส่งคำขอ');
            }

        } catch (error) {
            console.error('Error submitting appointment request:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            // Reset button state
            btnModalConfirm.disabled = false;
            btnModalConfirm.textContent = 'ยืนยันส่งคำขอ';
            btnModalConfirm.style.opacity = '1';
        }
    }

    function showSuccessMessage() {
        confirmModal.style.display = 'none';
        
        // Create success message
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <h3 style="color: var(--success); margin-bottom: 15px;">✅ ส่งคำขอนัดหมายสำเร็จ!</h3>
                <p>ระบบได้รับคำขอนัดหมายของคุณแล้ว กรุณารอการติดต่อกลับจากคลินิก</p>
                <p>คุณสามารถตรวจสอบสถานะได้ที่เมนูการนัดหมาย</p>
                <p style="font-size: 0.9rem; color: var(--secondary); margin-top: 15px;">
                    จะกลับไปหน้าแดชบอร์ดใน <span id="countdown">5</span> วินาที...
                </p>
            </div>
        `;

        // Insert success message before form
        form.parentNode.insertBefore(successDiv, form);
        
        // Hide form
        form.style.display = 'none';
        
        // Hide form actions
        document.querySelector('.form-actions').style.display = 'none';
        
        // Show back to dashboard button
        const backButton = document.createElement('button');
        backButton.className = 'btn btn-primary';
        backButton.textContent = 'กลับไปหน้าแดชบอร์ดทันที';
        backButton.onclick = () => {
            window.location.href = '/patient/dashboard';
        };
        
        form.parentNode.appendChild(backButton);

        // Auto redirect countdown
        let countdown = 5;
        const countdownElement = document.getElementById('countdown');
        
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdownElement) {
                countdownElement.textContent = countdown;
            }
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                window.location.href = '/patient/dashboard';
            }
        }, 1000);
    }

    // Real-time form validation
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        // ไม่ต้องเพิ่ม event listener สำหรับ field ที่ readonly
        if (!input.readOnly) {
            input.addEventListener('blur', validateField);
            input.addEventListener('input', validateField);
        }
    });

    function validateField(e) {
        const field = e.target;
        
        // ข้าม validation สำหรับ field ที่ readonly
        if (field.readOnly) {
            return true;
        }
        
        const value = field.value.trim();
        
        if (field.required && !value) {
            showFieldError(field, 'กรุณากรอกข้อมูลในช่องนี้');
            return false;
        }

        if (field.type === 'email' && value && !isValidEmail(value)) {
            showFieldError(field, 'กรุณากรอกอีเมลให้ถูกต้อง');
            return false;
        }

        if (field.type === 'tel' && value && !isValidPhone(value)) {
            showFieldError(field, 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (9-10 หลัก)');
            return false;
        }

        // Validation พิเศษสำหรับวันที่
        if (field.type === 'date' && value) {
            const selectedDate = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (selectedDate < today) {
                showFieldError(field, 'ไม่สามารถเลือกวันที่ในอดีตได้');
                return false;
            }
        }

        clearFieldError(field);
        markFieldAsValid(field);
        return true;
    }

    function markFieldAsValid(field) {
        field.style.borderColor = 'var(--success)';
        field.style.backgroundColor = '#f8fff8';
    }

    function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    function isValidPhone(phone) {
        const re = /^[0-9]{9,10}$/;
        return re.test(phone.replace(/-/g, ''));
    }

    function showFieldError(field, message) {
        clearFieldError(field);
        field.style.borderColor = 'var(--danger)';
        field.style.backgroundColor = '#fff8f8';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.style.color = 'var(--danger)';
        errorDiv.style.fontSize = '0.875rem';
        errorDiv.style.marginTop = '5px';
        errorDiv.textContent = message;
        
        field.parentNode.appendChild(errorDiv);
    }

    function clearFieldError(field) {
        field.style.borderColor = 'var(--border)';
        field.style.backgroundColor = '';
        
        const existingError = field.parentNode.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }
    }

    // เพิ่มในส่วน DOMContentLoaded
const treatmentSelect = document.getElementById('treatment');
const priceNote = document.getElementById('priceNote');
const notesTextarea = document.getElementById('notes');

// เมื่อเลือกบริการ
treatmentSelect.addEventListener('change', function() {
    const selectedOption = this.options[this.selectedIndex];
    const price = selectedOption.getAttribute('data-price');
    const serviceName = selectedOption.value;
    
    if (price && serviceName !== 'อื่นๆ') {
        priceNote.textContent = `💰 ราคาประมาณ: ${Number(price).toLocaleString()} บาท`;
        priceNote.style.display = 'block';
        priceNote.style.color = 'var(--success)';
    } else {
        priceNote.style.display = 'none';
    }
    
    if (serviceName === 'อื่นๆ') {
        notesTextarea.placeholder = 'กรุณาระบุบริการที่ต้องการ...';
        notesTextarea.focus();
    } else {
        notesTextarea.placeholder = 'ระบุอาการหรือข้อความเพิ่มเติม...';
    }
});

// ในส่วน showConfirmationModal() ให้แสดงราคาด้วย
function showConfirmationModal() {
    const formData = new FormData(form);
    const treatmentSelect = document.getElementById('treatment');
    const selectedOption = treatmentSelect.options[treatmentSelect.selectedIndex];
    const price = selectedOption.getAttribute('data-price');
    
    const details = {
        preName: formData.get('preName'),
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        requestedDate: formData.get('requestedDate'),
        requestedTime: formData.get('requestedTime'),
        treatment: formData.get('treatment'),
        notes: formData.get('notes'),
        price: price
    };

    // Format date for display
    const date = new Date(details.requestedDate);
    const formattedDate = date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // วันของสัปดาห์
    const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const dayName = days[date.getDay()];

    // สร้าง HTML สำหรับแสดงราคา
    let priceHtml = '';
    if (details.price && details.treatment !== 'อื่นๆ') {
        priceHtml = `<p><strong>ราคาประมาณ:</strong> ${Number(details.price).toLocaleString()} บาท</p>`;
    }

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
});