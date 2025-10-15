const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const searchQuery = req.query.search || '';

  let countQuery = `SELECT COUNT(*) as count FROM patients`;
  let query = `
    SELECT id, clinic_number, first_name, last_name, strftime('%Y-%m-%d', created_at) AS created_at
    FROM patients
  `;
  const params = [];
  const countParams = [];

  if (searchQuery) {
    const searchPattern = `%${searchQuery}%`;
    const whereClause = ` WHERE clinic_number LIKE ? OR first_name LIKE ? OR last_name LIKE ?`;
    countQuery += whereClause;
    query += whereClause;
    countParams.push(searchPattern, searchPattern, searchPattern);
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  db.get(countQuery, countParams, (err, countRow) => {
    if (err) return next(err);

    const count = countRow.count;
    db.all(query, params, (err, rows) => {
      if (err) return next(err);

      res.render('patients/index', {
        patients: rows,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        searchQuery: searchQuery
      });
    });
  });
});

router.get('/new', (req, res) => res.render('patients/new'));

router.post('/', (req, res, next) => {
  const { clinic_number, first_name, last_name, gender, age, phone } = req.body;
  const sql = `
    INSERT INTO patients (clinic_number, first_name, last_name, gender, age, phone)
    VALUES (?,?,?,?,?,?)
  `;
  const params = [clinic_number, first_name, last_name, gender || 'X', age || null, phone || null];

  db.run(sql, params, function(err) {
    if (err) return next(err);
    res.redirect('/patients');
  });
});

module.exports = router;
