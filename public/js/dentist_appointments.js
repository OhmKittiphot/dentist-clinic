document.addEventListener('DOMContentLoaded', function () {
    const dateInput = document.getElementById('selectedDate');
    const btnToday = document.getElementById('btnToday');

    // ปุ่มวันนี้
    btnToday.addEventListener('click', function () {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        window.location.href = `/dentist/appointments?date=${today}`;
    });

    // เปลี่ยนวันที่
    dateInput.addEventListener('change', function () {
        window.location.href = `/dentist/appointments?date=${this.value}`;
    });

    // เพิ่มการแจ้งเตือนหากเป็นวันที่ในอดีต
    const selectedDate = new Date(dateInput.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
        // สามารถเพิ่มการแจ้งเตือนที่นี่ได้
        console.log('แสดงนัดหมายในอดีต');
    }
});

// ฟังก์ชัน helper สำหรับแสดงสถานะภาษาไทย
function getStatusText(status) {
    const statusMap = {
        'PENDING': 'รอการยืนยัน',
        'CONFIRMED': 'ยืนยันแล้ว',
        'COMPLETED': 'เสร็จสิ้น',
        'CANCELLED': 'ยกเลิก'
    };
    return statusMap[status] || status;
}