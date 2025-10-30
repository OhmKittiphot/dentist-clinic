// routes/staff.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

/* ---------- Helper: เลือกชื่อตารางยูนิตแบบอัตโนมัติ ---------- */
function resolveUnitTable(cb) {
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = 'dental_units';",
    [],
    (err, row) => {
      if (err) return cb(err);
      cb(null, row ? 'dental_units' : 'units');
    }
  );
}

/* ===============================
 * 🔹 Patients List + Pagination
 * =============================== */
router.get('/patients', allowRoles('staff'), (req, res, next) => {
  const searchQuery = req.query.search || '';
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 15, 5), 100);
  const offset = (page - 1) * pageSize;
  const successMessage = req.query.success ? 'สร้างบัญชีผู้ป่วยใหม่สำเร็จแล้ว' : null;

  let countSql = `SELECT COUNT(id) AS count FROM patients`;
  let sql = `
    SELECT id, pre_name, first_name, last_name, phone, 
           printf('CN%04d', id) as clinic_number, 
           strftime('%d/%m/%Y', created_at) as created_at,
           (strftime('%Y', 'now') - strftime('%Y', birth_date)) - 
           (strftime('%m-%d', 'now') < strftime('%m-%d', birth_date)) AS age
    FROM patients
  `;

  const params = [];
  if (searchQuery) {
    const whereClause = ` WHERE first_name LIKE ? OR last_name LIKE ? OR printf('CN%04d', id) LIKE ? `;
    countSql += whereClause;
    sql += whereClause;
    const t = `%${searchQuery}%`;
    params.push(t, t, t);
  }

  db.get(countSql, params, (err, row) => {
    if (err) return next(err);
    const total = row?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    sql += ` ORDER BY first_name, last_name LIMIT ? OFFSET ?;`;
    db.all(sql, [...params, pageSize, offset], (err2, patients) => {
      if (err2) return next(err2);
      res.render('staff/index', {
        patients,
        user: req.user,
        userRole: req.user.role,
        searchQuery,
        page,
        pageSize,
        total,
        totalPages,
        successMessage,
        pageId: 'patients'
      });
    });
  });
});

/* ===============================
 * 🔹 Edit Patient
 * =============================== */
router.get('/patients/:id/edit', allowRoles('staff'), (req, res, next) => {
  const patientId = req.params.id;
  const sql = "SELECT *, printf('CN%04d', id) as clinic_number FROM patients WHERE id = ?";
  db.get(sql, [patientId], (err, patient) => {
    if (err) return next(err);
    if (!patient) return res.status(404).send('Patient not found');
    res.render('staff/edit', {
      patient,
      user: req.user,
      userRole: req.user.role,
      page: 'patients'
    });
  });
});

router.post('/patients/:id/edit', allowRoles('staff'), (req, res, next) => {
  const patientId = req.params.id;
  const {
    pre_name, first_name, last_name, gender, birth_date,
    phone, email, address, race, nationality, religion, drug_allergy
  } = req.body;

  const sql = `
    UPDATE patients SET
      pre_name = ?, first_name = ?, last_name = ?, gender = ?, birth_date = ?,
      phone = ?, email = ?, address = ?, race = ?, nationality = ?, religion = ?, drug_allergy = ?
    WHERE id = ?
  `;
  const params = [
    pre_name, first_name, last_name, gender, birth_date,
    phone, email, address, race, nationality, religion, drug_allergy, patientId
  ];

  db.run(sql, params, err => {
    if (err) return next(err);
    res.redirect('/staff/patients');
  });
});

/* ===============================
 * 🔹 Payments
 * =============================== */
router.get('/payments', allowRoles('staff'), (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const q = req.query.q || '';
  const date_from = req.query.date_from || '';
  const date_to = req.query.date_to || '';
  const sort = req.query.sort || 'latest';
  const offset = (page - 1) * pageSize;

  const whereClauses = [];
  const params = [];

  if (q) {
    whereClauses.push("(pt.first_name LIKE ? OR pt.last_name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (date_from) {
    whereClauses.push("date(p.payment_date) >= date(?)");
    params.push(date_from);
  }
  if (date_to) {
    whereClauses.push("date(p.payment_date) <= date(?)");
    params.push(date_to);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  let orderSql = "COALESCE(p.payment_date, '0001-01-01') DESC, p.id DESC";
  switch (sort) {
    case 'unpaid_first':
      orderSql = `
        CASE 
          WHEN p.status = 'pending' THEN 0 
          WHEN p.status = 'void'    THEN 1 
          ELSE 2 
        END ASC,
        COALESCE(p.payment_date, '0001-01-01') DESC, p.id DESC
      `;
      break;
    case 'amount_desc':
      orderSql = "p.amount DESC, p.id DESC";
      break;
    case 'amount_asc':
      orderSql = "p.amount ASC, p.id ASC";
      break;
  }

  const countSql = `
    SELECT COUNT(p.id) AS total
    FROM payments p
    LEFT JOIN visits v ON p.visit_id = v.id
    LEFT JOIN patients pt ON v.patient_id = pt.id
    ${whereSql};
  `;

  const sql = `
    SELECT 
      p.id,
      p.amount,
      p.payment_date,
      p.status,
      pt.first_name || ' ' || pt.last_name AS patient_name
    FROM payments p
    LEFT JOIN visits v ON p.visit_id = v.id
    LEFT JOIN patients pt ON v.patient_id = pt.id
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?;
  `;

  db.get(countSql, params, (err, row) => {
    if (err) return next(err);
    const total = row?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    db.all(sql, [...params, pageSize, offset], (err2, rows) => {
      if (err2) return next(err2);
      res.render('staff/payments', {
        user: req.user,
        userRole: req.user.role,
        payments: rows,
        page,
        pageSize,
        total,
        totalPages,
        q,
        date_from,
        date_to,
        sort
      });
    });
  });
});

router.post('/payments/:id/complete', allowRoles('staff'), (req, res, next) => {
  const sql = `
    UPDATE payments
    SET status = 'paid',
        payment_date = datetime('now')
    WHERE id = ?
  `;
  db.run(sql, [req.params.id], (err) => {
    if (err) return next(err);
    res.redirect('back');
  });
});

/* ===============================
 * 🔹 Unit Page
 * =============================== */
router.get('/unit', allowRoles('staff'), (req, res) => {
  res.render('staff/unit', {
    user: req.user,
    userRole: req.user.role,
    page: 'unit'
  });
});

/* ===============================
 * 🔹 Queue Page
 * =============================== */
router.get('/queue', allowRoles('staff'), (req, res) => {
  res.render('staff/queue', {
    user: req.user,
    userRole: req.user.role,
    page: 'queue'
  });
});

/* ===============================
 * 🔹 Queue Master Data - ดึงทันตแพทย์และยูนิต
 * =============================== */
router.get('/queue-master-data', allowRoles('staff'), (req, res) => {
  console.log('Loading queue master data...');

  const dentistQuery = `
    SELECT id, pre_name || ' ' || first_name || ' ' || last_name AS name, license_number
    FROM dentists
    ORDER BY first_name, last_name
  `;

  const unitQuery = `
    SELECT id, unit_name
    FROM dental_units
    WHERE status = 'ACTIVE'
    ORDER BY unit_name
  `;

  db.all(dentistQuery, [], (err, dentists) => {
    if (err) {
      console.error('Error loading dentists:', err);
      return res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลทันตแพทย์ได้' });
    }

    db.all(unitQuery, [], (err2, units) => {
      if (err2) {
        console.error('Error loading units:', err2);
        return res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลยูนิตได้' });
      }

      console.log('Master data loaded:', { dentists: dentists.length, units: units.length });

      res.json({
        dentists: dentists || [],
        units: units || []
      });
    });
  });
});

/* ===============================
 * 🔹 Queue Data - ดึงข้อมูลคิวและนัดหมาย
 * =============================== */
router.get('/queue-data', allowRoles('staff'), (req, res) => {
  const { date } = req.query;
  console.log('GET /staff/queue-data called with date:', date);

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  // ดึงข้อมูลคิวจาก appointment_requests (สถานะ NEW)
  const queueItemsQuery = `
    SELECT ar.id, ar.patient_id, ar.requested_date as date, 
           ar.requested_time_slot as time, ar.treatment as service_description,
           ar.status, ar.notes, ar.created_at,
           p.first_name, p.last_name, p.pre_name, p.phone
    FROM appointment_requests ar
    LEFT JOIN patients p ON ar.patient_id = p.id
    WHERE ar.requested_date = ? AND ar.status = 'NEW'
    ORDER BY ar.requested_time_slot, ar.created_at
  `;

  // ดึงข้อมูลนัดหมายที่จัดแล้วจาก appointments
  const appointmentsQuery = `
    SELECT a.id, a.patient_id, a.dentist_id, a.unit_id, 
           a.date, a.slot_text as slot, a.status,
           p.first_name, p.last_name, p.pre_name,
           d.pre_name as doc_pre_name, d.first_name as doc_first_name, d.last_name as doc_last_name,
           du.unit_name
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN dentists d ON a.dentist_id = d.id
    LEFT JOIN dental_units du ON a.unit_id = du.id
    WHERE a.date = ? AND a.status IN ('confirmed', 'pending')
    ORDER BY a.slot_text
  `;

  // ดึงข้อมูลความว่างของทันตแพทย์จาก dentist_schedules
  const availabilityQuery = `
    SELECT ds.dentist_id, ds.unit_id, ds.schedule_date as date, 
           ds.time_slot as slot_text, ds.status,
           d.pre_name || ' ' || d.first_name || ' ' || d.last_name AS dentist_name,
           du.unit_name
    FROM dentist_schedules ds
    JOIN dentists d ON ds.dentist_id = d.id
    JOIN dental_units du ON ds.unit_id = du.id
    WHERE ds.schedule_date = ? AND ds.status = 'AVAILABLE'
  `;

  db.all(queueItemsQuery, [date], (err, queueItems) => {
    if (err) {
      console.error('Queue items query error:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }

    db.all(appointmentsQuery, [date], (err2, appointments) => {
      if (err2) {
        console.error('Appointments query error:', err2);
        return res.status(500).json({ error: 'Database error: ' + err2.message });
      }

      db.all(availabilityQuery, [date], (err3, availability) => {
        if (err3) {
          console.error('Availability query error:', err3);
          availability = [];
        }

        const formattedQueueItems = queueItems.map(item => ({
          ...item,
          service: item.service_description,
          status: item.status ? item.status.toLowerCase() : 'new'
        }));

        console.log('Queue data:', {
          queueItems: formattedQueueItems.length,
          appointments: appointments.length,
          availability: availability.length
        });

        res.json({
          queueItems: formattedQueueItems,
          appointments: appointments,
          availability: availability
        });
      });
    });
  });
});

/* ===============================
 * 🔹 Check Real-time Availability - ตรวจสอบความว่างแบบเรียลไทม์ (แก้ไขใหม่)
 * =============================== */
router.get('/check-real-time-availability', allowRoles('staff'), (req, res) => {
  const { date, dentistId, unitId, slot } = req.query;

  console.log('Checking real-time availability for:', { date, dentistId, unitId, slot });

  if (!date || !dentistId || !unitId || !slot) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // 1. ตรวจสอบใน dentist_schedules ว่าว่างหรือไม่
  const availabilityQuery = `
    SELECT status 
    FROM dentist_schedules 
    WHERE schedule_date = ? AND dentist_id = ? AND unit_id = ? AND time_slot = ? AND status = 'AVAILABLE'
  `;

  // 2. ตรวจสอบใน appointments ว่ามีนัดหมายแล้วหรือไม่ (double check)
  const appointmentQuery = `
    SELECT id 
    FROM appointments 
    WHERE date = ? AND dentist_id = ? AND unit_id = ? AND slot_text = ? AND status IN ('confirmed', 'pending')
  `;

  db.get(availabilityQuery, [date, dentistId, unitId, slot], (err, availRow) => {
    if (err) {
      console.error('Availability check error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    // ถ้าไม่ว่างใน dentist_schedules
    if (!availRow) {
      return res.json({
        available: false,
        reason: 'ทันตแพทย์หรือห้องไม่ว่างในช่วงเวลานี้'
      });
    }

    // Double check ใน appointments
    db.get(appointmentQuery, [date, dentistId, unitId, slot], (err2, apptRow) => {
      if (err2) {
        console.error('Appointment check error:', err2);
        return res.status(500).json({ error: 'Database error' });
      }

      // ถ้ามีนัดหมายแล้ว
      if (apptRow) {
        return res.json({
          available: false,
          reason: 'มีนัดหมายในช่วงเวลานี้แล้ว'
        });
      }

      // ว่างจริงๆ
      res.json({
        available: true,
        reason: 'ว่าง สามารถจองได้'
      });
    });
  });
});


/* ===============================
 * 🔹 Get Dentist Unit Assignment - ดูว่าหมออยู่ห้องไหน
 * =============================== */
router.get('/dentist-unit-assignment', allowRoles('staff'), (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const query = `
    SELECT 
      ds.dentist_id,
      ds.unit_id,
      ds.time_slot as slot_text,
      d.pre_name || ' ' || d.first_name || ' ' || d.last_name AS dentist_name,
      du.unit_name,
      ds.status
    FROM dentist_schedules ds
    JOIN dentists d ON ds.dentist_id = d.id
    JOIN dental_units du ON ds.unit_id = du.id
    WHERE ds.schedule_date = ? AND ds.status = 'AVAILABLE'
    ORDER BY ds.dentist_id, ds.time_slot
  `;

  db.all(query, [date], (err, rows) => {
    if (err) {
      console.error('Dentist unit assignment query error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    // จัดกลุ่มข้อมูลตามทันตแพทย์
    const assignment = {};
    rows.forEach(row => {
      if (!assignment[row.dentist_id]) {
        assignment[row.dentist_id] = {
          dentist_name: row.dentist_name,
          units: {}
        };
      }
      
      if (!assignment[row.dentist_id].units[row.unit_id]) {
        assignment[row.dentist_id].units[row.unit_id] = {
          unit_name: row.unit_name,
          slots: []
        };
      }
      
      assignment[row.dentist_id].units[row.unit_id].slots.push(row.slot_text);
    });

    res.json({
      date: date,
      assignment: assignment
    });
  });
});



/* ===============================
 * 🔹 Assign Queue - บันทึกการจัดคิว (แก้ไขใหม่)
 * =============================== */
router.post('/assign-queue', allowRoles('staff'), (req, res) => {
  const { requestId, patientId, dentistId, unitId, date, slot, serviceDescription } = req.body;

  console.log('Assign queue with payload:', { requestId, patientId, dentistId, unitId, date, slot });

  if (!requestId || !patientId || !dentistId || !unitId || !date || !slot) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  // 1. ตรวจสอบ appointment_requests ว่ามีอยู่และสถานะเป็น NEW
  const checkRequestQuery = `SELECT id, patient_id FROM appointment_requests WHERE id = ? AND status = 'NEW'`;
  
  db.get(checkRequestQuery, [requestId], (err, requestRow) => {
    if (err) {
      console.error('Check request error:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบคำขอนัดหมาย' });
    }
    
    if (!requestRow) {
      return res.status(400).json({ error: 'ไม่พบคำขอนัดหมายหรือถูกจัดคิวแล้ว' });
    }

    // 2. ตรวจสอบ patient_id ตรงกับที่ส่งมาหรือไม่
    if (parseInt(requestRow.patient_id) !== parseInt(patientId)) {
      return res.status(400).json({ error: 'ข้อมูลผู้ป่วยไม่ตรงกับคำขอนัดหมาย' });
    }

    // 3. ตรวจสอบ dentists
    const checkDentistQuery = `SELECT id FROM dentists WHERE id = ?`;
    db.get(checkDentistQuery, [dentistId], (err, dentistRow) => {
      if (err) {
        console.error('Check dentist error:', err);
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบทันตแพทย์' });
      }
      
      if (!dentistRow) {
        return res.status(400).json({ error: 'ไม่พบข้อมูลทันตแพทย์' });
      }

      // 4. ตรวจสอบ dental_units
      const checkUnitQuery = `SELECT id FROM dental_units WHERE id = ?`;
      db.get(checkUnitQuery, [unitId], (err, unitRow) => {
        if (err) {
          console.error('Check unit error:', err);
          return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบหน่วยทันตกรรม' });
        }
        
        if (!unitRow) {
          return res.status(400).json({ error: 'ไม่พบข้อมูลหน่วยทันตกรรม' });
        }

        // 5. ตรวจสอบ patients
        const checkPatientQuery = `SELECT id FROM patients WHERE id = ?`;
        db.get(checkPatientQuery, [patientId], (err, patientRow) => {
          if (err) {
            console.error('Check patient error:', err);
            return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบผู้ป่วย' });
          }
          
          if (!patientRow) {
            return res.status(400).json({ error: 'ไม่พบข้อมูลผู้ป่วย' });
          }

          // 6. ตรวจสอบ dentist_schedules ว่าว่างจริงๆ
          const checkScheduleQuery = `
            SELECT id FROM dentist_schedules 
            WHERE dentist_id = ? AND unit_id = ? AND schedule_date = ? AND time_slot = ? AND status = 'AVAILABLE'
          `;

          db.get(checkScheduleQuery, [dentistId, unitId, date, slot], (err, scheduleRow) => {
            if (err) {
              console.error('Check schedule error:', err);
              return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบตารางเวลาทันตแพทย์' });
            }

            if (!scheduleRow) {
              return res.status(400).json({ error: 'ช่วงเวลานี้ไม่ว่างแล้ว กรุณาเลือกเวลาอื่น' });
            }

            // 7. ตรวจสอบซ้ำใน appointments (double check)
            const checkAppointmentQuery = `
              SELECT id FROM appointments 
              WHERE date = ? AND dentist_id = ? AND unit_id = ? AND slot_text = ? AND status IN ('confirmed', 'pending')
            `;

            db.get(checkAppointmentQuery, [date, dentistId, unitId, slot], (err, appointmentRow) => {
              if (err) {
                console.error('Check appointment error:', err);
                return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบนัดหมาย' });
              }

              if (appointmentRow) {
                return res.status(400).json({ error: 'มีนัดหมายในช่วงเวลานี้แล้ว' });
              }

              // ข้อมูลถูกต้องทั้งหมด, ทำการบันทึก
              createAppointment();
            });
          });
        });
      });
    });
  });


  /* ===============================
 * 🔹 Debug Data - สำหรับตรวจสอบข้อมูลพื้นฐาน
 * =============================== */
router.get('/debug-data', allowRoles('staff'), (req, res) => {
  const results = {};

  // ดึงข้อมูลทั้งหมดเพื่อตรวจสอบ
  const queries = {
    dentists: 'SELECT id, pre_name, first_name, last_name FROM dentists LIMIT 10',
    units: 'SELECT id, unit_name FROM dental_units LIMIT 10',
    patients: 'SELECT id, first_name, last_name FROM patients LIMIT 10',
    requests: 'SELECT id, patient_id, requested_date, requested_time_slot FROM appointment_requests WHERE status = "NEW" LIMIT 10',
    schedules: 'SELECT dentist_id, unit_id, schedule_date, time_slot, status FROM dentist_schedules LIMIT 10'
  };

  function runQuery(key, callback) {
    db.all(queries[key], [], (err, rows) => {
      results[key] = err ? { error: err.message } : rows;
      callback();
    });
  }

  // รัน queries ทั้งหมด
  runQuery('dentists', () => {
    runQuery('units', () => {
      runQuery('patients', () => {
        runQuery('requests', () => {
          runQuery('schedules', () => {
            res.json(results);
          });
        });
      });
    });
  });
});

  // สร้างนัดหมาย
  function createAppointment() {
    // สร้าง start_time และ end_time
    const [startHour] = slot.split('-');
    const startTime = `${date} ${startHour}:00`;
    const endTime = `${date} ${slot.split('-')[1]}:00`;

    console.log('Creating appointment with:', {
      startTime, endTime, date, slot
    });

    // 1. สร้างนัดหมายใน appointments
    const insertAppointmentQuery = `
      INSERT INTO appointments (
        patient_id, dentist_id, unit_id, 
        start_time, end_time, date, slot_text,
        status, notes, from_request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
    `;

    db.run(
      insertAppointmentQuery,
      [patientId, dentistId, unitId, startTime, endTime, date, slot, serviceDescription || '', requestId],
      function (err) {
        if (err) {
          console.error('Insert appointment error:', err);
          return res.status(500).json({ error: 'ไม่สามารถสร้างนัดหมายได้: ' + err.message });
        }

        const appointmentId = this.lastID;
        console.log('Appointment created with ID:', appointmentId);

        // 2. อัปเดต dentist_schedules เป็น BOOKED
        const updateScheduleQuery = `
          UPDATE dentist_schedules 
          SET status = 'BOOKED', updated_at = datetime('now')
          WHERE dentist_id = ? AND unit_id = ? AND schedule_date = ? AND time_slot = ?
        `;

        db.run(updateScheduleQuery, [dentistId, unitId, date, slot], (err) => {
          if (err) {
            console.error('Update schedule error:', err);
            console.warn('Warning: Could not update dentist_schedules status, but appointment was created');
          } else {
            console.log('Dentist schedule updated to BOOKED');
          }

          // 3. อัปเดต appointment_requests เป็น SCHEDULED
          const updateRequestQuery = `
            UPDATE appointment_requests 
            SET status = 'SCHEDULED' 
            WHERE id = ?
          `;

          db.run(updateRequestQuery, [requestId], (err) => {
            if (err) {
              console.error('Update request error:', err);
              console.warn('Warning: Could not update appointment_requests status, but appointment was created');
            } else {
              console.log('Appointment request updated to SCHEDULED');
            }

            console.log('Queue assigned successfully');
            res.json({
              success: true,
              message: 'จัดคิวสำเร็จ',
              appointmentId: appointmentId
            });
          });
        });
      }
    );
  }
});



/* ===============================
 * 🔹 Unit API
 * =============================== */
router.get('/api/units', allowRoles('staff'), (req, res, next) => {
  resolveUnitTable((err, tableName) => {
    if (err) return next(err);
    db.all(`SELECT id, unit_name, status FROM ${tableName} ORDER BY id`, [], (e, rows) => {
      if (e) return res.status(500).json({ error: 'Database error while fetching units.' });
      res.json(rows);
    });
  });
});

router.post('/api/units', allowRoles('staff'), (req, res, next) => {
  const { unit_name, status } = req.body;
  if (!unit_name) {
    return res.status(400).json({ error: 'Unit name is required.' });
  }
  resolveUnitTable((err, tableName) => {
    if (err) return next(err);
    const sql = `INSERT INTO ${tableName} (unit_name, status) VALUES (?, ?)`;
    db.run(sql, [unit_name, status || 'ACTIVE'], function (e) {
      if (e) {
        return res.status(500).json({ error: 'Database error while creating a unit.' });
      }
      res.status(201).json({ id: this.lastID, unit_name, status: status || 'ACTIVE' });
    });
  });
});

router.put('/api/units/:id', allowRoles('staff'), (req, res, next) => {
  const { id } = req.params;
  const { unit_name, status } = req.body;

  if (!unit_name && !status) {
    return res.status(400).json({ error: 'Either unit_name or status is required for update.' });
  }

  resolveUnitTable((err, tableName) => {
    if (err) return next(err);

    let sql = `UPDATE ${tableName} SET `;
    const params = [];

    if (unit_name) {
      sql += 'unit_name = ? ';
      params.push(unit_name);
    }
    if (status) {
      if (unit_name) sql += ', ';
      sql += 'status = ? ';
      params.push(status);
    }

    sql += 'WHERE id = ?';
    params.push(id);

    db.run(sql, params, function (e) {
      if (e) {
        return res.status(500).json({ error: 'Database error while updating the unit.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Unit not found.' });
      }
      res.json({ message: 'Unit updated successfully.' });
    });
  });
});

router.delete('/api/units/:id', allowRoles('staff'), (req, res, next) => {
  const { id } = req.params;
  resolveUnitTable((err, tableName) => {
    if (err) return next(err);
    const sql = `DELETE FROM ${tableName} WHERE id = ?`;
    db.run(sql, [id], function (e) {
      if (e) {
        return res.status(500).json({ error: 'Database error while deleting the unit.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Unit not found.' });
      }
      res.json({ message: 'Unit deleted successfully.' });
    });
  });
});

/* ===============================
 * 🔹 Dentist Schedule Management - จัดการตารางเวลาทันตแพทย์
 * =============================== */

// หน้าจัดการตารางเวลาทันตแพทย์
router.get('/schedules', allowRoles('staff'), (req, res) => {
  res.render('staff/schedules', {
    user: req.user,
    userRole: req.user.role,
    page: 'schedules'
  });
});

// ดึงข้อมูลตารางเวลาทันตแพทย์
router.get('/api/schedules', allowRoles('staff'), (req, res) => {
  const { date, dentistId } = req.query;
  
  let sql = `
    SELECT 
      ds.id,
      ds.dentist_id,
      ds.unit_id,
      ds.schedule_date,
      ds.time_slot,
      ds.status,
      ds.created_at,
      ds.updated_at,
      d.pre_name || ' ' || d.first_name || ' ' || d.last_name AS dentist_name,
      du.unit_name
    FROM dentist_schedules ds
    JOIN dentists d ON ds.dentist_id = d.id
    JOIN dental_units du ON ds.unit_id = du.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (date) {
    sql += ' AND ds.schedule_date = ?';
    params.push(date);
  }
  
  if (dentistId) {
    sql += ' AND ds.dentist_id = ?';
    params.push(dentistId);
  }
  
  sql += ' ORDER BY ds.schedule_date, ds.time_slot, d.first_name';
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error fetching schedules:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลตารางเวลา' });
    }
    
    res.json(rows);
  });
});

// เพิ่มตารางเวลาทันตแพทย์
router.post('/api/schedules', allowRoles('staff'), (req, res) => {
  const { dentist_id, unit_id, schedule_date, time_slot, status } = req.body;
  
  if (!dentist_id || !unit_id || !schedule_date || !time_slot) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  
  // ตรวจสอบว่ามีข้อมูลนี้อยู่แล้วหรือไม่
  const checkSql = `
    SELECT id FROM dentist_schedules 
    WHERE dentist_id = ? AND unit_id = ? AND schedule_date = ? AND time_slot = ?
  `;
  
  db.get(checkSql, [dentist_id, unit_id, schedule_date, time_slot], (err, existing) => {
    if (err) {
      console.error('Check schedule error:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูล' });
    }
    
    if (existing) {
      return res.status(400).json({ error: 'มีตารางเวลานี้อยู่แล้ว' });
    }
    
    // เพิ่มข้อมูลใหม่
    const insertSql = `
      INSERT INTO dentist_schedules (dentist_id, unit_id, schedule_date, time_slot, status)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    db.run(insertSql, [dentist_id, unit_id, schedule_date, time_slot, status || 'AVAILABLE'], function(err) {
      if (err) {
        console.error('Insert schedule error:', err);
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มตารางเวลา' });
      }
      
      res.json({
        success: true,
        message: 'เพิ่มตารางเวลาสำเร็จ',
        id: this.lastID
      });
    });
  });
});

// ลบตารางเวลา
router.delete('/api/schedules/:id', allowRoles('staff'), (req, res) => {
  const scheduleId = req.params.id;
  
  // ตรวจสอบว่าตารางเวลาถูกจองแล้วหรือไม่
  const checkSql = 'SELECT status FROM dentist_schedules WHERE id = ?';
  
  db.get(checkSql, [scheduleId], (err, schedule) => {
    if (err) {
      console.error('Check schedule error:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูล' });
    }
    
    if (!schedule) {
      return res.status(404).json({ error: 'ไม่พบตารางเวลาที่ต้องการลบ' });
    }
    
    if (schedule.status === 'BOOKED') {
      return res.status(400).json({ error: 'ไม่สามารถลบตารางเวลาที่ถูกจองแล้วได้' });
    }
    
    // ลบตารางเวลา
    const deleteSql = 'DELETE FROM dentist_schedules WHERE id = ?';
    
    db.run(deleteSql, [scheduleId], function(err) {
      if (err) {
        console.error('Delete schedule error:', err);
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบตารางเวลา' });
      }
      
      res.json({
        success: true,
        message: 'ลบตารางเวลาสำเร็จ'
      });
    });
  });
});

// อัปเดตสถานะตารางเวลา
router.put('/api/schedules/:id', allowRoles('staff'), (req, res) => {
  const scheduleId = req.params.id;
  const { status } = req.body;
  
  if (!status || !['AVAILABLE', 'UNAVAILABLE', 'BREAK'].includes(status)) {
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  }
  
  const updateSql = `
    UPDATE dentist_schedules 
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `;
  
  db.run(updateSql, [status, scheduleId], function(err) {
    if (err) {
      console.error('Update schedule error:', err);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตตารางเวลา' });
    }
    
    res.json({
      success: true,
      message: 'อัปเดตตารางเวลาสำเร็จ'
    });
  });
});

// เพิ่มตารางเวลาหลายช่วงพร้อมกัน (批量เพิ่ม)
router.post('/api/schedules/bulk', allowRoles('staff'), (req, res) => {
  const { dentist_id, unit_id, schedule_date, time_slots, status } = req.body;
  
  if (!dentist_id || !unit_id || !schedule_date || !time_slots || !Array.isArray(time_slots)) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  // ฟังก์ชันเพิ่มตารางเวลาแบบ recursive
  function addSchedule(index) {
    if (index >= time_slots.length) {
      return res.json({
        success: true,
        message: `เพิ่มตารางเวลาเสร็จสิ้น (สำเร็จ: ${results.success}, ล้มเหลว: ${results.failed})`,
        results: results
      });
    }
    
    const time_slot = time_slots[index];
    
    // ตรวจสอบว่ามีข้อมูลนี้อยู่แล้วหรือไม่
    const checkSql = `
      SELECT id FROM dentist_schedules 
      WHERE dentist_id = ? AND unit_id = ? AND schedule_date = ? AND time_slot = ?
    `;
    
    db.get(checkSql, [dentist_id, unit_id, schedule_date, time_slot], (err, existing) => {
      if (err) {
        results.failed++;
        results.errors.push(`ช่วงเวลา ${time_slot}: เกิดข้อผิดพลาด`);
        return addSchedule(index + 1);
      }
      
      if (existing) {
        results.failed++;
        results.errors.push(`ช่วงเวลา ${time_slot}: มีข้อมูลอยู่แล้ว`);
        return addSchedule(index + 1);
      }
      
      // เพิ่มข้อมูลใหม่
      const insertSql = `
        INSERT INTO dentist_schedules (dentist_id, unit_id, schedule_date, time_slot, status)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      db.run(insertSql, [dentist_id, unit_id, schedule_date, time_slot, status || 'AVAILABLE'], function(err) {
        if (err) {
          results.failed++;
          results.errors.push(`ช่วงเวลา ${time_slot}: ไม่สามารถเพิ่มได้`);
        } else {
          results.success++;
        }
        
        addSchedule(index + 1);
      });
    });
  }
  
  addSchedule(0);
});

module.exports = router;