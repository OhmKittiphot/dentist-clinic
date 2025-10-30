// routes/patient.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

/* ---------- เติม patient_id ลงใน req.user ---------- */
const fetchPatientId = (req, res, next) => {
  if (!req.user || req.user.role !== 'patient') return next();

  const userId = req.user.id;
  const sql = `SELECT id FROM patients WHERE user_id = ?`;

  db.get(sql, [userId], (err, row) => {
    if (err) {
      console.error('Database error while fetching patient ID:', err.message);
      return res.status(500).send('Server Error');
    }
    if (!row) {
      console.error(`No patient record found for user_id: ${userId}`);
      return res.status(403).send('Access denied. No patient record associated with this account.');
    }
    req.user.patient_id = row.id;
    next();
  });
};

router.use(fetchPatientId);

/* =========================================================================
   DASHBOARD: นัดหมายครั้งถัดไป
   ลำดับความสำคัญ:
   1) ดึงจาก appointments (status: pending/confirmed)
   2) ถ้าไม่เจอ ให้ fallback ไปดู appointment_requests ที่วันที่ >= วันนี้ (NEW/PENDING)
   ========================================================================= */
router.get('/dashboard', allowRoles('patient'), async (req, res, next) => {
  try {
    const patientId = req.user.patient_id;
    if (!patientId) return res.status(403).send('Could not identify patient account.');

    // 1) หานัดจริงใน appointments
    const apptSql = `
      SELECT 
        a.id,
        a.start_time,
        a.end_time,
        a.status,
        a.notes,
        (d.first_name || ' ' || d.last_name) AS dentist_name,
        du.unit_name AS unit_name,
        0 AS is_request
      FROM appointments a
      JOIN dentists d        ON d.id = a.dentist_id
      LEFT JOIN dental_units du ON du.id = a.unit_id
      WHERE a.patient_id = ?
        AND datetime(a.start_time) >= datetime('now')
        AND UPPER(a.status) IN ('PENDING','CONFIRMED')
      ORDER BY datetime(a.start_time) ASC
      LIMIT 1;
    `;
    const appointment = await new Promise((resolve, reject) => {
      db.get(apptSql, [patientId], (err, row) => err ? reject(err) : resolve(row || null));
    });

    let appointmentOrRequest = appointment;

    // 2) ถ้าไม่มีนัดจริง ให้ดูคำขอที่ยังไม่ถึงกำหนด (แสดงเป็น "รอยืนยัน")
    if (!appointmentOrRequest) {
      const reqSql = `
        SELECT id, requested_date, requested_time_slot, treatment, notes, status
        FROM appointment_requests
        WHERE patient_id = ?
          AND date(requested_date) >= date('now')
          AND UPPER(COALESCE(status,'NEW')) IN ('NEW','PENDING')
        ORDER BY date(requested_date) ASC, requested_time_slot ASC
        LIMIT 1;
      `;
      const reqRow = await new Promise((resolve, reject) => {
        db.get(reqSql, [patientId], (err, row) => err ? reject(err) : resolve(row || null));
      });

      if (reqRow) {
        // แปลงเป็น object ที่หน้าจออ่านได้เหมือน appointments
        // slot รูปแบบ "HH:MM-HH:MM"
        const start = `${reqRow.requested_date} ${reqRow.requested_time_slot.substring(0,5)}:00`;
        const end   = `${reqRow.requested_date} ${reqRow.requested_time_slot.substring(6,11)}:00`;
        appointmentOrRequest = {
          id: reqRow.id,
          start_time: start,
          end_time: end,
          status: 'pending',          // แสดงเป็นรอยืนยัน
          notes: reqRow.notes || `คำขอ: ${reqRow.treatment || ''}`,
          dentist_name: null,         // ยังไม่ระบุ
          unit_name: null,            // ยังไม่ระบุ
          is_request: 1               // ธงไว้ให้ template แสดงข้อความพิเศษ
        };
      }
    }

    // ยอดค้างชำระล่าสุด (ถ้ามี)
    const paymentSql = `
      SELECT p.*
      FROM payments p
      JOIN visits v ON p.visit_id = v.id
      WHERE v.patient_id = ? AND p.status = 'pending'
      ORDER BY COALESCE(p.payment_date, '0001-01-01') DESC, p.id DESC
      LIMIT 1;
    `;
    const payment = await new Promise((resolve, reject) => {
      db.get(paymentSql, [patientId], (err, row) => err ? reject(err) : resolve(row || null));
    });

    res.render('patient/dashboard', {
      user: req.user,
      userRole: req.user.role,
      page: 'dashboard',
      appointment: appointmentOrRequest,
      payment
    });
  } catch (err) {
    console.error("Error in /patient/dashboard route:", err.message);
    next(err);
  }
});

/* =================== หน้ารายการนัดหมายทั้งหมด (placeholder) =================== */
router.get('/appointments', allowRoles('patient'), (req, res) => {
  res.send('<h1>หน้านี้ยังไม่เสร็จ</h1><a href="/patient/dashboard">กลับไปแดชบอร์ด</a>');
});

/* =================== Payments list + Date filter =================== */
router.get('/payments', allowRoles('patient'), async (req, res, next) => {
  try {
    const patientId = req.user.patient_id;
    if (!patientId) return res.status(500).send('Could not identify patient.');

    const date_from = req.query.date_from || '';
    const date_to = req.query.date_to || '';
    const successMessage = req.query.success || '';

    const whereClauses = ['v.patient_id = ?'];
    const params = [patientId];

    if (date_from) {
      whereClauses.push("date(p.payment_date) >= date(?)");
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push("date(p.payment_date) <= date(?)");
      params.push(date_to);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const sql = `
      SELECT p.id, p.amount, p.payment_date, p.status
      FROM payments p
      JOIN visits v ON p.visit_id = v.id
      ${whereSql}
      ORDER BY COALESCE(p.payment_date, '0001-01-01') DESC, p.id DESC;
    `;

    const payments = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });

    res.render('patient/payments', {
      user: req.user,
      userRole: req.user.role,
      page: 'payments',
      payments,
      date_from,
      date_to,
      successMessage
    });

  } catch (err) {
    next(err);
  }
});

/* =================== ชำระเงิน (เปลี่ยนสถานะ) =================== */
router.post('/payments/:id/pay', allowRoles('patient'), (req, res, next) => {
  const paymentId = req.params.id;
  const patientId = req.user.patient_id;

  const checkSql = `
    SELECT p.id, p.status
    FROM payments p
    JOIN visits v ON p.visit_id = v.id
    WHERE p.id = ? AND v.patient_id = ?;
  `;

  db.get(checkSql, [paymentId, patientId], (err, row) => {
    if (err) return next(err);
    if (!row) return res.status(403).send('Forbidden: not your payment.');
    if (row.status === 'paid') {
      const back = `/patient/payments?success=${encodeURIComponent('รายการนี้ชำระแล้วอยู่แล้ว')}`;
      return res.redirect(back);
    }

    const updSql = `
      UPDATE payments
      SET status = 'paid',
          payment_date = datetime('now')
      WHERE id = ?;
    `;
    db.run(updSql, [paymentId], (err2) => {
      if (err2) return next(err2);

      const q = [];
      if (req.query.date_from) q.push(`date_from=${encodeURIComponent(req.query.date_from)}`);
      if (req.query.date_to) q.push(`date_to=${encodeURIComponent(req.query.date_to)}`);
      q.push(`success=${encodeURIComponent('ชำระเงินสำเร็จ')}`);
      const back = `/patient/payments${q.length ? '?' + q.join('&') : ''}`;
      res.redirect(back);
    });
  });
});

/* =================== ฟอร์มขอนัด (ผู้ป่วยส่งคำขอ) =================== */
router.get('/patient_appointment', allowRoles('patient'), (req, res) => {
  const userId = req.user.id;

  const patientSql = `
    SELECT pre_name, first_name, last_name, phone, email 
    FROM patients 
    WHERE user_id = ?
  `;

  const servicesSql = `
    SELECT code, description, default_price, category 
    FROM procedure_codes 
    ORDER BY category, description
  `;

  db.get(patientSql, [userId], (err, patient) => {
    if (err) {
      console.error('Error fetching patient data:', err);
      return getServices(null);
    }
    getServices(patient);
  });

  function getServices(patient) {
    db.all(servicesSql, [], (err, services) => {
      if (err) {
        console.error('Error fetching services:', err);
        services = [];
      }

      const servicesByCategory = {};
      services.forEach(service => {
        if (!servicesByCategory[service.category]) {
          servicesByCategory[service.category] = [];
        }
        servicesByCategory[service.category].push(service);
      });

      res.render('patient/patient_appointment', {
        user: req.user,
        userRole: req.user.role,
        page: 'patient_appointment',
        patient: patient,
        servicesByCategory: servicesByCategory,
        services: services
      });
    });
  }
});

/* =================== ผู้ป่วยส่งคำขอนัด =================== */
router.post('/appointment-request', allowRoles('patient'), (req, res) => {
  const { requested_date, requested_time_slot, treatment, notes } = req.body;

  if (!requested_date || !requested_time_slot || !treatment) {
    return res.status(400).json({
      success: false,
      error: 'กรุณากรอกข้อมูลการนัดหมายให้ครบถ้วน'
    });
  }

  const userId = req.user.id;
  const getPatientSql = `SELECT id FROM patients WHERE user_id = ?`;

  db.get(getPatientSql, [userId], (err, patient) => {
    if (err) {
      console.error('Database error fetching patient:', err);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย: ' + err.message
      });
    }

    if (!patient) {
      return res.status(400).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วยในระบบ'
      });
    }

    const sql = `
      INSERT INTO appointment_requests (
        patient_id, requested_date, requested_time_slot, treatment, notes, status
      ) VALUES (?, ?, ?, ?, ?, 'NEW')
    `;
    const params = [patient.id, requested_date, requested_time_slot, treatment, notes || null];

    db.run(sql, params, function(err2) {
      if (err2) {
        console.error('Database error creating appointment request:', err2);
        return res.status(500).json({
          success: false,
          error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err2.message
        });
      }

      res.json({
        success: true,
        requestId: this.lastID,
        message: 'ส่งคำขอนัดหมายสำเร็จ'
      });
    });
  });
});

/* =================== ประวัติคำขอนัด =================== */
router.get('/appointment-history', allowRoles('patient'), (req, res) => {
  const patientId = req.user.patient_id;

  const sql = `
    SELECT 
      id,
      requested_date,
      requested_time_slot,
      treatment,
      notes,
      status,
      created_at
    FROM appointment_requests 
    WHERE patient_id = ?
    ORDER BY created_at DESC
  `;

  db.all(sql, [patientId], (err, requests) => {
    if (err) {
      console.error('Error fetching appointment history:', err);
      return res.status(500).send('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    }

    res.render('patient/appointment_history', {
      user: req.user,
      userRole: req.user.role,
      page: 'appointment_history',
      requests: requests
    });
  });
});

module.exports = router;
