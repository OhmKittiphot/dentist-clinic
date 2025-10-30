// routes/staff.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

/* ---------- Helper: เลือกชื่อตารางยูนิตแบบอัตโนมัติ ---------- */
/** จะใช้ 'dental_units' ถ้ามีอยู่; ถ้าไม่มีจึง fallback ไป 'units' (กันโค้ดเก่า) */
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
 * 🔹 Edit Patient (คงเดิม)
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
 * 🔹 Payments (เหมือนเดิม, มี sort)
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

// GET /staff/queue-master-data
router.get('/queue-master-data', allowRoles('staff'), (req, res) => {
  // ดึงข้อมูลทันตแพทย์
  const dentistsQuery = `
    SELECT d.id, d.license_number, d.pre_name, d.first_name, d.last_name, 
           u.email, u.citizen_id
    FROM dentists d
    JOIN users u ON d.user_id = u.id
    WHERE d.status = 'ACTIVE'
  `;

  // ดึงข้อมูลหน่วยทันตกรรม
  const unitsQuery = `
    SELECT id, unit_name as name, status 
    FROM dental_units 
    WHERE status = 'ACTIVE'
  `;

  db.all(dentistsQuery, [], (err, dentists) => {
    if (err) {
      console.error('Dentists query error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    db.all(unitsQuery, [], (err2, units) => {
      if (err2) {
        console.error('Units query error:', err2);
        return res.status(500).json({ error: 'Internal server error' });
      }

      const formattedDentists = dentists.map(d => ({
        id: d.id,
        name: `${d.pre_name || ''}${d.first_name} ${d.last_name}`.trim(),
        license_number: d.license_number,
        email: d.email
      }));

      res.json({
        dentists: formattedDentists,
        units: units
      });
    });
  });
});

/* ===============================
 * 🔹 Queue Data (แก้เป็น callback)
 * =============================== */
router.get('/queue-data', allowRoles('staff'), (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  // ดึงข้อมูลคิวจาก appointment_requests
  const queueItemsQuery = `
    SELECT ar.id, ar.patient_id, ar.requested_date as date, 
           ar.requested_time_slot as time, ar.treatment as service_description,
           ar.status, ar.notes,
           p.first_name, p.last_name, p.pre_name
    FROM appointment_requests ar
    LEFT JOIN patients p ON ar.patient_id = p.id
    WHERE ar.requested_date = ? 
    ORDER BY ar.requested_time_slot
  `;

  // ดึงข้อมูลนัดหมายที่จัดแล้ว
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
    WHERE a.date = ?
    ORDER BY a.slot_text
  `;

  db.all(queueItemsQuery, [date], (err, queueItems) => {
    if (err) {
      console.error('Queue items query error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    db.all(appointmentsQuery, [date], (err2, appointments) => {
      if (err2) {
        console.error('Appointments query error:', err2);
        return res.status(500).json({ error: 'Internal server error' });
      }

      const formattedQueueItems = queueItems.map(item => ({
        ...item,
        service: item.service_description,
        status: item.status ? item.status.toLowerCase() : 'new'
      }));

      res.json({
        queueItems: formattedQueueItems,
        appointments: appointments
      });
    });
  });
});

/* ===============================
 * 🔹 Assign Queue (แก้เป็น callback)
 * =============================== */
router.post('/assign-queue', allowRoles('staff'), (req, res) => {
  const { requestId, patientId, dentistId, unitId, date, slot, serviceDescription } = req.body;

  if (!requestId || !patientId || !dentistId || !unitId || !date || !slot) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // เริ่ม transaction
  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      console.error('Begin transaction error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    // สร้างนัดหมายใหม่
    const insertAppointmentQuery = `
      INSERT INTO appointments (patient_id, dentist_id, unit_id, date, slot_text, status, from_request_id)
      VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
    `;

    db.run(insertAppointmentQuery, [patientId, dentistId, unitId, date, slot, requestId], function(err2) {
      if (err2) {
        console.error('Insert appointment error:', err2);
        return db.run('ROLLBACK', () => {
          res.status(500).json({ error: 'Internal server error' });
        });
      }

      const appointmentId = this.lastID;

      // อัพเดทสถานะคำขอนัดหมาย
      const updateRequestQuery = `
        UPDATE appointment_requests 
        SET status = 'SCHEDULED' 
        WHERE id = ?
      `;

      db.run(updateRequestQuery, [requestId], (err3) => {
        if (err3) {
          console.error('Update request error:', err3);
          return db.run('ROLLBACK', () => {
            res.status(500).json({ error: 'Internal server error' });
          });
        }

        // Commit transaction
        db.run('COMMIT', (err4) => {
          if (err4) {
            console.error('Commit error:', err4);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({ 
            success: true, 
            appointmentId: appointmentId,
            message: 'จัดคิวสำเร็จ'
          });
        });
      });
    });
  });
});

/* ===============================
 * 🔹 Unit API (สำหรับ unit.js)
 *      → ตอนนี้จะอ่านจาก 'dental_units' เป็นหลัก
 *        ถ้าไม่มีตารางนี้ จะ fallback ไป 'units'
 * =============================== */

// GET all units
router.get('/api/units', allowRoles('staff'), (req, res, next) => {
  resolveUnitTable((err, tableName) => {
    if (err) return next(err);
    db.all(`SELECT id, unit_name, status FROM ${tableName} ORDER BY id`, [], (e, rows) => {
      if (e) return res.status(500).json({ error: 'Database error while fetching units.' });
      res.json(rows);
    });
  });
});

// POST a new unit
router.post('/api/units', allowRoles('staff'), (req, res, next) => {
  const { unit_name, status } = req.body;
  if (!unit_name) {
    return res.status(400).json({ error: 'Unit name is required.' });
  }
  resolveUnitTable((err, tableName) => {
    if (err) return next(err);
    const sql = `INSERT INTO ${tableName} (unit_name, status) VALUES (?, ?)`;
    db.run(sql, [unit_name, status || 'ACTIVE'], function(e) {
      if (e) {
        return res.status(500).json({ error: 'Database error while creating a unit.' });
      }
      res.status(201).json({ id: this.lastID, unit_name, status: status || 'ACTIVE' });
    });
  });
});

// PUT (update) a unit
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

    db.run(sql, params, function(e) {
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

// DELETE a unit
router.delete('/api/units/:id', allowRoles('staff'), (req, res, next) => {
  const { id } = req.params;
  resolveUnitTable((err, tableName) => {
    if (err) return next(err);
    const sql = `DELETE FROM ${tableName} WHERE id = ?`;
    db.run(sql, [id], function(e) {
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

module.exports = router;
