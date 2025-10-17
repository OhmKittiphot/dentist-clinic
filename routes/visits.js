
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');
const multer = require('multer');
const path = require('path');

// Multer disk storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/xrays/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// (GET /new/:patient_id) - Display form to add a new visit
router.get('/new/:patient_id', allowRoles('dentist'), (req, res, next) => {
  const patient_id = req.params.patient_id;
  const patientSql = `SELECT *, printf('HN%04d', id) as clinic_number, (strftime('%Y', 'now') - strftime('%Y', birth_date)) - (strftime('%m-%d', 'now') < strftime('%m-%d', birth_date)) AS age FROM patients WHERE id = ?`;
  const proceduresSql = `SELECT * FROM procedure_codes ORDER BY description`;

  db.get(patientSql, [patient_id], (err, patient) => {
    if (err) return next(err);
    if (!patient) return res.status(404).send('Patient not found');

    db.all(proceduresSql, [], (err, procedure_codes) => {
        if (err) return next(err);
        
        res.render('visits/new', { 
            patient: patient, 
            user: req.user,
            userRole: req.user.role,
            procedure_codes: procedure_codes,
            nonce: res.locals.nonce
        });
    });
  });
});

// (POST /) - Handle new visit form submission
router.post('/', allowRoles('dentist'), upload.array('xrays'), (req, res, next) => {
    const { 
        patient_id, 
        visit_date, 
        doctor_name,
        bp_sys,
        bp_dia,
        clinical_notes,
        procedures // This is a JSON string
    } = req.body;

    const xray_images = req.files ? req.files.map(file => path.join('/uploads', 'xrays', file.filename).replace(/\\/g, '/')) : [];

    const vital_signs = {
        bp_sys: bp_sys,
        bp_dia: bp_dia
    };

    const visitSql = `
        INSERT INTO visits (patient_id, visit_date, doctor_name, vital_signs, clinical_notes, xray_images_list, procedures_list) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const visitParams = [
        patient_id,
        visit_date,
        doctor_name,
        JSON.stringify(vital_signs),
        clinical_notes,
        JSON.stringify(xray_images),
        procedures // Already a JSON string from the form
    ];

    db.run(visitSql, visitParams, function(err) {
        if (err) {
            console.error("Error inserting visit:", err.message);
            console.error("Error details:", err);
            return next(err);
        }
        console.log(`A new visit has been created with ID: ${this.lastID} for patient ID: ${patient_id}`);
        res.redirect(`/patients/${patient_id}/history`);
    });
});

module.exports = router;
