const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const upload = multer({ dest: 'public/uploads/' });
const { allowRoles } = require('../utils/auth');

// Display form to add a new visit - Only Dentists can access
router.get('/new/:patient_id', allowRoles('dentist'), (req, res, next) => {
  const patient_id = req.params.patient_id;
  db.get('SELECT * FROM patients WHERE id = ?', [patient_id], (err, patient) => {
    if (err) return next(err);
    db.all('SELECT * FROM procedure_codes', [], (err, procedure_codes) => {
        if (err) return next(err);
        res.render('visits/new', { patient: patient, procedure_codes: procedure_codes, userRole: req.user.role });
    });
  });
});

// Handle new visit form submission - Only Dentists can submit
router.post('/', allowRoles('dentist'), upload.array('xrays'), (req, res, next) => {
  const { patient_id, visit_date, doctor_name, bp_sys, bp_dia, clinical_notes, procedures } = req.body;
  const visitSql = `INSERT INTO visits (patient_id, visit_date, doctor_name, bp_sys, bp_dia, clinical_notes) VALUES (?, ?, ?, ?, ?, ?)`;
  const visitParams = [patient_id, visit_date, doctor_name, bp_sys, bp_dia, clinical_notes];

  db.run(visitSql, visitParams, function(err) {
    if (err) return next(err);
    const visit_id = this.lastID;

    if (procedures) {
        const procList = JSON.parse(procedures);
        const procSql = `INSERT INTO procedures (visit_id, code, description, tooth_no, qty, price_each) VALUES (?, ?, ?, ?, ?, ?)`;
        procList.forEach(p => {
            db.run(procSql, [visit_id, p.code, p.description, p.tooth_no, p.qty, p.price_each]);
        });
    }

    const xraySql = `INSERT INTO xray_images (visit_id, image_path) VALUES (?, ?)`;
    if(req.files){
        req.files.forEach(file => {
            db.run(xraySql, [visit_id, '/uploads/' + file.filename]);
        });
    }
    
    res.redirect(`/patients`);
  });
});

module.exports = router;
