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
});