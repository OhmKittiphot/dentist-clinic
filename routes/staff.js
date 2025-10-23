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

module.exports = router;
