const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

// GET /patients - Display all patients with search and pagination
router.get('/', (req, res, next) => {
    const searchQuery = req.query.search || '';
    const currentPage = parseInt(req.query.page) || 1;
    const limit = 15; // Number of patients per page
    const offset = (currentPage - 1) * limit;
    const successMessage = req.query.success ? 'สร้างบัญชีผู้ป่วยใหม่สำเร็จแล้ว' : null;

    // Base queries
    let countSql = `SELECT COUNT(id) AS count FROM patients`;
    let sql = `
        SELECT id, pre_name, first_name, last_name, 
               printf('CN%04d', id) as clinic_number, 
               strftime('%d/%m/%Y', created_at) as created_at,
               (strftime('%Y', 'now') - strftime('%Y', birth_date)) - (strftime('%m-%d', 'now') < strftime('%m-%d', birth_date)) AS age
        FROM patients
    `;
    
    const params = [];
    
    // Add search conditions if a query is present
    if (searchQuery) {
        const whereClause = ` WHERE first_name LIKE ? OR last_name LIKE ? OR printf('CN%04d', id) LIKE ? `;
        countSql += whereClause;
        sql += whereClause;
        const searchTerm = `%${searchQuery}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    // First, get the total count of matching patients for pagination
    db.get(countSql, params, (err, row) => {
        if (err) {
            return next(err);
        }
        
        const totalPatients = row.count;
        const totalPages = Math.ceil(totalPatients / limit);

        // Now, get the paginated list of patients
        sql += ` ORDER BY first_name, last_name LIMIT ? OFFSET ?;`;
        const pageParams = [...params, limit, offset];

        db.all(sql, pageParams, (err, patients) => {
            if (err) {
                return next(err);
            }
            res.render('patients/index', { 
                patients: patients, 
                user: req.user,
                userRole: req.user.role, // Pass user role to the template
                searchQuery: searchQuery,
                currentPage: currentPage,
                totalPages: totalPages,
                successMessage: successMessage
            });
        });
    });
});

// GET /patients/:id/edit - Show the form to edit a patient
// Only staff can access this page
router.get('/:id/edit', allowRoles('staff'), (req, res, next) => {
    const patientId = req.params.id;
    const sql = "SELECT *, printf('CN%04d', id) as clinic_number FROM patients WHERE id = ?";

    db.get(sql, [patientId], (err, patient) => {
        if (err) {
            return next(err);
        }
        if (!patient) {
            return res.status(404).send('Patient not found');
        }
        res.render('patients/edit', { 
            patient: patient,
            user: req.user, 
            userRole: req.user.role
        });
    });
});

// POST /patients/:id/edit - Handle the form submission
// Only staff can submit this form
router.post('/:id/edit', allowRoles('staff'), (req, res, next) => {
    const patientId = req.params.id;
    const {
        pre_name, first_name, last_name, gender, birth_date, 
        phone, email, address, race, nationality, religion, drug_allergy
    } = req.body;

    const sql = `
        UPDATE patients SET
            pre_name = ?, first_name = ?, last_name = ?, gender = ?, birth_date = ?,
            phone = ?, email = ?, address = ?, race = ?, nationality = ?, religion = ?, 
            drug_allergy = ?
        WHERE id = ?`;

    const params = [
        pre_name, first_name, last_name, gender, birth_date, 
        phone, email, address, race, nationality, religion, drug_allergy,
        patientId
    ];

    db.run(sql, params, function(err) {
        if (err) {
            return next(err);
        }
        res.redirect('/patients');
    });
});

module.exports = router;
