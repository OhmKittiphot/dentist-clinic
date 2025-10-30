// Patient
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

// ===== Middleware เหมือนเดิม =====
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
      console.error(`No patient record found for user with user_id: ${userId}`);
      return res.status(403).send('Access denied. No patient record associated with this account.');
    }
    req.user.patient_id = row.id;
    next();
  });
};

// Apply middleware
router.use(fetchPatientId);

// ===== Dashboard & appointments (เหมือนเดิม) =====
router.get('/dashboard', allowRoles('patient'), async (req, res, next) => {
  try {
    const patientId = req.user.patient_id;
    if (!patientId) return res.status(403).send('Could not identify patient account.');

    const appointmentSql = `
      SELECT * 
      FROM visits 
      WHERE patient_id = ? AND visit_date >= date('now')
      ORDER BY visit_date ASC
      LIMIT 1;
    `;
    const appointment = await new Promise((resolve, reject) => {
      db.get(appointmentSql, [patientId], (err, row) => err ? reject(err) : resolve(row));
    });

    if (appointment) {
      const dentistSql = `SELECT (first_name || ' ' || last_name) as name FROM dentists WHERE user_id = ?`;
      const doctor = await new Promise((resolve, reject) => {
        db.get(dentistSql, [appointment.doctor_id], (err, row) => err ? reject(err) : resolve(row));
      });
      appointment.doctor_name = doctor ? doctor.name : 'Unknown Dentist';
    }

    const paymentSql = `
      SELECT p.*
      FROM payments p
      JOIN visits v ON p.visit_id = v.id
      WHERE v.patient_id = ? AND p.status = 'pending'
      ORDER BY p.payment_date DESC
      LIMIT 1;
    `;
    const payment = await new Promise((resolve, reject) => {
      db.get(paymentSql, [patientId], (err, row) => err ? reject(err) : resolve(row));
    });

    res.render('patient/dashboard', {
      user: req.user,
      userRole: req.user.role,
      page: 'dashboard',
      appointment,
      payment
    });
  } catch (err) {
    console.error("Error in /patient/dashboard route:", err.message);
    next(err);
  }
});

router.get('/appointments', allowRoles('patient'), (req, res) => {
  res.send('<h1>หน้านี้ยังไม่เสร็จ</h1><a href="/patient/dashboard">กลับไปแดชบอร์ด</a>');
});

// ====== NEW: Payments list + Date filter ======
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

// ====== NEW: Pay a pending payment (Patient can mark as paid for own record) ======
router.post('/payments/:id/pay', allowRoles('patient'), (req, res, next) => {
  const paymentId = req.params.id;
  const patientId = req.user.patient_id;

  // ตรวจสอบว่ารายการชำระเงินนี้เป็นของผู้ป่วยคนนี้จริง และยัง pending อยู่
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
      // กลับไปพร้อมข้อความ
      const back = `/patient/payments?success=${encodeURIComponent('รายการนี้ชำระแล้วอยู่แล้ว')}`;
      return res.redirect(back);
    }

    // อัปเดตเป็น paid + เวลาเดี๋ยวนี้
    const updSql = `
      UPDATE payments
      SET status = 'paid',
          payment_date = datetime('now')
      WHERE id = ?;
    `;
    db.run(updSql, [paymentId], (err2) => {
      if (err2) return next(err2);

      // รักษาค่า filter เดิมถ้ามี
      const q = [];
      if (req.query.date_from) q.push(`date_from=${encodeURIComponent(req.query.date_from)}`);
      if (req.query.date_to) q.push(`date_to=${encodeURIComponent(req.query.date_to)}`);
      q.push(`success=${encodeURIComponent('ชำระเงินสำเร็จ')}`);
      const back = `/patient/payments${q.length ? '?' + q.join('&') : ''}`;
      res.redirect(back);
    });
  });
});


router.get('/patient_appointment', allowRoles('patient'), (req, res) => {
  const userId = req.user.id;
  
  // ดึงข้อมูลผู้ป่วยจากตาราง patients โดยใช้ user_id
  const patientSql = `
    SELECT pre_name, first_name, last_name, phone, email 
    FROM patients 
    WHERE user_id = ?
  `;

  // ดึงบริการจากตาราง procedure_codes
  const servicesSql = `
    SELECT code, description, default_price, category 
    FROM procedure_codes 
    ORDER BY category, description
  `;

  db.get(patientSql, [userId], (err, patient) => {
    if (err) {
      console.error('Error fetching patient data:', err);
      // ถ้า error ก็ยังให้แสดงหน้าได้ แต่ไม่มีข้อมูล pre-filled
      return getServices(null);
    }

    console.log('Patient data found:', patient);
    getServices(patient);
  });

  function getServices(patient) {
    db.all(servicesSql, [], (err, services) => {
      if (err) {
        console.error('Error fetching services:', err);
        services = [];
      }

      // จัดกลุ่มบริการตาม category
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

// POST /patient/appointment-request
router.post('/appointment-request', allowRoles('patient'), (req, res) => {
  console.log('POST /patient/appointment-request called with:', req.body);
  
  const {
    requested_date,
    requested_time_slot,
    treatment,
    notes
  } = req.body;

  // Validation
  if (!requested_date || !requested_time_slot || !treatment) {
    console.error('Missing required fields:', { requested_date, requested_time_slot, treatment });
    return res.status(400).json({
      success: false,
      error: 'กรุณากรอกข้อมูลการนัดหมายให้ครบถ้วน'
    });
  }

  const userId = req.user.id;
  if (!userId) {
    console.error('No user_id found in request');
    return res.status(400).json({
      success: false,
      error: 'ไม่พบข้อมูลผู้ใช้งาน'
    });
  }

  console.log('Looking for patient with user_id:', userId);

  // ดึงข้อมูล patient_id ที่ถูกต้องจากตาราง patients โดยใช้ user_id
  const getPatientSql = `
    SELECT id
    FROM patients 
    WHERE user_id = ?
  `;
  
  db.get(getPatientSql, [userId], (err, patient) => {
    if (err) {
      console.error('Database error fetching patient:', err);
      return res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย: ' + err.message
      });
    }

    if (!patient) {
      console.error('Patient not found with user_id:', userId);
      return res.status(400).json({
        success: false,
        error: 'ไม่พบข้อมูลผู้ป่วยในระบบ'
      });
    }

    console.log('Found patient ID:', patient.id);

    // Insert into appointment_requests table - ใช้เฉพาะ column ที่มีอยู่จริง
    const sql = `
      INSERT INTO appointment_requests (
        patient_id, requested_date, requested_time_slot, treatment, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [
      patient.id, // patient_id
      requested_date,
      requested_time_slot,
      treatment,
      notes || null,
      'NEW'
    ];

    console.log('Executing SQL with params:', params);

    db.run(sql, params, function(err) {
      if (err) {
        console.error('Database error creating appointment request:', err);
        console.error('SQL Error details:', err.message);
        
        return res.status(500).json({
          success: false,
          error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message
        });
      }

      console.log('Appointment request created successfully, ID:', this.lastID);
      
      res.json({
        success: true,
        requestId: this.lastID,
        message: 'ส่งคำขอนัดหมายสำเร็จ'
      });
    });
  });
});

// GET /patient/appointment-history (optional - for viewing request history)
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
