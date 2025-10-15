const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, clinic_number, first_name, last_name,
              DATE_FORMAT(created_at,'%Y-%m-%d') AS created_at
       FROM patients ORDER BY created_at DESC LIMIT 200`
    );
    res.render('patients/index', { patients: rows });
  } catch (e) { next(e); }
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
  } catch (e) { next(e); }
});

module.exports = router;
