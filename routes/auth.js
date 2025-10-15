const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

// DB
let db = new sqlite3.Database('Dentalcare.db');

router.get('/login', (req, res) => {
  res.render('login', { title: 'เข้าสู่ระบบ | Dentalcare Clinic', message: null });
});

router.post('/login', (req, res) => {
  const { citizen_id, password } = req.body;
  db.get("SELECT * FROM users WHERE citizen_id = ? AND password = ? LIMIT 1",
    [citizen_id, password],
    (err, row) => {
      if (!row) {
        return res.render('login', { title: 'เข้าสู่ระบบ', message: 'ไม่ถูกต้อง' });
      }

      const token = jwt.sign(
        { id: row.id, citizen_id: row.citizen_id, role: row.role },
        'secret-key',
        { expiresIn: '1h' }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60
      });

      res.redirect(`/${row.role}`);
    }
  );
});

router.get('/register', (req, res) => {
  res.render('register', { title: 'สมัครสมาชิก | Dentalcare Clinic' });
});

router.post('/register', (req, res) => {
  const { citizen_id, password, prefix, fname, lname, gender, dob, phone, email, race, nationality, religion, allergy } = req.body;
  const allergyVal = (allergy && allergy.trim() !== '') ? allergy : 'ไม่มี';

  const sql1 = `INSERT INTO users (citizen_id, password, role) VALUES (?, ?, 'patient')`;
  const sql2 = `
    INSERT INTO patients (
      user_id, pre_name, first_name, last_name, gender, birth_date,
      phone, email, race, nationality, religion, drug_allergy
    )
    SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    FROM users
    WHERE citizen_id = ?;
  `;

  db.run(sql1, [citizen_id, password], function (err) {
    if (err) return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
  });

  db.run(sql2, [
    prefix, fname, lname, gender, dob, phone, email, race,
    nationality, religion, allergyVal, citizen_id
  ], function (err) {
    if (err) return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
    res.json({ success: true, message: 'ลงทะเบียนสำเร็จ', patient_id: this.lastID });
  });
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

module.exports = router;
