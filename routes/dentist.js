// routes/dentist.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { allowRoles } = require('../utils/auth');
const multer = require('multer');
const path = require('path');

/* ---------- SLOT มาตรฐาน (แก้ได้ตามจริงของคลินิก) ---------- */
const SLOT_LABELS = [
  '10:00-11:00','11:00-12:00','12:00-13:00',
  '13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00','17:00-18:00'
];

/* ---------- Upload X-ray ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/xrays/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

/* ---------- Helper: หา table ยูนิต ---------- */
function resolveUnitTable(cb) {
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='dental_units';", [], (err, row) => {
    if (err) return cb(err);
    if (row) return cb(null, 'dental_units');
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='units';", [], (err2, row2) => {
      if (err2) return cb(err2);
      return cb(null, row2 ? 'units' : null);
    });
  });
}

/* ===============================
 * รายชื่อผู้ป่วย
 * =============================== */
router.get('/patients', allowRoles('dentist'), (req, res) => {
  const searchQuery = (req.query.search || '').trim();
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 15, 5), 100);
  const offset = (page - 1) * pageSize;

  const countSql = `SELECT COUNT(id) AS count FROM patients`;
  const baseSql = `
    SELECT
      id,
      COALESCE(pre_name,'')   AS pre_name,
      COALESCE(first_name,'') AS first_name,
      COALESCE(last_name,'')  AS last_name,
      COALESCE(phone,'')      AS phone,
      printf('CN%04d', id)    AS clinic_number,
      CASE
        WHEN (SELECT COUNT(*) FROM pragma_table_info('patients') WHERE name='birth_date') = 1
             AND birth_date IS NOT NULL AND birth_date <> ''
        THEN (strftime('%Y','now') - strftime('%Y',birth_date))
             - (strftime('%m-%d','now') < strftime('%m-%d',birth_date))
        ELSE NULL
      END AS age
    FROM patients
  `;

  const params = [];
  let where = '';
  if (searchQuery) {
    where = ` WHERE first_name LIKE ? OR last_name LIKE ? OR printf('CN%04d', id) LIKE ? `;
    const s = `%${searchQuery}%`;
    params.push(s, s, s);
  }

  db.get(countSql + where, params, (err, r) => {
    if (err) {
      return res.render('dentists/index', {
        patients: [],
        user: req.user,
        userRole: req.user.role,
        searchQuery, page, pageSize,
        total: 0, totalPages: 1,
        pageId: 'patients',
        errorMessage: 'ไม่สามารถอ่านจำนวนผู้ป่วยได้: ' + err.message,
        successMessage: null
      });
    }
    const total = r?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const listSql = `
      ${baseSql}
      ${where}
      ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE
      LIMIT ? OFFSET ?;
    `;
    db.all(listSql, [...params, pageSize, offset], (err2, patients) => {
      if (err2) {
        return res.render('dentists/index', {
          patients: [],
          user: req.user,
          userRole: req.user.role,
          searchQuery, page, pageSize,
          total: 0, totalPages: 1,
          pageId: 'patients',
          errorMessage: 'ไม่สามารถอ่านข้อมูลผู้ป่วยได้: ' + err2.message,
          successMessage: null
        });
      }
      res.render('dentists/index', {
        patients,
        user: req.user,
        userRole: req.user.role,
        searchQuery, page, pageSize,
        total, totalPages,
        pageId: 'patients',
        errorMessage: null,
        successMessage: req.query.success ? 'ดำเนินการสำเร็จ' : null
      });
    });
  });
});

/* ===============================
 * ประวัติ/บันทึกการรักษา
 * =============================== */
router.get('/patients/:id/history', allowRoles('dentist'), (req, res, next) => {
  const pid = req.params.id;
  const sqlP = `
    SELECT *, printf('CN%04d', id) as clinic_number,
      CASE
        WHEN (SELECT COUNT(*) FROM pragma_table_info('patients') WHERE name='birth_date') = 1
             AND birth_date IS NOT NULL AND birth_date <> ''
        THEN (strftime('%Y','now') - strftime('%Y',birth_date))
             - (strftime('%m-%d','now') < strftime('%m-%d',birth_date))
        ELSE NULL
      END AS age
    FROM patients WHERE id = ?`;

  const sqlV = `
    SELECT v.*, p.id AS payment_id, p.amount AS payment_amount, p.payment_date, p.status AS payment_status
    FROM visits v LEFT JOIN payments p ON v.id = p.visit_id
    WHERE v.patient_id = ?
    ORDER BY v.visit_date DESC`;

  db.get(sqlP, [pid], (e, patient) => {
    if (e) return next(e);
    if (!patient) return res.status(404).send('Patient not found');
    db.all(sqlV, [pid], (e2, visits) => {
      if (e2) return next(e2);
      res.render('dentists/history', {
        patient, visits,
        userRole: req.user.role,
        page: 'patients'
      });
    });
  });
});

router.get('/new/:patient_id', allowRoles('dentist'), (req, res, next) => {
  const id = req.params.patient_id;
  const sqlP = `SELECT *, printf('CN%04d', id) clinic_number FROM patients WHERE id=?`;
  const sqlPro = `SELECT * FROM procedure_codes ORDER BY description`;
  const sqlDoc = `SELECT pre_name, first_name, last_name FROM dentists WHERE user_id=?`;

  db.get(sqlP, [id], (e, patient) => {
    if (e) return next(e);
    if (!patient) return res.status(404).send('Patient not found');
    db.all(sqlPro, [], (e2, procs) => {
      if (e2) return next(e2);
      db.get(sqlDoc, [req.user.id], (e3, doc) => {
        if (e3) return next(e3);
        const name = doc ? `${doc.pre_name}${doc.first_name} ${doc.last_name}` : '';
        res.render('dentists/treatment', {
          patient,
          user: req.user,
          userRole: req.user.role,
          procedure_codes: procs,
          doctor_name: name,
          page: 'patients'
        });
      });
    });
  });
});

router.post('/treatment', allowRoles('dentist'), upload.array('xrays'), (req, res, next) => {
  const { patient_id, visit_date, doctor_name, bp_sys, bp_dia, pulse_rate, clinical_notes, procedures, amount } = req.body;
  const xray_images = (req.files || []).map(f => `public/uploads/xrays/${f.filename}`);
  const vitals = JSON.stringify({ bp_sys, bp_dia, pulse_rate });

  const qVisit = `
    INSERT INTO visits (patient_id, visit_date, doctor_name, vital_signs, clinical_notes, xray_images_list, procedures_list)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(qVisit,
    [patient_id, visit_date, doctor_name, vitals, clinical_notes, JSON.stringify(xray_images), procedures],
    function (err) {
      if (err) return next(err);
      const visitId = this.lastID;
      db.run(
        `INSERT INTO payments (visit_id, staff_id, amount, payment_date, status)
         VALUES (?, ?, ?, datetime('now'), 'pending')`,
        [visitId, req.user.id, amount || 0],
        (e2) => e2 ? next(e2) : res.redirect(`/dentist/patients/${patient_id}/history?success=1`)
      );
    }
  );
});

/* ===============================
 * หน้าเวลาว่าง + เคสวันนี้
 * =============================== */
router.get('/dentisttime', allowRoles('dentist','staff'), (req, res) => {
  const dentistId = req.user.id;
  const todaySql = `
    SELECT a.id, a.slot_text, a.status,
           du.unit_name,
           p.id AS patient_id,
           p.first_name || ' ' || p.last_name AS patient_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN dental_units du ON a.unit_id = du.id
    WHERE a.dentist_id = ? AND date(a.date) = date('now','localtime')
    ORDER BY a.slot_text`;
  db.all(todaySql, [dentistId], (err, cases) => {
    if (err) {
      return res.render('dentists/dentisttime', {
        user: req.user, userRole: req.user.role, page: 'dentisttime', cases: []
      });
    }
    res.render('dentists/dentisttime', {
      user: req.user, userRole: req.user.role, page: 'dentisttime', cases: cases || []
    });
  });
});

/* ===============================
 * API: Units (ACTIVE)
 * =============================== */
router.get('/api/units', allowRoles('dentist','staff'), (req, res) => {
  resolveUnitTable((err, t) => {
    if (err || !t) return res.json([]);
    db.all(`SELECT id, unit_name, status FROM ${t} WHERE status='ACTIVE' ORDER BY id`, [], (e, rows) => {
      if (e) {
        if (String(e.message || '').includes('no such table')) return res.json([]);
        return res.status(500).json({ error: 'DB error' });
      }
      res.json(rows);
    });
  });
});

/* ===============================
 * API: Availability (อ่าน)
 *   - ปกติ: คืนแถว dentist_availability
 *   - only_free=1: เฉพาะแถว FREE และไม่ชน appointments
 *   - mode=candidates: คืน “ช่วงเวลาที่ยังลงได้” = SLOT_LABELS - saved - booked
 * =============================== */
router.get('/api/availability', allowRoles('dentist','staff'), (req, res) => {
  const dentistId = req.user.id;
  const { date, unit_id, only_free, mode } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

  // ----- โหมด candidates: คืน labels ที่ยังลงได้ -----
  if (mode === 'candidates') {
    if (!unit_id) return res.status(400).json({ error: 'unit_id is required for mode=candidates' });

    const sqlSaved = `
      SELECT slot_text FROM dentist_availability
      WHERE dentist_id=? AND date=? AND unit_id=?`;
    const sqlBooked = `
      SELECT slot_text FROM appointments
      WHERE date=? AND unit_id=?`;

    db.all(sqlSaved, [dentistId, date, unit_id], (e1, savedRows) => {
      if (e1) return res.status(500).json({ error: 'DB error (saved)' });
      db.all(sqlBooked, [date, unit_id], (e2, bookedRows) => {
        if (e2) return res.status(500).json({ error: 'DB error (booked)' });

        const saved = new Set((savedRows || []).map(r => r.slot_text));
        const booked = new Set((bookedRows || []).map(r => r.slot_text));
        const candidates = SLOT_LABELS.filter(s => !saved.has(s) && !booked.has(s));

        return res.json({
          candidates,
          saved: Array.from(saved),
          booked: Array.from(booked)
        });
      });
    });
    return;
  }

  // ----- โหมดปกติ / only_free -----
  let sql = `
    SELECT da.id, da.unit_id, da.date, da.slot_text, da.status
    FROM dentist_availability da
    WHERE da.dentist_id = ? AND da.date = ?`;
  const params = [dentistId, date];

  if (unit_id) { sql += ` AND da.unit_id = ?`; params.push(unit_id); }

  if (String(only_free) === '1') {
    sql += ` AND da.status='FREE'
             AND NOT EXISTS (
               SELECT 1 FROM appointments ap
               WHERE ap.unit_id = da.unit_id
                 AND ap.date    = da.date
                 AND ap.slot_text = da.slot_text
             )`;
  }

  sql += ` ORDER BY da.unit_id, da.slot_text`;

  db.all(sql, params, (err, rows) => {
    if (err) {
      if (String(err.message || '').includes('no such table')) return res.json([]);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

/* ===============================
 * API: Availability (บันทึก) – ล้างแล้วใส่ใหม่ (กันซ้ำด้วย UNIQUE INDEX)
 * =============================== */
// ===== แทนที่ทั้ง handler นี้ =====
router.post('/api/availability', allowRoles('dentist','staff'), express.json(), (req, res) => {
  const dentistId = req.user.id;
  const { date, unit_id, slots } = req.body;

  if (!date || !unit_id || !Array.isArray(slots))
    return res.status(400).json({ error: 'date, unit_id, slots[] are required' });

  // กรองรายการซ้ำ + กรองค่าแปลกๆให้อยู่ใน SLOT_LABELS
  const wanted = Array.from(new Set(slots)).filter(s => SLOT_LABELS.includes(s));

  // 1) หา slot ที่ชนอยู่แล้วกับ unit/day เดียวกัน (ไม่สนว่าเป็นหมอคนใด)
  const qTaken = `
    SELECT slot_text FROM dentist_availability
    WHERE unit_id=? AND date=? AND slot_text IN (${wanted.map(()=>'?').join(',')})
  `;
  // 2) หา slot ที่มีนัดจริง
  const qBooked = `
    SELECT slot_text FROM appointments
    WHERE unit_id=? AND date=? AND slot_text IN (${wanted.map(()=>'?').join(',')})
  `;

  db.serialize(() => {
    db.all(qTaken, [unit_id, date, ...wanted], (e1, takenRows=[]) => {
      if (e1) return res.status(500).json({ error: 'DB error (taken): '+e1.message });
      db.all(qBooked, [unit_id, date, ...wanted], (e2, bookedRows=[]) => {
        if (e2) return res.status(500).json({ error: 'DB error (booked): '+e2.message });

        const conflicts = new Set([
          ...takenRows.map(r=>r.slot_text),
          ...bookedRows.map(r=>r.slot_text),
        ]);
        const okSlots = wanted.filter(s => !conflicts.has(s));

        if (okSlots.length === 0) {
          return res.status(409).json({
            error: 'บางช่วงเวลาถูกใช้แล้ว',
            conflicts: Array.from(conflicts)
          });
        }

        db.run('BEGIN', (be) => {
          if (be) return res.status(500).json({ error: 'DB begin error' });

          // ลบของ "หมอคนนี้" วัน/ห้องนี้ก่อน แล้วใส่ชุดใหม่ (okSlots)
          db.run(
            `DELETE FROM dentist_availability WHERE dentist_id=? AND date=? AND unit_id=?`,
            [dentistId, date, unit_id],
            (de) => {
              if (de) { db.run('ROLLBACK'); return res.status(500).json({ error: 'DB delete error' }); }

              const stmt = db.prepare(
                `INSERT INTO dentist_availability (dentist_id, unit_id, date, slot_text, status)
                 VALUES (?, ?, ?, ?, 'FREE')`
              );

              let insertErr = null;
              okSlots.forEach(s => {
                stmt.run([dentistId, unit_id, date, s], (ie) => { if (ie) insertErr = ie; });
              });
              stmt.finalize((fe) => {
                if (insertErr || fe) {
                  db.run('ROLLBACK');
                  // ถ้าเกิด constraint ที่นี่ แปลว่า race condition ใส่ซ้อนระหว่างหมอหลายคนในเสี้ยววินาที
                  const msg = (insertErr || fe).message || 'insert error';
                  return res.status(409).json({ error: 'บางช่วงเวลาถูกใช้แล้ว (race)', detail: msg });
                }
                db.run('COMMIT', (ce) => {
                  if (ce) return res.status(500).json({ error: 'DB commit error' });
                  res.json({ ok: true, saved: okSlots.length, conflicts: Array.from(conflicts) });
                });
              });
            }
          );
        });
      });
    });
  });
});


module.exports = router;
