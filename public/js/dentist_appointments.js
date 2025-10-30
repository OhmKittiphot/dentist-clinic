document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('selectedDate');
    const btnToday = document.getElementById('btnToday');

    // ตั้งค่าวันนี้เป็นค่าเริ่มต้น
    if (!dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // ปุ่ม "วันนี้"
    btnToday.addEventListener('click', function() {
        dateInput.value = new Date().toISOString().split('T')[0];
        loadAppointments();
    });

    // เมื่อเปลี่ยนวันที่
    dateInput.addEventListener('change', function() {
        loadAppointments();
    });

    function loadAppointments() {
        const date = dateInput.value;
        if (date) {
            window.location.href = `/dentist/dentist_appointments?date=${date}`;
        }
    }

    // ฟังก์ชันอัพเดทสถานะนัดหมาย
    window.updateStatus = async function(id, status) {
        if (!confirm('ยืนยันการเปลี่ยนสถานะนัดหมาย?')) {
            return;
        }

        try {
            const res = await fetch(`/dentist/appointments/${id}/status`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''
                },
                body: JSON.stringify({ status })
            });
            
            const data = await res.json();
            if (data.success) {
                alert('อัพเดทสถานะสำเร็จ');
                location.reload();
            } else {
                alert(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (err) {
            console.error('Error:', err);
            alert('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
        }
    };
});