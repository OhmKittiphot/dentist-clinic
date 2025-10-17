const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

router.get('/patients/:id/history', allowRoles('dentist'), async (req, res, next) => {
  const patientId = req.params.id;

  try {
    const patient = await new Promise((resolve, reject) => {
      db.get(`SELECT *, printf('HN%04d', id) as clinic_number FROM patients WHERE id = ?`, [patientId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Corrected Query: Removed non-existent columns (pulse, temperature, respiratory_rate)
    const visitsQuery = `
      SELECT
        v.id,
        v.visit_date,
        v.doctor_name,
        v.bp_sys,
        v.bp_dia,
        v.clinical_notes,
        (SELECT json_group_array(json_object('description', p.description, 'tooth_no', p.tooth_no)) FROM procedures p WHERE p.visit_id = v.id) as procedures_json,
        (SELECT json_group_array(xi.image_path) FROM xray_images xi WHERE xi.visit_id = v.id) as xrays_json
      FROM visits v
      WHERE v.patient_id = ?
      ORDER BY v.visit_date DESC;
    `;

    const visits = await new Promise((resolve, reject) => {
        db.all(visitsQuery, [patientId], (err, rows) => {
            if (err) return reject(err);
            
            const processedVisits = rows.map(v => {
                let procedures = [];
                try {
                    procedures = JSON.parse(v.procedures_json || '[]');
                } catch(e) { 
                    console.error("Error parsing procedures JSON for visit ID:", v.id, e);
                }

                const proceduresSummary = procedures.map(p => p.description).join(', ') || '-';

                // Corrected Vital Signs: Only use existing bp_sys and bp_dia columns
                const vitalSignsText = [
                    v.bp_sys && v.bp_dia ? `BP: ${v.bp_sys}/${v.bp_dia} mmHg` : null
                ].filter(Boolean).join(' | ');

                return {
                    ...v,
                    procedures_summary: proceduresSummary,
                    procedures_list_json: v.procedures_json || '[]',
                    xray_images_list_json: v.xrays_json || '[]',
                    vital_signs_text: vitalSignsText || 'ไม่มีการบันทึก'
                };
            });
            resolve(processedVisits);
        });
    });

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
