// routes/staff.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

// ===============================
// 🔹 Patients List
// ===============================
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
    db.all(sql, [...params, limit, offset], (err, patients) => {
      if (err) return next(err);
      res.render('staff/index', {
        patients,
        user: req.user,
        userRole: req.user.role,
        searchQuery,
        currentPage,
        totalPages,
        successMessage,
        page: 'patients'
      });
    });
  });
});

// ===============================
// 🔹 Edit Patient
// ===============================
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

// ===============================
// 🔹 Payments List + Pagination
// ===============================
router.get('/payments', allowRoles('staff'), (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const q = req.query.q || '';
  const date_from = req.query.date_from || '';
  const date_to = req.query.date_to || '';
  const offset = (page - 1) * pageSize;

  // สร้างเงื่อนไขค้นหาแบบ flexible
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
    ORDER BY COALESCE(p.payment_date, '0001-01-01') DESC, p.id DESC
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
        date_to
      });
    });
  });
});

// ===============================
// 🔹 Confirm Payment
// ===============================
router.post('/payments/:id/complete', allowRoles('staff'), (req, res, next) => {
  const sql = `
    UPDATE payments
    SET status = 'paid',
        payment_date = datetime('now')
    WHERE id = ?
  `;
  db.run(sql, [req.params.id], (err) => {
    if (err) return next(err);
    res.redirect('/staff/payments');
  });
});

module.exports = router;
