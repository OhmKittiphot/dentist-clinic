const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

router.get('/patients/:id/history', allowRoles('dentist'), async (req, res, next) => {
  const patientId = req.params.id;

  try {
    // 1. Get Patient Info
    const patient = await new Promise((resolve, reject) => {
      const sql = `
        SELECT *, 
               printf('HN%04d', id) as clinic_number,
               (strftime('%Y', 'now') - strftime('%Y', birth_date)) - (strftime('%m-%d', 'now') < strftime('%m-%d', birth_date)) AS age
        FROM patients 
        WHERE id = ?`;
      db.get(sql, [patientId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // 2. Get Visit History with the corrected schema
    const visitsQuery = `
      SELECT
        id,
        visit_date,
        doctor_name,
        vital_signs,       -- JSON string '{"bp_sys":"120", "bp_dia":"80", "pulse_rate":"75"}'
        clinical_notes,
        procedures_list,   -- JSON string of array of objects
        xray_images_list   -- JSON string of array of image paths
      FROM visits
      WHERE patient_id = ?
      ORDER BY visit_date DESC;
    `;

    const visits = await new Promise((resolve, reject) => {
        db.all(visitsQuery, [patientId], (err, rows) => {
            if (err) return reject(err);
            
            // 3. Process each visit to be view-friendly
            const processedVisits = rows.map(v => {
                // Parse vital signs
                let vitalSigns = {};
                let vitalSignsText = 'ไม่มีการบันทึก';
                try {
                    vitalSigns = JSON.parse(v.vital_signs || '{}');
                    const bp = vitalSigns.bp_sys && vitalSigns.bp_dia 
                             ? `BP: ${vitalSigns.bp_sys}/${vitalSigns.bp_dia} mmHg` 
                             : null;
                    const pulse = vitalSigns.pulse_rate
                                ? `Pulse: ${vitalSigns.pulse_rate} bpm`
                                : null;
                    vitalSignsText = [bp, pulse].filter(Boolean).join(' | ') || 'ไม่มีการบันทึก';
                } catch(e) {
                    console.error("Error parsing vital_signs JSON for visit ID:", v.id, e);
                }

                // Parse procedures for summary
                let procedures = [];
                try {
                    procedures = JSON.parse(v.procedures_list || '[]');
                } catch(e) { 
                    console.error("Error parsing procedures_list JSON for visit ID:", v.id, e);
                }
                const proceduresSummary = procedures.map(p => p.description).join(', ') || '-';

                return {
                    ...v, // id, visit_date, doctor_name, clinical_notes
                    vital_signs_text: vitalSignsText,
                    procedures_summary: proceduresSummary,
                    // Pass the raw JSON strings to the template for the modal/details view
                    procedures_list_json: v.procedures_list || '[]',
                    xray_images_list_json: v.xray_images_list || '[]'
                };
            });
            resolve(processedVisits);
        });
    });

    // 4. Render the page
    res.render('patients/history', { 
        patient, 
        visits, 
        layout: 'layouts/main',
        userRole: req.user.role // Pass user role to the template
    });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;
