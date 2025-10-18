
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

router.get('/patients/:id/history', allowRoles('dentist', 'staff'), async (req, res, next) => {
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

    // 2. Get Visit History with Payment Status
    const visitsQuery = `
      SELECT
        v.id,
        v.visit_date,
        v.doctor_name,
        v.vital_signs,
        v.clinical_notes,
        v.procedures_list,
        v.xray_images_list,
        p.id as payment_id,
        p.amount as payment_amount,
        p.payment_date
      FROM visits v
      LEFT JOIN payments p ON v.id = p.visit_id
      WHERE v.patient_id = ?
      ORDER BY v.visit_date DESC;
    `;

    const visits = await new Promise((resolve, reject) => {
        db.all(visitsQuery, [patientId], (err, rows) => {
            if (err) return reject(err);
            
            // 3. Process each visit to be view-friendly
            const processedVisits = rows.map(v => {
                // ... (Vital Signs and Procedures processing remains the same)
                let vitalSignsText = 'ไม่มีการบันทึก';
                 try {
                    const vitalSigns = JSON.parse(v.vital_signs || '{}');
                    const bp = vitalSigns.bp_sys && vitalSigns.bp_dia ? `BP: ${vitalSigns.bp_sys}/${vitalSigns.bp_dia} mmHg` : null;
                    const pulse = vitalSigns.pulse_rate ? `Pulse: ${vitalSigns.pulse_rate} bpm` : null;
                    vitalSignsText = [bp, pulse].filter(Boolean).join(' | ') || 'ไม่มีการบันทึก';
                } catch(e) { console.error("Error parsing vital_signs for visit:", v.id, e); }

                let proceduresSummary = '-';
                try {
                    const procedures = JSON.parse(v.procedures_list || '[]');
                    proceduresSummary = procedures.map(p => p.description).join(', ') || '-';
                } catch(e) { console.error("Error parsing procedures for visit:", v.id, e); }

                // Add Payment Status and Details
                const paymentStatus = v.payment_id ? 'ชำระแล้ว' : 'ยังไม่ชำระ';
                const paymentDetails = v.payment_id ? {
                    amount: v.payment_amount,
                    date: new Date(v.payment_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric'})
                } : null;


                return {
                    ...v, 
                    payment_status: paymentStatus,
                    payment_details_json: JSON.stringify(paymentDetails),
                    vital_signs_text: vitalSignsText,
                    procedures_summary: proceduresSummary,
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
        userRole: req.user.role
    });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

module.exports = router;
