// routes/staff.js (MySQL version)
const express = require('express');
const router = express.Router();
const db = require('../db'); // mysql2/promise (เหมือน auth.js)
const { allowRoles } = require('../utils/auth'); // ← สำคัญ: ต้องมี!

/* ========== Helper ========== */

// ใช้ชื่อ table ยูนิตแบบตายตัว (ถ้าโปรเจกต์คุณใช้ 'units' ให้เปลี่ยนที่นี่จุดเดียว)
const UNIT_TABLE = 'dental_units';

// แปลงค่าพารามิเตอร์ page/pageSize ให้ปลอดภัย
function toInt(v, def, min = 1, max = 1000) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/* =========================================
 * 🔹 Patients List + Pagination (MySQL)
 * ========================================= */
router.get('/patients', allowRoles('staff'), async (req, res, next) => {
  try {
    const searchQuery = req.query.search || '';
    const page = toInt(req.query.page, 1, 1, 100000);
    const pageSize = toInt(req.query.pageSize, 15, 5, 100);
    const offset = (page - 1) * pageSize;
    const successMessage = req.query.success ? 'สร้างบัญชีผู้ป่วยใหม่สำเร็จแล้ว' : null;

    const params = [];
    let where = '';
    if (searchQuery) {
      where = ` WHERE first_name LIKE ? OR last_name LIKE ? OR CONCAT('CN', LPAD(id, 4, '0')) LIKE ? `;
      const t = `%${searchQuery}%`;
      params.push(t, t, t);
    }

    const [[countRow]] = await db.query(
      `SELECT COUNT(id) AS count FROM patients ${where}`, params
    );
    const total = countRow?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const [patients] = await db.query(
      `
      SELECT
        id,
        pre_name,
        first_name,
        last_name,
        phone,
        CONCAT('CN', LPAD(id, 4, '0')) AS clinic_number,
        DATE_FORMAT(created_at, '%d/%m/%Y') AS created_at,
        /* อายุแบบเป๊ะ (หักถ้ายังไม่ถึงวันเกิดปีนี้) */
        TIMESTAMPDIFF(YEAR, birth_date, CURDATE())
          - (DATE_FORMAT(CURDATE(), '%m-%d') < DATE_FORMAT(birth_date, '%m-%d')) AS age
      FROM patients
      ${where}
      ORDER BY first_name, last_name
      LIMIT ? OFFSET ?;
      `,
      [...params, pageSize, offset]
    );

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
  } catch (err) {
    next(err);
  }
});

/* ===============================
 * 🔹 Edit Patient (MySQL)
 * =============================== */
router.get('/patients/:id/edit', allowRoles('staff'), async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const [[patient]] = await db.query(
      `SELECT *, CONCAT('CN', LPAD(id, 4, '0')) AS clinic_number FROM patients WHERE id = ?`,
      [patientId]
    );
    if (!patient) return res.status(404).send('Patient not found');
    res.render('staff/edit', {
      patient,
      user: req.user,
      userRole: req.user.role,
      page: 'patients'
    });
  } catch (err) {
    next(err);
  }
});

router.post('/patients/:id/edit', allowRoles('staff'), async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const {
      pre_name, first_name, last_name, gender, birth_date,
      phone, email, address, race, nationality, religion, drug_allergy
    } = req.body;

    await db.query(
      `
      UPDATE patients SET
        pre_name = ?, first_name = ?, last_name = ?, gender = ?, birth_date = ?,
        phone = ?, email = ?, address = ?, race = ?, nationality = ?, religion = ?, drug_allergy = ?
      WHERE id = ?
      `,
      [pre_name, first_name, last_name, gender, birth_date, phone, email, address, race, nationality, religion, drug_allergy, patientId]
    );

    res.redirect('/staff/patients');
  } catch (err) {
    next(err);
  }
});

/* ===============================
 * 🔹 Payments (MySQL)
 * =============================== */
router.get('/payments', allowRoles('staff'), async (req, res, next) => {
  try {
    const page = toInt(req.query.page, 1, 1, 100000);
    const pageSize = toInt(req.query.pageSize, 10, 5, 100);
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
      whereClauses.push("DATE(p.payment_date) >= DATE(?)");
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push("DATE(p.payment_date) <= DATE(?)");
      params.push(date_to);
    }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let orderSql = "COALESCE(p.payment_date, '1000-01-01') DESC, p.id DESC";
    switch (sort) {
      case 'unpaid_first':
        orderSql = `
          CASE 
            WHEN p.status = 'pending' THEN 0 
            WHEN p.status = 'void'    THEN 1 
            ELSE 2 
          END ASC,
          COALESCE(p.payment_date, '1000-01-01') DESC, p.id DESC
        `;
        break;
      case 'amount_desc':
        orderSql = "p.amount DESC, p.id DESC";
        break;
      case 'amount_asc':
        orderSql = "p.amount ASC, p.id ASC";
        break;
    }

    const [[countRow]] = await db.query(
      `
      SELECT COUNT(p.id) AS total
      FROM payments p
      LEFT JOIN visits v   ON p.visit_id = v.id
      LEFT JOIN patients pt ON v.patient_id = pt.id
      ${whereSql};
      `,
      params
    );
    const total = countRow?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const [rows] = await db.query(
      `
      SELECT 
        p.id,
        p.amount,
        p.payment_date,
        p.status,
        CONCAT_WS(' ', pt.first_name, pt.last_name) AS patient_name
      FROM payments p
      LEFT JOIN visits v    ON p.visit_id = v.id
      LEFT JOIN patients pt ON v.patient_id = pt.id
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?;
      `,
      [...params, pageSize, offset]
    );

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
  } catch (err) {
    next(err);
  }
});

router.post('/payments/:id/complete', allowRoles('staff'), async (req, res, next) => {
  try {
    const paymentId = req.params.id;

    // เก็บ query เดิม
    const queryParams = new URLSearchParams({
      page: req.body.page || '1',
      pageSize: req.body.pageSize || '10',
      q: req.body.q || '',
      date_from: req.body.date_from || '',
      date_to: req.body.date_to || '',
      sort: req.body.sort || 'latest',
      success: 'ยืนยันการชำระเงินสำเร็จ'
    }).toString();

    const [[row]] = await db.query(`SELECT id, status FROM payments WHERE id = ?`, [paymentId]);
    if (!row) return res.status(404).send('ไม่พบรายการชำระเงิน');

    if (row.status === 'paid') {
      const redirectUrl = `/staff/payments?${new URLSearchParams({
        ...req.body,
        success: 'รายการนี้ชำระแล้วอยู่แล้ว'
      }).toString()}`;
      return res.redirect(redirectUrl);
    }

    await db.query(
      `UPDATE payments SET status = 'paid', payment_date = NOW() WHERE id = ?`,
      [paymentId]
    );

    res.redirect(`/staff/payments?${queryParams}`);
  } catch (err) {
    next(err);
  }
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
 * 🔹 Queue Master Data (MySQL)
 * =============================== */
router.get('/queue-master-data', allowRoles('staff'), async (req, res) => {
  try {
    const [dentists] = await db.query(
      `
      SELECT id,
             CONCAT_WS(' ', pre_name, first_name, last_name) AS name,
             license_number
      FROM dentists
      ORDER BY first_name, last_name
      `
    );

    const [units] = await db.query(
      `
      SELECT id, unit_name
      FROM ${UNIT_TABLE}
      WHERE status = 'ACTIVE'
      ORDER BY unit_name
      `
    );

    res.json({ dentists: dentists || [], units: units || [] });
  } catch (err) {
    console.error('queue-master-data error:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูล master ได้' });
  }
});

/* ===============================
 * 🔹 Queue Data - requests/appointments/availability
 * =============================== */
router.get('/queue-data', allowRoles('staff'), async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  try {
    // NEW requests
    const [queueItems] = await db.query(
      `
      SELECT ar.id, ar.patient_id, ar.requested_date AS date,
             ar.requested_time_slot AS time, ar.treatment AS service_description,
             ar.status, ar.notes, ar.created_at,
             p.first_name, p.last_name, p.pre_name, p.phone
      FROM appointment_requests ar
      LEFT JOIN patients p ON ar.patient_id = p.id
      WHERE ar.requested_date = ? AND ar.status = 'NEW'
      ORDER BY ar.requested_time_slot, ar.created_at
      `,
      [date]
    );

    // appointments (confirmed/pending)
    const [appointments] = await db.query(
      `
      SELECT a.id, a.patient_id, a.dentist_id, a.unit_id,
             a.date, a.slot_text AS slot, a.status,
             p.first_name, p.last_name, p.pre_name,
             d.pre_name AS doc_pre_name, d.first_name AS doc_first_name, d.last_name AS doc_last_name,
             du.unit_name
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN dentists d ON a.dentist_id = d.id
      LEFT JOIN ${UNIT_TABLE} du ON a.unit_id = du.id
      WHERE a.date = ? AND a.status IN ('confirmed', 'pending')
      ORDER BY a.slot_text
      `,
      [date]
    );

    // availability
    const [availability] = await db.query(
      `
      SELECT ds.dentist_id, ds.unit_id, ds.schedule_date AS date,
             ds.time_slot AS slot_text, ds.status,
             CONCAT_WS(' ', d.pre_name, d.first_name, d.last_name) AS dentist_name,
             du.unit_name
      FROM dentist_schedules ds
      JOIN dentists d ON ds.dentist_id = d.id
      JOIN ${UNIT_TABLE} du ON ds.unit_id = du.id
      WHERE ds.schedule_date = ? AND ds.status = 'AVAILABLE'
      `,
      [date]
    );

    const formattedQueueItems = (queueItems || []).map(item => ({
      ...item,
      service: item.service_description,
      status: item.status ? item.status.toLowerCase() : 'new'
    }));

    res.json({
      queueItems: formattedQueueItems,
      appointments,
      availability
    });
  } catch (err) {
    console.error('queue-data error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

/* ===============================
 * 🔹 Check Real-time Availability (MySQL)
 * =============================== */
router.get('/check-real-time-availability', allowRoles('staff'), async (req, res) => {
  const { date, dentistId, unitId, slot } = req.query;
  if (!date || !dentistId || !unitId || !slot) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    const [[avail]] = await db.query(
      `
      SELECT id FROM dentist_schedules
      WHERE schedule_date = ? AND dentist_id = ? AND unit_id = ? AND time_slot = ? AND status = 'AVAILABLE'
      `,
      [date, dentistId, unitId, slot]
    );

    if (!avail) {
      return res.json({ available: false, reason: 'ทันตแพทย์หรือห้องไม่ว่างในช่วงเวลานี้' });
    }

    const [[dup]] = await db.query(
      `
      SELECT id FROM appointments
      WHERE date = ? AND dentist_id = ? AND unit_id = ? AND slot_text = ? AND status IN ('confirmed', 'pending')
      `,
      [date, dentistId, unitId, slot]
    );

    if (dup) {
      return res.json({ available: false, reason: 'มีนัดหมายในช่วงเวลานี้แล้ว' });
    }

    res.json({ available: true, reason: 'ว่าง สามารถจองได้' });
  } catch (err) {
    console.error('check-real-time-availability error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ===============================
 * 🔹 Dentist Unit Assignment
 * =============================== */
router.get('/dentist-unit-assignment', allowRoles('staff'), async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required' });
  try {
    const [rows] = await db.query(
      `
      SELECT 
        ds.dentist_id,
        ds.unit_id,
        ds.time_slot AS slot_text,
        CONCAT_WS(' ', d.pre_name, d.first_name, d.last_name) AS dentist_name,
        du.unit_name,
        ds.status
      FROM dentist_schedules ds
      JOIN dentists d ON ds.dentist_id = d.id
      JOIN ${UNIT_TABLE} du ON ds.unit_id = du.id
      WHERE ds.schedule_date = ? AND ds.status = 'AVAILABLE'
      ORDER BY ds.dentist_id, ds.time_slot
      `,
      [date]
    );

    const assignment = {};
    (rows || []).forEach(row => {
      if (!assignment[row.dentist_id]) {
        assignment[row.dentist_id] = { dentist_name: row.dentist_name, units: {} };
      }
      if (!assignment[row.dentist_id].units[row.unit_id]) {
        assignment[row.dentist_id].units[row.unit_id] = { unit_name: row.unit_name, slots: [] };
      }
      assignment[row.dentist_id].units[row.unit_id].slots.push(row.slot_text);
    });

    res.json({ date, assignment });
  } catch (err) {
    console.error('dentist-unit-assignment error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ===============================
 * 🔹 Assign Queue (Transaction, MySQL)
 * =============================== */
router.post('/assign-queue', allowRoles('staff'), async (req, res) => {
  const { requestId, patientId, dentistId, unitId, date, slot, serviceDescription } = req.body;
  if (!requestId || !patientId || !dentistId || !unitId || !date || !slot) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  // คำนวณเวลาเริ่ม/สิ้นสุดจาก slot รูปแบบ "HH:MM-HH:MM" (คุณส่งมาเป็น "09-10" ก็ปรับ parser ตามจริง)
  // ที่นี่สมมติว่า slot = "09:00-10:00"
  const [startStr, endStr] = slot.split('-');
  const startTime = `${date} ${startStr}:00`.replace(':00:00', ':00'); // เผื่อส่งมาเป็น "09-10" ให้แก้ parser
  const endTime = `${date} ${endStr}:00`.replace(':00:00', ':00');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) ตรวจสอบ request ต้องเป็น NEW
    const [[reqRow]] = await conn.query(
      `SELECT id, patient_id FROM appointment_requests WHERE id = ? AND status = 'NEW' FOR UPDATE`,
      [requestId]
    );
    if (!reqRow) {
      await conn.rollback();
      return res.status(400).json({ error: 'ไม่พบคำขอนัดหมายหรือถูกจัดคิวแล้ว' });
    }
    if (parseInt(reqRow.patient_id) !== parseInt(patientId)) {
      await conn.rollback();
      return res.status(400).json({ error: 'ข้อมูลผู้ป่วยไม่ตรงกับคำขอนัดหมาย' });
    }

    // 2) ตรวจ Dentist / Unit / Patient มีจริง
    const [[dentist]] = await conn.query(`SELECT id FROM dentists WHERE id = ?`, [dentistId]);
    if (!dentist) { await conn.rollback(); return res.status(400).json({ error: 'ไม่พบข้อมูลทันตแพทย์' }); }

    const [[unit]] = await conn.query(`SELECT id FROM ${UNIT_TABLE} WHERE id = ?`, [unitId]);
    if (!unit) { await conn.rollback(); return res.status(400).json({ error: 'ไม่พบข้อมูลหน่วยทันตกรรม' }); }

    const [[patient]] = await conn.query(`SELECT id FROM patients WHERE id = ?`, [patientId]);
    if (!patient) { await conn.rollback(); return res.status(400).json({ error: 'ไม่พบข้อมูลผู้ป่วย' }); }

    // 3) ตรวจว่าว่างใน dentist_schedules
    const [[sched]] = await conn.query(
      `
      SELECT id FROM dentist_schedules
      WHERE dentist_id = ? AND unit_id = ? AND schedule_date = ? AND time_slot = ? AND status = 'AVAILABLE'
      FOR UPDATE
      `,
      [dentistId, unitId, date, slot]
    );
    if (!sched) {
      await conn.rollback();
      return res.status(400).json({ error: 'ช่วงเวลานี้ไม่ว่างแล้ว กรุณาเลือกเวลาอื่น' });
    }

    // 4) Double check ไม่มีนัดชน
    const [[dup]] = await conn.query(
      `
      SELECT id FROM appointments
      WHERE date = ? AND dentist_id = ? AND unit_id = ? AND slot_text = ? AND status IN ('confirmed', 'pending')
      FOR UPDATE
      `,
      [date, dentistId, unitId, slot]
    );
    if (dup) {
      await conn.rollback();
      return res.status(400).json({ error: 'มีนัดหมายในช่วงเวลานี้แล้ว' });
    }

    // 5) Insert appointments
    const [ins] = await conn.query(
      `
      INSERT INTO appointments (
        patient_id, dentist_id, unit_id,
        start_time, end_time, date, slot_text,
        status, notes, from_request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
      `,
      [patientId, dentistId, unitId, startTime, endTime, date, slot, serviceDescription || '', requestId]
    );
    const appointmentId = ins.insertId;

    // 6) Update schedule → BOOKED
    await conn.query(
      `
      UPDATE dentist_schedules
      SET status = 'BOOKED', updated_at = NOW()
      WHERE dentist_id = ? AND unit_id = ? AND schedule_date = ? AND time_slot = ?
      `,
      [dentistId, unitId, date, slot]
    );

    // 7) Update request → SCHEDULED
    await conn.query(
      `UPDATE appointment_requests SET status = 'SCHEDULED' WHERE id = ? AND status = 'NEW'`,
      [requestId]
    );

    await conn.commit();
    res.json({ success: true, message: 'จัดคิวสำเร็จ', appointmentId });
  } catch (err) {
    console.error('assign-queue error:', err);
    try { await conn.rollback(); } catch (_) {}
    res.status(500).json({ success: false, error: 'ไม่สามารถสร้างนัดหมายได้: ' + err.message });
  } finally {
    conn.release();
  }
});

/* ===============================
 * 🔹 Debug Data
 * =============================== */
router.get('/debug-data', allowRoles('staff'), async (req, res) => {
  try {
    const [dentists]  = await db.query('SELECT id, pre_name, first_name, last_name FROM dentists LIMIT 10');
    const [units]     = await db.query(`SELECT id, unit_name FROM ${UNIT_TABLE} LIMIT 10`);
    const [patients]  = await db.query('SELECT id, first_name, last_name FROM patients LIMIT 10');
    const [requests]  = await db.query(`SELECT id, patient_id, requested_date, requested_time_slot FROM appointment_requests WHERE status = 'NEW' LIMIT 10`);
    const [schedules] = await db.query('SELECT dentist_id, unit_id, schedule_date, time_slot, status FROM dentist_schedules LIMIT 10');

    res.json({ dentists, units, patients, requests, schedules });
  } catch (err) {
    res.json({
      dentists: { error: err.message },
      units: { error: err.message },
      patients: { error: err.message },
      requests: { error: err.message },
      schedules: { error: err.message }
    });
  }
});

/* ===============================
 * 🔹 Unit API (MySQL)
 * =============================== */
router.get('/api/units', allowRoles('staff'), async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT id, unit_name, status FROM ${UNIT_TABLE} ORDER BY id`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Database error while fetching units.' });
  }
});

router.post('/api/units', allowRoles('staff'), async (req, res) => {
  try {
    const { unit_name, status } = req.body;
    if (!unit_name) return res.status(400).json({ error: 'Unit name is required.' });

    const [result] = await db.query(
      `INSERT INTO ${UNIT_TABLE} (unit_name, status) VALUES (?, ?)`,
      [unit_name, status || 'ACTIVE']
    );
    res.status(201).json({ id: result.insertId, unit_name, status: status || 'ACTIVE' });
  } catch (e) {
    res.status(500).json({ error: 'Database error while creating a unit.' });
  }
});

router.put('/api/units/:id', allowRoles('staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const { unit_name, status } = req.body;
    if (!unit_name && !status) {
      return res.status(400).json({ error: 'Either unit_name or status is required for update.' });
    }

    // สร้าง dynamic SQL แบบง่าย
    const sets = [];
    const params = [];
    if (unit_name) { sets.push('unit_name = ?'); params.push(unit_name); }
    if (status)    { sets.push('status = ?');    params.push(status); }
    params.push(id);

    const [r] = await db.query(
      `UPDATE ${UNIT_TABLE} SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Unit not found.' });
    res.json({ message: 'Unit updated successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Database error while updating the unit.' });
  }
});

router.delete('/api/units/:id', allowRoles('staff'), async (req, res) => {
  try {
    const { id } = req.params;
    const [r] = await db.query(`DELETE FROM ${UNIT_TABLE} WHERE id = ?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Unit not found.' });
    res.json({ message: 'Unit deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Database error while deleting the unit.' });
  }
});

/* ===============================
 * 🔹 Dentist Schedule Management
 * =============================== */
router.get('/schedules', allowRoles('staff'), (req, res) => {
  res.render('staff/schedules', {
    user: req.user,
    userRole: req.user.role,
    page: 'schedules'
  });
});

router.get('/api/schedules', allowRoles('staff'), async (req, res) => {
  try {
    const { date, dentistId } = req.query;

    const clauses = [];
    const params  = [];
    if (date) { clauses.push('ds.schedule_date = ?'); params.push(date); }
    if (dentistId) { clauses.push('ds.dentist_id = ?'); params.push(dentistId); }

    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

    const [rows] = await db.query(
      `
      SELECT 
        ds.id, ds.dentist_id, ds.unit_id, ds.schedule_date, ds.time_slot, ds.status,
        ds.created_at, ds.updated_at,
        CONCAT_WS(' ', d.pre_name, d.first_name, d.last_name) AS dentist_name,
        du.unit_name
      FROM dentist_schedules ds
      JOIN dentists d ON ds.dentist_id = d.id
      JOIN ${UNIT_TABLE} du ON ds.unit_id = du.id
      ${where}
      ORDER BY ds.schedule_date, ds.time_slot, d.first_name
      `,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('api/schedules error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลตารางเวลา' });
  }
});

router.post('/api/schedules', allowRoles('staff'), async (req, res) => {
  try {
    const { dentist_id, unit_id, schedule_date, time_slot, status } = req.body;
    if (!dentist_id || !unit_id || !schedule_date || !time_slot) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const [[exists]] = await db.query(
      `
      SELECT id FROM dentist_schedules
      WHERE dentist_id = ? AND unit_id = ? AND schedule_date = ? AND time_slot = ?
      `,
      [dentist_id, unit_id, schedule_date, time_slot]
    );
    if (exists) return res.status(400).json({ error: 'มีตารางเวลานี้อยู่แล้ว' });

    const [ins] = await db.query(
      `
      INSERT INTO dentist_schedules (dentist_id, unit_id, schedule_date, time_slot, status)
      VALUES (?, ?, ?, ?, ?)
      `,
      [dentist_id, unit_id, schedule_date, time_slot, status || 'AVAILABLE']
    );

    res.json({ success: true, message: 'เพิ่มตารางเวลาสำเร็จ', id: ins.insertId });
  } catch (err) {
    console.error('post/api/schedules error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มตารางเวลา' });
  }
});

router.delete('/api/schedules/:id', allowRoles('staff'), async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const [[schedule]] = await db.query(
      `SELECT status FROM dentist_schedules WHERE id = ?`, [scheduleId]
    );
    if (!schedule) return res.status(404).json({ error: 'ไม่พบตารางเวลาที่ต้องการลบ' });
    if (schedule.status === 'BOOKED') {
      return res.status(400).json({ error: 'ไม่สามารถลบตารางเวลาที่ถูกจองแล้วได้' });
    }

    await db.query(`DELETE FROM dentist_schedules WHERE id = ?`, [scheduleId]);
    res.json({ success: true, message: 'ลบตารางเวลาสำเร็จ' });
  } catch (err) {
    console.error('delete/api/schedules error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบตารางเวลา' });
  }
});

router.put('/api/schedules/:id', allowRoles('staff'), async (req, res) => {
  try {
    const scheduleId = req.params.id;
    const { status } = req.body;
    if (!status || !['AVAILABLE', 'UNAVAILABLE', 'BREAK', 'BOOKED'].includes(status)) {
      return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    }
    await db.query(
      `UPDATE dentist_schedules SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, scheduleId]
    );
    res.json({ success: true, message: 'อัปเดตตารางเวลาสำเร็จ' });
  } catch (err) {
    console.error('put/api/schedules error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตตารางเวลา' });
  }
});

// เพิ่มหลายช่วงเวลา
router.post('/api/schedules/bulk', allowRoles('staff'), async (req, res) => {
  try {
    const { dentist_id, unit_id, schedule_date, time_slots, status } = req.body;
    if (!dentist_id || !unit_id || !schedule_date || !time_slots || !Array.isArray(time_slots)) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    let success = 0;
    let failed = 0;
    const errors = [];

    for (const time_slot of time_slots) {
      try {
        const [[exists]] = await db.query(
          `
          SELECT id FROM dentist_schedules
          WHERE dentist_id = ? AND unit_id = ? AND schedule_date = ? AND time_slot = ?
          `,
          [dentist_id, unit_id, schedule_date, time_slot]
        );
        if (exists) {
          failed++;
          errors.push(`ช่วงเวลา ${time_slot}: มีข้อมูลอยู่แล้ว`);
          continue;
        }
        await db.query(
          `
          INSERT INTO dentist_schedules (dentist_id, unit_id, schedule_date, time_slot, status)
          VALUES (?, ?, ?, ?, ?)
          `,
          [dentist_id, unit_id, schedule_date, time_slot, status || 'AVAILABLE']
        );
        success++;
      } catch (_) {
        failed++;
        errors.push(`ช่วงเวลา ${time_slot}: ไม่สามารถเพิ่มได้`);
      }
    }

    res.json({
      success: true,
      message: `เพิ่มตารางเวลาเสร็จสิ้น (สำเร็จ: ${success}, ล้มเหลว: ${failed})`,
      results: { success, failed, errors }
    });
  } catch (err) {
    console.error('bulk/api/schedules error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มตารางเวลา (bulk)' });
  }
});

module.exports = router;