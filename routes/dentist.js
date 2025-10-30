// routes/dentist.js (MySQL + S3 version)
const express = require('express');
const router = express.Router();
const db = require('../db'); // mysql2/promise Pool
const { allowRoles } = require('../utils/auth');

const path = require('path');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

/* =========================================================
 * 1) SLOT มาตรฐาน (ปรับตามเวลาคลินิกได้)
 * ========================================================= */
const SLOT_LABELS = [
  '10:00-11:00', '11:00-12:00', '12:00-13:00',
  '13:00-14:00', '14:00-15:00', '15:00-16:00',
  '16:00-17:00', '17:00-18:00'
];

/* =========================================================
 * 2) อัปโหลด X-ray ขึ้น S3 (แทน diskStorage)
 *    ต้องมี ENV: AWS_REGION, S3_BUCKET (ตัวเลือก S3_PREFIX)
 * ========================================================= */
const s3 = new S3Client({ region: process.env.AWS_REGION });
const S3_PREFIX = process.env.S3_PREFIX ? `${process.env.S3_PREFIX.replace(/\/+$/,'')}/` : '';

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    // ถ้าต้องการ private objects ให้ลบ ACL นี้ แล้วไปทำ presigned URL ตอนดึงมาแสดงแทน
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const pid = req.body.patient_id || 'unknown';
      const name = `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`;
      cb(null, `${S3_PREFIX}${pid}/${name}`);
    }
  })
});

/* =========================================================
 * 3) Helpers
 * ========================================================= */
const q = async (sql, params = []) => {
  const [rows] = await db.execute(sql, params);
  return rows;
};

async function resolveUnitTable() {
  const rows = await q(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN ('dental_units','units')
     ORDER BY FIELD(table_name,'dental_units','units')`
  );
  return rows?.[0]?.table_name || null;
}

/* =========================================================
 * รายชื่อผู้ป่วย (Dentist)
 * ========================================================= */
router.get('/patients', allowRoles('dentist'), async (req, res) => {
  try {
    const searchQuery = (req.query.search || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 15, 5), 100);
    const offset = (page - 1) * pageSize;

    // ตรวจว่ามี birth_date ไหม (สำหรับคำนวณอายุ)
    const hasBirth = await q(
      `SELECT COUNT(*) AS c
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'patients'
         AND column_name = 'birth_date'`
    );
    const hasBirthDateCol = (hasBirth?.[0]?.c || 0) > 0;

    const clinicNumberExpr = `CONCAT('CN', LPAD(p.id, 4, '0'))`;
    const ageExpr = hasBirthDateCol
      ? `TIMESTAMPDIFF(YEAR, p.birth_date, CURDATE())`
      : `NULL`;

    let where = '';
    const params = [];
    if (searchQuery) {
      where = ` WHERE p.first_name LIKE ? OR p.last_name LIKE ? OR ${clinicNumberExpr} LIKE ? `;
      const s = `%${searchQuery}%`;
      params.push(s, s, s);
    }

    const countRows = await q(`SELECT COUNT(p.id) AS count FROM patients p ${where}`, params);
    const total = countRows?.[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const listSql = `
      SELECT
        p.id,
        COALESCE(p.pre_name,'')   AS pre_name,
        COALESCE(p.first_name,'') AS first_name,
        COALESCE(p.last_name,'')  AS last_name,
        COALESCE(p.phone,'')      AS phone,
        ${clinicNumberExpr}       AS clinic_number,
        ${ageExpr}                AS age
      FROM patients p
      ${where}
      ORDER BY p.last_name, p.first_name
      LIMIT ? OFFSET ?;
    `;
    const patients = await q(listSql, [...params, pageSize, offset]);

    return res.render('dentists/index', {
      patients,
      user: req.user,
      userRole: req.user.role,
      searchQuery, page, pageSize,
      total, totalPages,
      pageId: 'patients',
      errorMessage: null,
      successMessage: req.query.success ? 'ดำเนินการสำเร็จ' : null
    });
  } catch (err) {
    return res.render('dentists/index', {
      patients: [],
      user: req.user,
      userRole: req.user.role,
      searchQuery: req.query.search || '', page: 1, pageSize: 15,
      total: 0, totalPages: 1,
      pageId: 'patients',
      errorMessage: 'ไม่สามารถอ่านข้อมูลผู้ป่วยได้: ' + err.message,
      successMessage: null
    });
  }
});

/* =========================================================
 * ประวัติ/บันทึกการรักษา (ดึง visits + payments)
 *  - รวมคอลัมน์ xray_s3_urls เพื่อแสดงรูปจาก S3 ได้
 * ========================================================= */
router.get('/patients/:id/history', allowRoles('dentist'), async (req, res, next) => {
  try {
    const pid = req.params.id;

    const hasBirth = await q(
      `SELECT COUNT(*) AS c
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'patients'
         AND column_name = 'birth_date'`
    );
    const ageExpr = (hasBirth?.[0]?.c || 0) > 0
      ? `TIMESTAMPDIFF(YEAR, birth_date, CURDATE())`
      : `NULL`;

    const patientRows = await q(
      `SELECT p.*, CONCAT('CN', LPAD(p.id,4,'0')) AS clinic_number, ${ageExpr} AS age
       FROM patients p WHERE p.id = ?`,
      [pid]
    );
    const patient = patientRows?.[0];
    if (!patient) return res.status(404).send('Patient not found');

    const visits = await q(
      `SELECT v.*, pmt.id AS payment_id, pmt.amount AS payment_amount, pmt.payment_date, pmt.status AS payment_status
       FROM visits v LEFT JOIN payments pmt ON v.id = pmt.visit_id
       WHERE v.patient_id = ?
       ORDER BY v.visit_date DESC`,
      [pid]
    );

    res.render('dentists/history', {
      patient, visits,
      userRole: req.user.role,
      page: 'patients'
    });
  } catch (e) {
    next(e);
  }
});

/* =========================================================
 * เปิดหน้าบันทึกการรักษาใหม่
 * ========================================================= */
router.get('/new/:patient_id', allowRoles('dentist'), async (req, res, next) => {
  try {
    const id = req.params.patient_id;

    const patientRows = await q(
      `SELECT p.*, CONCAT('CN', LPAD(p.id,4,'0')) AS clinic_number
       FROM patients p WHERE p.id = ?`,
      [id]
    );
    const patient = patientRows?.[0];
    if (!patient) return res.status(404).send('Patient not found');

    const procs = await q(`SELECT * FROM procedure_codes ORDER BY description`);

    const docRows = await q(
      `SELECT pre_name, first_name, last_name FROM dentists WHERE user_id = ?`,
      [req.user.id]
    );
    const doc = docRows?.[0];
    const name = doc ? `${doc.pre_name || ''}${doc.first_name || ''} ${doc.last_name || ''}`.trim() : '';

    res.render('dentists/treatment', {
      patient,
      user: req.user,
      userRole: req.user.role,
      procedure_codes: procs,
      doctor_name: name,
      page: 'patients'
    });
  } catch (e) {
    next(e);
  }
});

/* =========================================================
 * บันทึกการรักษา
 *   - อัปโหลดไฟล์ X-ray ไป S3 ด้วย multer-s3
 *   - เก็บ URL ลง visits.xray_s3_urls (JSON)
 *   - ใช้สคีมาของตาราง visits ปัจจุบัน:
 *     (patient_id, appointment_id, visit_date, procedure_code, notes, xray_s3_urls, created_at)
 * ========================================================= */
router.post('/treatment', allowRoles('dentist'), upload.array('xrays'), async (req, res, next) => {
  try {
    const {
      patient_id,
      appointment_id,        // อาจว่าง
      visit_date,            // YYYY-MM-DD
      procedure_code,        // เก็บใน visits.procedure_code
      notes,                 // เก็บใน visits.notes
      amount                 // ใช้สร้าง payment 'pending'
    } = req.body;

    const xrayUrls = (req.files || []).map(f => f.location);

    if (!patient_id || !visit_date) {
      return res.status(400).send('patient_id และ visit_date จำเป็นต้องมี');
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [visitResult] = await conn.execute(
        `INSERT INTO visits
           (patient_id, appointment_id, visit_date, procedure_code, notes, xray_s3_urls, created_at)
         VALUES
           (?, ?, ?, ?, ?, ?, NOW())`,
        [
          patient_id,
          appointment_id || null,
          visit_date,
          procedure_code || null,
          notes || null,
          JSON.stringify(xrayUrls)
        ]
      );
      const visitId = visitResult.insertId;

      await conn.execute(
        `INSERT INTO payments (visit_id, staff_id, amount, payment_date, status)
         VALUES (?, ?, ?, NOW(), 'pending')`,
        [visitId, req.user.id, amount || 0]
      );

      await conn.commit();
      return res.redirect(`/dentist/patients/${patient_id}/history?success=1`);
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

/* =========================================================
 * หน้าเวลาว่าง + เคสวันนี้ (ของหมอที่ล็อกอิน)
 *  - ใช้ตาราง appointments + dental_units
 * ========================================================= */
router.get('/dentisttime', allowRoles('dentist', 'staff'), async (req, res) => {
  try {
    const dentistId = req.user.id;
    const cases = await q(
      `SELECT a.id, a.slot_text, a.status,
              du.unit_name,
              p.id AS patient_id,
              CONCAT(p.first_name,' ',p.last_name) AS patient_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN dental_units du ON a.unit_id = du.id
       WHERE a.dentist_id = ? AND DATE(a.date) = CURDATE()
       ORDER BY a.slot_text`,
      [dentistId]
    );

    res.render('dentists/dentisttime', {
      user: req.user, userRole: req.user.role, page: 'dentisttime', cases: cases || []
    });
  } catch {
    res.render('dentists/dentisttime', {
      user: req.user, userRole: req.user.role, page: 'dentisttime', cases: []
    });
  }
});

/* =========================================================
 * API: Units (ACTIVE)
 * ========================================================= */
router.get('/api/units', allowRoles('dentist', 'staff'), async (req, res) => {
  try {
    const t = await resolveUnitTable();
    if (!t) return res.json([]);
    const rows = await q(
      `SELECT id, unit_name, status FROM ${t} WHERE status='ACTIVE' ORDER BY id`
    );
    res.json(rows);
  } catch (e) {
    if ((e.message || '').includes('ER_NO_SUCH_TABLE')) return res.json([]);
    res.status(500).json({ error: 'DB error' });
  }
});

/* =========================================================
 * API: Availability (อ่าน)
 *   - mode=candidates: SLOT_LABELS - saved - booked
 *   - only_free=1: เฉพาะ FREE และไม่ชน appointments
 *   (ใช้ตาราง dentist_availability ตามไฟล์เดิมของคุณ)
 * ========================================================= */
router.get('/api/availability', allowRoles('dentist', 'staff'), async (req, res) => {
  try {
    const dentistId = req.user.id;
    const { date, unit_id, only_free, mode } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

    if (mode === 'candidates') {
      if (!unit_id) return res.status(400).json({ error: 'unit_id is required for mode=candidates' });

      const savedRows = await q(
        `SELECT slot_text FROM dentist_availability
         WHERE dentist_id=? AND date=? AND unit_id=?`,
        [dentistId, date, unit_id]
      );
      const bookedRows = await q(
        `SELECT slot_text FROM appointments
         WHERE date=? AND unit_id=?`,
        [date, unit_id]
      );

      const saved = new Set((savedRows || []).map(r => r.slot_text));
      const booked = new Set((bookedRows || []).map(r => r.slot_text));
      const candidates = SLOT_LABELS.filter(s => !saved.has(s) && !booked.has(s));

      return res.json({
        candidates,
        saved: Array.from(saved),
        booked: Array.from(booked)
      });
    }

    // โหมดปกติ / only_free
    const params = [dentistId, date];
    let sql = `
      SELECT da.id, da.unit_id, da.date, da.slot_text, da.status
      FROM dentist_availability da
      WHERE da.dentist_id = ? AND da.date = ?`;

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

    const rows = await q(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

/* =========================================================
 * API: Availability (บันทึก) – ล้างแล้วใส่ใหม่
 *  ต้องมี UNIQUE KEY ที่ dentist_availability(unit_id, date, slot_text)
 * ========================================================= */
router.post('/api/availability', allowRoles('dentist', 'staff'), express.json(), async (req, res) => {
  const dentistId = req.user.id;
  const { date, unit_id, slots } = req.body;

  if (!date || !unit_id || !Array.isArray(slots))
    return res.status(400).json({ error: 'date, unit_id, slots[] are required' });

  const wanted = Array.from(new Set(slots)).filter(s => SLOT_LABELS.includes(s));
  if (wanted.length === 0) {
    try {
      await q(`DELETE FROM dentist_availability WHERE dentist_id=? AND date=? AND unit_id=?`, [dentistId, date, unit_id]);
      return res.json({ ok: true, saved: 0, conflicts: [] });
    } catch (e) {
      return res.status(500).json({ error: 'DB error (clear): ' + e.message });
    }
  }

  const inMarks = wanted.map(() => '?').join(',');
  const takenSql = `
    SELECT slot_text FROM dentist_availability
    WHERE unit_id=? AND date=? AND slot_text IN (${inMarks})
  `;
  const bookedSql = `
    SELECT slot_text FROM appointments
    WHERE unit_id=? AND date=? AND slot_text IN (${inMarks})
  `;

  const conn = await db.getConnection();
  try {
    const takenRows = await conn.execute(takenSql, [unit_id, date, ...wanted]).then(([r]) => r);
    const bookedRows = await conn.execute(bookedSql, [unit_id, date, ...wanted]).then(([r]) => r);

    const conflicts = new Set([
      ...takenRows.map(r => r.slot_text),
      ...bookedRows.map(r => r.slot_text),
    ]);
    const okSlots = wanted.filter(s => !conflicts.has(s));

    if (okSlots.length === 0) {
      return res.status(409).json({
        error: 'บางช่วงเวลาถูกใช้แล้ว',
        conflicts: Array.from(conflicts)
      });
    }

    await conn.beginTransaction();

    await conn.execute(
      `DELETE FROM dentist_availability WHERE dentist_id=? AND date=? AND unit_id=?`,
      [dentistId, date, unit_id]
    );

    const insertSql =
      `INSERT INTO dentist_availability (dentist_id, unit_id, date, slot_text, status)
       VALUES (?, ?, ?, ?, 'FREE')`;
    for (const s of okSlots) {
      await conn.execute(insertSql, [dentistId, unit_id, date, s]);
    }

    await conn.commit();
    res.json({ ok: true, saved: okSlots.length, conflicts: Array.from(conflicts) });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    if ((e.code || '').startsWith('ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'บางช่วงเวลาถูกใช้แล้ว (race)', detail: e.message });
    }
    res.status(500).json({ error: 'DB error: ' + e.message });
  } finally {
    conn.release();
  }
});

/* =========================================================
 * API (เสริม): availability ของหมอตามวัน/ห้อง
 * ========================================================= */
router.get('/api/appointments/availability', allowRoles('dentist'), async (req, res) => {
  try {
    const { date, unit_id } = req.query;
    const dentistId = req.user.id;
    if (!date) return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });

    const params = [dentistId, date];
    const unitCond = unit_id ? 'AND da.unit_id = ?' : '';
    if (unit_id) params.push(unit_id);

    const rows = await q(
      `SELECT 
          da.slot_text,
          da.status,
          du.unit_name
       FROM dentist_availability da
       JOIN dental_units du ON da.unit_id = du.id
       WHERE da.dentist_id = ? AND da.date = ?
       ${unitCond}
       ORDER BY da.slot_text`,
      params
    );
    res.json(rows || []);
  } catch (e) {
    console.error('Error fetching availability:', e);
    res.status(500).json({ error: 'Database error' });
  }
});

/* =========================================================
 * อัพเดตสถานะนัดหมายของหมอคนนั้น
 * ========================================================= */
router.post('/appointments/:id/status', allowRoles('dentist'), express.json(), async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'ต้องการสถานะ' });

    const validStatuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    }

    const result = await q(
      `UPDATE appointments SET status = ? WHERE id = ? AND dentist_id = ?`,
      [status, appointmentId, req.user.id]
    );

    if (!result || (result.affectedRows || 0) === 0) {
      return res.status(404).json({ error: 'ไม่พบนัดหมาย' });
    }

    res.json({ success: true, message: 'อัพเดทสถานะสำเร็จ' });
  } catch (e) {
    console.error('Error updating appointment status:', e);
    res.status(500).json({ error: 'ไม่สามารถอัพเดทสถานะได้' });
  }
});

module.exports = router;
