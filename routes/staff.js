// Staff
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');
const multer = require('multer');
const path = require('path');


//
// 🦷 1. GET /staff/patients - แสดงรายชื่อผู้ป่วย
//
router.get('/patients', allowRoles('staff'), (req, res, next) => {
    const searchQuery = req.query.search || '';
    const currentPage = parseInt(req.query.page) || 1;
    const limit = 15;
    const offset = (currentPage - 1) * limit;
    const successMessage = req.query.success ? 'สร้างบัญชีผู้ป่วยใหม่สำเร็จแล้ว' : null;

    let countSql = `SELECT COUNT(id) AS count FROM patients`;
    let sql = `
      SELECT id, pre_name, first_name, last_name, phone, 
             printf('CN%04d', id) as clinic_number, 
             strftime('%d/%m/%Y', created_at) as created_at,
             (strftime('%Y', 'now') - strftime('%Y', birth_date)) - 
             (strftime('%m-%d', 'now') < strftime('%m-%d', birth_date)) AS age
      FROM patients
  `;

    const params = [];
    if (searchQuery) {
        const whereClause = ` WHERE first_name LIKE ? OR last_name LIKE ? OR printf('CN%04d', id) LIKE ? `;
        countSql += whereClause;
        sql += whereClause;
        const searchTerm = `%${searchQuery}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    db.get(countSql, params, (err, row) => {
        if (err) return next(err);
        const totalPatients = row.count;
        const totalPages = Math.ceil(totalPatients / limit);

        sql += ` ORDER BY first_name, last_name LIMIT ? OFFSET ?;`;
        db.all(sql, [...params, limit, offset], (err, patients) => {
            if (err) return next(err);
            res.render('staff/index', {
                patients,
                user: req.user,
                userRole: req.user.role,
                searchQuery,
                currentPage,
                totalPages,
                successMessage
            });
        });
    });
});


// Edit Patient
router.get('/patients/:id/edit', allowRoles('staff'), (req, res, next) => {
    const patientId = req.params.id;
    const sql = "SELECT *, printf('CN%04d', id) as clinic_number FROM patients WHERE id = ?";
    db.get(sql, [patientId], (err, patient) => {
        if (err) return next(err);
        if (!patient) return res.status(404).send('Patient not found');
        res.render('staff/edit', {
            patient,
            user: req.user,
            userRole: req.user.role
        });
    });
});

// Post Edit Patient
router.post('/patients/:id/edit', allowRoles('staff'), (req, res, next) => {
    const patientId = req.params.id;
    const {
        pre_name, first_name, last_name, gender, birth_date,
        phone, email, address, race, nationality, religion, drug_allergy
    } = req.body;

    const sql = `
    UPDATE patients SET
      pre_name = ?, first_name = ?, last_name = ?, gender = ?, birth_date = ?,
      phone = ?, email = ?, address = ?, race = ?, nationality = ?, religion = ?, drug_allergy = ?
    WHERE id = ?
  `;
    const params = [
        pre_name, first_name, last_name, gender, birth_date,
        phone, email, address, race, nationality, religion, drug_allergy, patientId
    ];

    db.run(sql, params, err => {
        if (err) return next(err);
        res.redirect('/staff/patients');
    });
});

// Payment
router.post('/payments', allowRoles('staff'), (req, res, next) => {
    
});

module.exports = router;
