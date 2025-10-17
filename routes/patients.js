
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');

// (GET /) - Main patient list for dentists and staff
router.get('/', allowRoles('dentist', 'staff'), (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 15; // Increased limit
    const offset = (page - 1) * limit;
    const searchQuery = req.query.search || '';

    // Base queries
    let countQuery = `SELECT COUNT(*) as count FROM patients p LEFT JOIN users u ON p.user_id = u.id`;
    let query = `
        SELECT 
            p.id, 
            printf('HN%04d', p.id) as clinic_number, 
            p.pre_name, 
            p.first_name, 
            p.last_name, 
            u.citizen_id,
            strftime('%Y-%m-%d', p.created_at) AS created_at
        FROM patients p
        LEFT JOIN users u ON p.user_id = u.id
    `;
    
    const params = [];
    const countParams = [];

    // Handle search functionality
    if (searchQuery) {
        const searchPattern = `%${searchQuery}%`;
        const whereClause = ` WHERE p.first_name LIKE ? OR p.last_name LIKE ? OR u.citizen_id LIKE ? OR printf('HN%04d', p.id) LIKE ?`;
        countQuery += whereClause;
        query += whereClause;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Add sorting and pagination
    query += ` ORDER BY p.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Execute queries
    db.get(countQuery, countParams, (err, countRow) => {
        if (err) return next(err);

        const count = countRow ? countRow.count : 0;
        db.all(query, params, (err, rows) => {
            if (err) return next(err);

            res.render('patients/index', {
                patients: rows,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                searchQuery: searchQuery,
                userRole: req.user.role,
                title: 'เวชระเบียนผู้ป่วย'
            });
        });
    });
});

// (GET /new) - Form for staff to add a new patient (no user account created)
router.get('/new', allowRoles('staff'), (req, res) => {
    res.render('patients/new', { 
        userRole: req.user.role, 
        patient: {}, // Pass empty object for compatibility with the form
        title: 'เพิ่มผู้ป่วยใหม่' 
    });
});

// (POST /) - Logic for staff to create a new patient
router.post('/', allowRoles('staff'), (req, res, next) => {
    const {
        pre_name, first_name, last_name, gender, birth_date, phone, email, 
        address, race, nationality, religion, drug_allergy
    } = req.body;

    const sql = `
        INSERT INTO patients (pre_name, first_name, last_name, gender, birth_date, phone, email, address, race, nationality, religion, drug_allergy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [pre_name, first_name, last_name, gender, birth_date, phone, email, address, race, nationality, religion, drug_allergy];

    db.run(sql, params, function(err) {
        if (err) return next(err);
        res.redirect('/patients');
    });
});

// Note: Routes for patient history (/:id/history) and new visits (/:id/visits/new) are now
// correctly handled by routes/history.js and routes/visits.js respectively.
// The simplified logic previously here has been removed to avoid conflicts.


module.exports = router;
