const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// GET /patients/:patientId/history  -> show all visits with procedures & x-rays
router.get('/patients/:patientId/history', async (req, res, next) => {
  const patientId = req.params.patientId;
  try {
    const [[patient]] = await pool.query(
      `SELECT id, clinic_number, first_name, last_name FROM patients WHERE id=?`, [patientId]
    );
    if (!patient) return res.status(404).send('Patient not found');

    // visits + summary amount
    const [visits] = await pool.query(
      `SELECT v.id, v.visit_date, v.doctor_name, v.bp_sys, v.bp_dia, v.clinical_notes,
              COALESCE(SUM(p.qty * p.price_each), 0) AS total_amount,
              COUNT(p.id) AS total_procedures
       FROM visits v
       LEFT JOIN procedures p ON p.visit_id = v.id
       WHERE v.patient_id = ?
       GROUP BY v.id, v.visit_date, v.doctor_name, v.bp_sys, v.bp_dia, v.clinical_notes
       ORDER BY v.visit_date DESC, v.id DESC`,
      [patientId]
    );

    const visitIds = visits.map(v => v.id);
    let procedures = [];
    let xrays = [];
    if (visitIds.length) {
      const [procRows] = await pool.query(
        `SELECT id, visit_id, code, description, tooth_no, qty, price_each
         FROM procedures WHERE visit_id IN (${visitIds.map(()=>'?').join(',')})
         ORDER BY id ASC`, visitIds
      );
      procedures = procRows;
      const [xrayRows] = await pool.query(
        `SELECT id, visit_id, image_url, note, created_at
         FROM xray_images WHERE visit_id IN (${visitIds.map(()=>'?').join(',')})
         ORDER BY id ASC`, visitIds
      );
      xrays = xrayRows;
    }

    // group by visit_id
    const procMap = new Map();
    procedures.forEach(p => {
      if (!procMap.has(p.visit_id)) procMap.set(p.visit_id, []);
      procMap.get(p.visit_id).push(p);
    });
    const xrayMap = new Map();
    xrays.forEach(x => {
      if (!xrayMap.has(x.visit_id)) xrayMap.set(x.visit_id, []);
      xrayMap.get(x.visit_id).push(x);
    });

    res.render('history/index', { patient, visits, procMap, xrayMap });
  } catch (e) { next(e); }
});

module.exports = router;
