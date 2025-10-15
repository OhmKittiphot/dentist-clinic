const express = require('express');
const router = express.Router();
const db = require('../db');

// Enhanced history fetching logic
router.get('/patients/:id/history', async (req, res, next) => {
  const patientId = req.params.id;

  try {
    const patient = await new Promise((resolve, reject) => {
      db.get(`SELECT *, printf('HN%04d', id) as clinic_number FROM patients WHERE id = ?`, [patientId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    const visits = await new Promise((resolve, reject) => {
      const sql = `
        SELECT
          v.id,
          v.visit_date,
          v.doctor_name,
          v.bp_sys,
          v.bp_dia,
          v.clinical_notes,
          (SELECT GROUP_CONCAT(p.description, '; ') FROM procedures p WHERE p.visit_id = v.id) as procedures_summary,
          (SELECT GROUP_CONCAT(p.description || ' (ซี่ ' || p.tooth_no || ')', '; ') FROM procedures p WHERE p.visit_id = v.id) as procedures_list,
          (SELECT GROUP_CONCAT(xi.image_path, ';') FROM xray_images xi WHERE xi.visit_id = v.id) as xray_images_list
        FROM visits v
        WHERE v.patient_id = ?
        ORDER BY v.visit_date DESC;
      `;
      db.all(sql, [patientId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.render('patients/history', { patient, visits });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
