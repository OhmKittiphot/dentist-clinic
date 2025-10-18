// Dentist 
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

// Get Dentist Patients List
router.get('/patients', allowRoles('dentist'), (req, res, next) => {
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
            res.render('dentists/index', {
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

// Get Dentist Patients History
router.get('/patients/:id/history', allowRoles('dentist'), async (req, res, next) => {
    const patientId = req.params.id;

    try {
        // 🦷 ดึงข้อมูลผู้ป่วย
        const patient = await new Promise((resolve, reject) => {
            const sql = `
        SELECT *, 
               printf('CN%04d', id) as clinic_number,
               (strftime('%Y', 'now') - strftime('%Y', birth_date)) - 
               (strftime('%m-%d', 'now') < strftime('%m-%d', birth_date)) AS age
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

        // 💊 ดึงข้อมูล visit ทั้งหมด
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

                const processed = rows.map(v => {
                    let vitalSignsText = 'ไม่มีการบันทึก';
                    try {
                        const vs = JSON.parse(v.vital_signs || '{}');
                        const bp = vs.bp_sys && vs.bp_dia ? `BP: ${vs.bp_sys}/${vs.bp_dia} mmHg` : null;
                        const pulse = vs.pulse_rate ? `Pulse: ${vs.pulse_rate} bpm` : null;
                        vitalSignsText = [bp, pulse].filter(Boolean).join(' | ') || 'ไม่มีการบันทึก';
                    } catch (e) { }

                    let proceduresSummary = '-';
                    try {
                        const procs = JSON.parse(v.procedures_list || '[]');
                        proceduresSummary = procs.map(p => p.description).join(', ') || '-';
                    } catch (e) { }

                    const paymentStatus = v.payment_id ? 'ชำระแล้ว' : 'ยังไม่ชำระ';

                    // ✅ เพิ่มส่วนที่จำเป็นสำหรับรูป
                    return {
                        ...v,
                        vital_signs_text: vitalSignsText,
                        procedures_summary: proceduresSummary,
                        payment_status: paymentStatus,
                        procedures_list_json: v.procedures_list || '[]',
                        xray_images_list_json: v.xray_images_list || '[]'  // ✅ ส่ง JSON string ของรูปไปให้ EJS
                    };
                });


                resolve(processed);
            });
        });

        // 🔹 Render หน้า history
        res.render('dentists/history', {
            patient,
            visits,
            userRole: req.user.role
        });

    } catch (err) {
        console.error(err);
        next(err);
    }
});
// Get Treatments History
router.get('/new/:patient_id', allowRoles('dentist'), (req, res, next) => {
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

                res.render('dentists/treatment', {
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
// ADD Treatment 
router.post('/treatment', allowRoles('dentist'), upload.array('xrays'), (req, res, next) => {
    const {
        patient_id, visit_date, doctor_name, bp_sys, bp_dia, pulse_rate,
        clinical_notes, procedures
    } = req.body;

    const xray_images = req.files ? req.files.map(file => path.join('public', 'uploads', 'xrays', file.filename).replace(/\\/g, '/')) : [];
    const vital_signs = { bp_sys, bp_dia, pulse_rate };

    const visitSql = `
        INSERT INTO visits (patient_id, visit_date, doctor_name, vital_signs, clinical_notes, xray_images_list, procedures_list) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const visitParams = [
        patient_id, visit_date, doctor_name, JSON.stringify(vital_signs),
        clinical_notes, JSON.stringify(xray_images), procedures
    ];

    db.run(visitSql, visitParams, function (err) {
        if (err) return next(err);
        res.redirect(`/dentist/patients/${patient_id}/history?success=true`);
    });
});

module.exports = router;
