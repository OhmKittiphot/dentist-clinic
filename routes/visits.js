const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

router.get('/new/:patientId', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, clinic_number, first_name, last_name FROM patients WHERE id = ?`, [req.params.patientId]
    );
    if (!rows[0]) return res.status(404).send('Patient not found');
    res.render('visits/new', { patient: rows[0] });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const {
    patient_id, visit_date, doctor_name, bp_sys, bp_dia, clinical_notes,
    procedures_codes = [], procedures_teeth = [], procedures_qty = [], procedures_price = []
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [vr] = await conn.query(
      `INSERT INTO visits (patient_id, visit_date, doctor_name, bp_sys, bp_dia, clinical_notes)
       VALUES (?,?,?,?,?,?)`,
      [patient_id, visit_date, doctor_name || null, bp_sys || null, bp_dia || null, clinical_notes || null]
    );
    const visitId = vr.insertId;

    const codes = Array.isArray(procedures_codes) ? procedures_codes : [procedures_codes].filter(Boolean);
    const teeth = Array.isArray(procedures_teeth) ? procedures_teeth : [procedures_teeth].filter(Boolean);
    const qtys  = Array.isArray(procedures_qty)  ? procedures_qty  : [procedures_qty].filter(Boolean);
    const prices= Array.isArray(procedures_price)? procedures_price: [procedures_price].filter(Boolean);

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i] || 'OTHER';
      const tooth = teeth[i] || null;
      const qty = Number(qtys[i] || 1);
      const price_each = Number(prices[i] || 0);
      await conn.query(
        `INSERT INTO procedures (visit_id, code, description, tooth_no, qty, price_each)
         VALUES (?,?,?,?,?,?)`,
        [visitId, code, null, tooth, qty, price_each]
      );
    }

    await conn.commit();
    res.redirect(`/patients`);
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

module.exports = router;
