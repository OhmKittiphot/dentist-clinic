const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

router.get('/', async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const searchQuery = req.query.search || '';

  try {
    let query = `
      SELECT id, clinic_number, first_name, last_name, strftime('%Y-%m-%d', created_at) AS created_at
      FROM patients
    `;
    let countQuery = `SELECT COUNT(*) as count FROM patients`;
    const params = [];

    if (searchQuery) {
      const searchPattern = `%${searchQuery}%`;
      query += ` WHERE clinic_number LIKE ? OR first_name LIKE ? OR last_name LIKE ?`;
      countQuery += ` WHERE clinic_number LIKE ? OR first_name LIKE ? OR last_name LIKE ?`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [[{ count }]] = await pool.query(countQuery, params.slice(0, params.length - 2));
    const [rows] = await pool.query(query, params);

    res.render('patients/index', {
      patients: rows,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      searchQuery: searchQuery
    });
  } catch (e) {
    next(e);
  }
});

router.get('/new', (req, res) => res.render('patients/new'));

router.post('/', async (req, res, next) => {
  const { clinic_number, first_name, last_name, gender, age, phone } = req.body;
  try {
    await pool.query(
      `INSERT INTO patients (clinic_number, first_name, last_name, gender, age, phone)
       VALUES (?,?,?,?,?,?)`,
      [clinic_number, first_name, last_name, gender || 'X', age || null, phone || null]
    );
    res.redirect('/patients');
  } catch (e) {
    next(e);
  }
});

module.exports = router;
