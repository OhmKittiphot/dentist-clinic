const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');

router.get('/register', (req, res) => {
  res.render('register', { title: 'สมัครสมาชิก | Dentalcare Clinic' });
});

router.post('/register', async (req, res) => {
  const { 
    citizen_id, password, confirm_password, pre_name, first_name, last_name, 
    gender, birth_date, phone, email, address, race, nationality, 
    religion, drug_allergy 
  } = req.body;

  // Basic validation
  if (!citizen_id || !password || !first_name || !last_name) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็น: เลขบัตรประชาชน, รหัสผ่าน, ชื่อ และนามสกุล' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ success: false, message: 'รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into users table
    const userSql = `INSERT INTO users (citizen_id, password, role) VALUES (?, ?, 'patient')`;
    db.run(userSql, [citizen_id, hashedPassword], function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(409).json({ success: false, message: 'เลขบัตรประชาชนนี้ถูกใช้ลงทะเบียนแล้ว' });
        }
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลงทะเบียนผู้ใช้' });
      }

      const userId = this.lastID;
      const patientSql = `
        INSERT INTO patients (
          user_id, pre_name, first_name, last_name, gender, birth_date, phone, email, 
          address, race, nationality, religion, drug_allergy
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const patientParams = [
        userId, pre_name, first_name, last_name, gender, birth_date, phone, email, 
        address, race, nationality, religion, drug_allergy || 'ไม่มี'
      ];

      db.run(patientSql, patientParams, function(err) {
        if (err) {
          return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้างข้อมูลผู้ป่วย' });
        }
        res.json({ success: true, message: 'ลงทะเบียนสำเร็จ' });
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' });
  }
});

// --- Other auth routes like login, logout ---

router.get('/login', (req, res) => {
  res.render('login', { title: 'เข้าสู่ระบบ | Dentalcare Clinic', message: null });
});

const jwt = require('jsonwebtoken');

router.post('/login', (req, res) => {
  const { citizen_id, password } = req.body;

  db.get("SELECT * FROM users WHERE citizen_id = ? LIMIT 1", [citizen_id], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('มีข้อผิดพลาดเกิดขึ้นกับเซิร์ฟเวอร์');
    }

    if (!row) {
      return res.render('login', { title: 'เข้าสู่ระบบ', message: 'เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง' });
    }

    bcrypt.compare(password, row.password, (err, isMatch) => {
      if (err) {
        console.error(err);
        return res.status(500).send('มีข้อผิดพลาดในการตรวจสอบรหัสผ่าน');
      }

      if (!isMatch) {
        return res.render('login', { title: 'เข้าสู่ระบบ', message: 'เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง' });
      }

      const token = jwt.sign(
        { id: row.id, citizen_id: row.citizen_id, role: row.role },
        'secret-key',
        { expiresIn: '1h' }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60
      });

      if (row.role === 'dentist' || row.role === 'staff') {
        res.redirect('/patients');
      } else {
        res.redirect('/login'); // Or a patient dashboard later
      }
    });
  });
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

module.exports = router;
