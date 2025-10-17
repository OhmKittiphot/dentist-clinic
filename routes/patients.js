const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, allowRoles } = require('../utils/auth');

// Apply authentication to all patient routes
router.use(authenticateToken);

router.get('/', allowRoles('dentist', 'staff'), (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const searchQuery = req.query.search || '';

  let countQuery = `SELECT COUNT(*) as count FROM patients p JOIN users u ON p.user_id = u.id`;
  let query = `
    SELECT 
      p.id, 
      printf('HN%04d', p.id) as clinic_number, 
      p.first_name, 
      p.last_name, 
      u.citizen_id, 
      strftime('%Y-%m-%d', u.created_at) AS created_at
    FROM patients p
    JOIN users u ON p.user_id = u.id
  `;
  const params = [];
  const countParams = [];

  if (searchQuery) {
    const searchPattern = `%${searchQuery}%`;
    const whereClause = ` WHERE p.first_name LIKE ? OR p.last_name LIKE ? OR u.citizen_id LIKE ?`;
    countQuery += whereClause;
    query += whereClause;
    countParams.push(searchPattern, searchPattern, searchPattern);
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY p.id DESC LIMIT ? OFFSET ?`;
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
        searchQuery: searchQuery,
        userRole: req.user.role // Pass user role to the template
      });
    });
  });
});

router.get('/new', allowRoles('staff'), (req, res) => res.render('patients/new', { userRole: req.user.role }));

router.post('/', allowRoles('staff'), (req, res, next) => {
  const { citizen_id, password, prefix, first_name, last_name, gender, birth_date, phone, email, race, nationality, religion, drug_allergy } = req.body;

  // First, create a new user in the users table
  const sqlUser = `INSERT INTO users (citizen_id, password, role, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
  db.run(sqlUser, [citizen_id, password, 'patient'], function(err) {
    if (err) return next(err);

    const user_id = this.lastID;

    // Then, create a new patient in the patients table, linking to the user
    const sqlPatient = `
      INSERT INTO patients (user_id, pre_name, first_name, last_name, gender, birth_date, phone, email, race, nationality, religion, drug_allergy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const paramsPatient = [
      user_id, prefix, first_name, last_name, gender, birth_date,
      phone, email, race, nationality, religion, drug_allergy || 'ไม่มี'
    ];

    db.run(sqlPatient, paramsPatient, function(err) {
      if (err) return next(err);
      res.redirect('/patients');
    });
  });
});

module.exports = router;
