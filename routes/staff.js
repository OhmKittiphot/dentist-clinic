// Staff
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');
const multer = require('multer');
const path = require('path');

/* ---------- Helper: parse int safely ---------- */
function toInt(v, def, min = 1, max = 1000) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/* ---------- Patients list (ของเดิม ใช้ต่อได้) ---------- */
router.get('/patients', allowRoles('staff'), (req, res, next) => {
  const searchQuery = req.query.search || '';
  const currentPage = parseInt(req.query.page) || 1;
  const limit = 15;
  const offset = (currentPage - 1) * limit;
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
    const searchTerm = `%${searchQuery}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  db.get(countSql, params, (err, row) => {
    if (err) return next(err);
    const totalPatients = row.count;
    const totalPages = Math.ceil(totalPatients / limit);

    sql += ` ORDER BY first_name, last_name LIMIT ? OFFSET ?;`;
    db.all(sql, [...params, limit, offset], (err2, patients) => {
      if (err2) return next(err2);
      res.render('staff/index', {
        patients,
        user: req.user,
        userRole: req.user.role,
        searchQuery,
        currentPage,
        totalPages,
        successMessage,
        nonce: res.locals.cspNonce || '' // เผื่อ view ใช้ nonce
      });
    });
  });
});

/* ---------- Edit patient (ของเดิม) ---------- */
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
      nonce: res.locals.cspNonce || ''
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

/* ---------- Payments: filters (q, date_from, date_to) + pagination ---------- */
router.get('/payments', allowRoles('staff'), (req, res, next) => {
  let page     = toInt(req.query.page, 1, 1);
  const pageSize = toInt(req.query.pageSize, 10, 1, 100);

  const qRaw       = (req.query.q || '').trim();          // ชื่อผู้ป่วย
  let dateFrom     = (req.query.date_from || '').trim();  // YYYY-MM-DD
  let dateTo       = (req.query.date_to || '').trim();    // YYYY-MM-DD

  // ถ้าใส่ช่วงวันที่สลับกันมา (from > to) ให้สลับให้ถูก
  if (dateFrom && dateTo && dateFrom > dateTo) {
    const tmp = dateFrom;
    dateFrom = dateTo;
    dateTo = tmp;
  }

  const where = [];
  const params = [];

  // ใช้ COALESCE ป้องกัน NULL และค้นหาไม่สนตัวพิมพ์
  if (qRaw) {
    where.push(` (COALESCE(pt.first_name,'') || ' ' || COALESCE(pt.last_name,'')) LIKE ? COLLATE NOCASE `);
    params.push(`%${qRaw}%`);
  }

  // ใช้วันที่ชำระ ถ้าไม่มี fallback เป็นวันที่สร้าง
  if (dateFrom) {
    where.push(` DATE(COALESCE(p.payment_date, p.created_at)) >= DATE(?) `);
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push(` DATE(COALESCE(p.payment_date, p.created_at)) <= DATE(?) `);
    params.push(dateTo);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) AS count
    FROM payments p
    LEFT JOIN visits v    ON p.visit_id = v.id
    LEFT JOIN patients pt ON v.patient_id = pt.id
    ${whereSql};
  `;

  const dataSql = `
    SELECT 
      p.id,
      p.amount,
      p.payment_date,
      p.status,
      p.created_at,
      (COALESCE(pt.first_name,'') || ' ' || COALESCE(pt.last_name,'')) AS patient_name
    FROM payments p
    LEFT JOIN visits v    ON p.visit_id = v.id
    LEFT JOIN patients pt ON v.patient_id = pt.id
    ${whereSql}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?;
  `;

  db.get(countSql, params, (err, row) => {
    if (err) return next(err);

    const total = row?.count || 0;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    // กันกรณีผู้ใช้ใส่ page เกินจำนวนหน้า
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    db.all(dataSql, [...params, pageSize, offset], (err2, rows) => {
      if (err2) return next(err2);
      res.render('staff/payments', {
        user: req.user,
        userRole: req.user.role,
        payments: rows,
        page: safePage,
        pageSize,
        total,
        totalPages,
        q: qRaw,
        date_from: dateFrom,
        date_to: dateTo,
        nonce: res.locals.cspNonce || ''
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

    // คงค่าค้นหา/วันที่/หน้าเดิม
    const page      = req.query.page || 1;
    const pageSize  = req.query.pageSize || 10;
    const q         = req.query.q || '';
    const date_from = req.query.date_from || '';
    const date_to   = req.query.date_to || '';

    // ใช้ URLSearchParams เพื่อ encode ค่าทุกตัวให้ปลอดภัย
    const qs = new URLSearchParams({ page, pageSize, q, date_from, date_to }).toString();
    res.redirect(`/staff/payments?${qs}`);
  });
});

// ---------- Master Data ----------
router.get('/queue-master-data', allowRoles('staff'), async (req, res, next) => {
  try {
    const dentists = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id, pre_name || first_name || ' ' || last_name AS name FROM dentists ORDER BY first_name",
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });

    const units = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id, unit_name AS name FROM dental_units WHERE status='ACTIVE' ORDER BY unit_name",
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });

    res.json({ dentists, units });
  } catch (err) {
    next(err);
  }
});

// ---------- Queue Data ----------
router.get('/queue-data', allowRoles('staff'), async (req, res, next) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'Missing date' });

  try {
    const queueItems = await new Promise((resolve, reject) => {
      const sql = `
        SELECT r.id, r.requested_date AS date, r.requested_time_slot AS time,
               r.patient_id, r.service_description, r.notes, r.status,
               p.first_name, p.last_name
        FROM appointment_requests r
        JOIN patients p ON r.patient_id = p.id
        WHERE r.requested_date = ? AND r.status = 'NEW'
      `;
      db.all(sql, [date], (err, rows) => (err ? reject(err) : resolve(rows)));
    });

    const appointments = await new Promise((resolve, reject) => {
      const sql = `
        SELECT a.id, strftime('%Y-%m-%d', a.start_time) AS date,
               a.dentist_id, a.unit_id,
               strftime('%H:%M', a.start_time) || '-' || strftime('%H:%M', a.end_time) AS slot,
               a.patient_id, a.notes AS service, a.from_request_id,
               p.first_name, p.last_name,
               d.pre_name AS doc_pre_name, d.first_name AS doc_first_name, d.last_name AS doc_last_name,
               u.unit_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN dentists d ON a.dentist_id = d.id
        JOIN dental_units u ON a.unit_id = u.id
        WHERE date(a.start_time) = ? AND a.status = 'SCHEDULED'
      `;
      db.all(sql, [date], (err, rows) => (err ? reject(err) : resolve(rows)));
    });

    res.json({ queueItems, appointments });
  } catch (err) {
    next(err);
  }
});

// ---------- Assign ----------
router.post('/assign-queue', allowRoles('staff'), (req, res, next) => {
  const { requestId, patientId, dentistId, unitId, date, slot, serviceDescription } = req.body;
  const [startTimeStr, endTimeStr] = slot.split('-');
  const start_time = `${date}T${startTimeStr}:00`;
  const end_time = `${date}T${endTimeStr}:00`;

  db.serialize(() => {
    db.run('BEGIN;');
    db.run(
      `INSERT INTO appointments
        (patient_id, dentist_id, unit_id, start_time, end_time, status, notes, from_request_id)
       VALUES (?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`,
      [patientId, dentistId, unitId, start_time, end_time, serviceDescription, requestId],
      function (err) {
        if (err) {
          db.run('ROLLBACK;');
          return next(err);
        }
        db.run(
          "UPDATE appointment_requests SET status='ASSIGNED' WHERE id=?",
          [requestId],
          (err2) => {
            if (err2) {
              db.run('ROLLBACK;');
              return next(err2);
            }
            db.run('COMMIT;');
            res.json({ success: true, appointmentId: this.lastID });
          }
        );
      }
    );
  });
});

router.get('/unit', allowRoles('staff'), (req, res) => {
  res.render('staff/unit', { 
    title: 'จัดการห้องทำฟัน',
    nonce: res.locals.nonce,
    userRole: req.user.role 
  });
});

// API Routes for Units
router.get('/api/units', allowRoles('staff'), async (req, res) => {
  try {
    const units = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM dental_units ORDER BY id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    res.json(units);
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลหน่วยทันตกรรมได้' });
  }
});

router.post('/api/units', async (req, res) => {
  try {
    const { unit_name, status = 'ACTIVE' } = req.body;
    
    if (!unit_name) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อหน่วยทันตกรรม' });
    }

    const result = await db.run(
      'INSERT INTO dental_units (unit_name, status) VALUES (?, ?)',
      [unit_name, status]
    );

    res.json({ 
      id: result.lastID,
      message: 'เพิ่มหน่วยทันตกรรมเรียบร้อยแล้ว'
    });
  } catch (error) {
    console.error('Error creating unit:', error);
    res.status(500).json({ error: 'ไม่สามารถเพิ่มหน่วยทันตกรรมได้' });
  }
});

router.put('/api/units/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { unit_name, status } = req.body;

    let query = 'UPDATE dental_units SET ';
    let params = [];

    if (unit_name !== undefined) {
      query += 'unit_name = ?';
      params.push(unit_name);
    }

    if (status !== undefined) {
      if (unit_name !== undefined) query += ', ';
      query += 'status = ?';
      params.push(status);
    }

    query += ' WHERE id = ?';
    params.push(id);

    await db.run(query, params);

    res.json({ message: 'อัพเดทข้อมูลเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({ error: 'ไม่สามารถอัพเดทข้อมูลหน่วยทันตกรรมได้' });
  }
});

router.delete('/api/units/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // ตรวจสอบว่าหน่วยทันตกรรมถูกใช้งานในการนัดหมายหรือไม่
    const appointments = await db.get(
      'SELECT COUNT(*) as count FROM appointments WHERE unit_id = ?',
      [id]
    );

    if (appointments.count > 0) {
      return res.status(400).json({ 
        error: 'ไม่สามารถลบหน่วยทันตกรรมนี้ได้ เนื่องจากมีการใช้งานในการนัดหมายแล้ว' 
      });
    }

    await db.run('DELETE FROM dental_units WHERE id = ?', [id]);

    res.json({ message: 'ลบหน่วยทันตกรรมเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ error: 'ไม่สามารถลบหน่วยทันตกรรมได้' });
  }
});


module.exports = router;
