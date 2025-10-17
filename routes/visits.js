const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/xrays/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

router.get('/new/:patient_id', allowRoles('dentist', 'staff'), (req, res, next) => {
    const patient_id = req.params.patient_id;
    const patientSql = `SELECT *, printf('CN%04d', id) as clinic_number, (strftime('%Y', 'now') - strftime('%Y', birth_date)) - (strftime('%m-%d', 'now') < strftime('%m-%d', birth_date)) AS age FROM patients WHERE id = ?`;
    const proceduresSql = `SELECT * FROM procedure_codes ORDER BY description`;
    const dentistSql = `SELECT pre_name, first_name, last_name FROM dentists WHERE user_id = ?`;

    db.get(patientSql, [patient_id], (err, patient) => {
        if (err) return next(err);
        if (!patient) return res.status(404).send('Patient not found');

        db.all(proceduresSql, [], (err, procedure_codes) => {
            if (err) return next(err);

            // Fetch the logged-in dentist's name
            db.get(dentistSql, [req.user.id], (err, dentist) => {
                if (err) return next(err);

                const doctorName = (req.user.role === 'dentist' && dentist) 
                    ? `${dentist.pre_name}${dentist.first_name} ${dentist.last_name}` 
                    : '';

                res.render('visits/new', { 
                    patient,
                    user: req.user,
                    userRole: req.user.role,
                    procedure_codes,
                    doctor_name: doctorName,
                    nonce: res.locals.nonce
                });
            });
        });
    });
});

router.post('/', allowRoles('dentist', 'staff'), upload.array('xrays'), (req, res, next) => {
    const { 
        patient_id, visit_date, doctor_name, bp_sys, bp_dia, pulse_rate,
        clinical_notes, procedures
    } = req.body;

    const xray_images = req.files ? req.files.map(file => path.join('/uploads', 'xrays', file.filename).replace(/\\/g, '/')) : [];
    const vital_signs = { bp_sys, bp_dia, pulse_rate };

    const visitSql = `
        INSERT INTO visits (patient_id, visit_date, doctor_name, vital_signs, clinical_notes, xray_images_list, procedures_list) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const visitParams = [
        patient_id, visit_date, doctor_name, JSON.stringify(vital_signs),
        clinical_notes, JSON.stringify(xray_images), procedures
    ];

    db.run(visitSql, visitParams, function(err) {
        if (err) return next(err);
        res.redirect(`/patients/${patient_id}/history`);
    });
});

module.exports = router;
