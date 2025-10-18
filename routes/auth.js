// Checked Register
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const jwt = require('jsonwebtoken');

// Patient Registration
router.get('/register', (req, res) => {
  res.render('register', {
    title: 'สมัครสมาชิกผู้ป่วย | Dentalcare Clinic',
    message: null,
    from: req.query.from || 'login'
  });
});

router.post('/register', async (req, res) => {
  const {
    citizen_id, password, confirm_password, pre_name, first_name, last_name,
    gender, birth_date, phone, email, address, race, nationality,
    religion, drug_allergy
  } = req.body;

  const from = req.body.from || 'login';

  const renderError = (message) => {
    res.render('register', {
      title: 'สมัครสมาชิกผู้ป่วย | Dentalcare Clinic',
      message,
      from
    });
  };

  if (!citizen_id || !password || !first_name || !last_name) {
    return renderError('กรุณากรอกข้อมูลที่จำเป็น: เลขบัตรประชาชน, รหัสผ่าน, ชื่อ และนามสกุล');
  }
  if (password !== confirm_password) {
    return renderError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const userSql = `INSERT INTO users (citizen_id, password, role) VALUES (?, ?, 'patient')`;
    db.run(userSql, [citizen_id, hashedPassword], function (err) {
      if (err) {
        return renderError(err.code === 'SQLITE_CONSTRAINT' ? 'เลขบัตรประชาชนนี้ถูกใช้ลงทะเบียนแล้ว' : 'เกิดข้อผิดพลาดในการลงทะเบียนผู้ใช้');
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

      db.run(patientSql, patientParams, (err) => {
        if (err) {
          return renderError('เกิดข้อผิดพลาดในการสร้างข้อมูลผู้ป่วย');
        }

        // Check where to redirect
        if (from === 'patients') {
          return res.redirect('/');
        }
        res.redirect('/login?success=registration_successful');
      });
    });
  } catch (error) {
    renderError('เกิดข้อผิดพลาดของเซิร์ฟเวอร์');
  }
});

// Dentist Registration
router.get('/dentist/register', (req, res) => {
  res.render('dentists/register', { message: null });
});

router.post('/dentist/register', async (req, res) => {
  const {
    license_number, pre_name, first_name, last_name, citizen_id,
    phone, password, confirm_password, email, specialty
  } = req.body;

  const renderError = (message) => {
    res.render('dentist/register', { message });
  };

  if (password !== confirm_password) {
    return renderError('รหัสผ่านไม่ตรงกัน');
  }
  if (!email) { // Added email check
    return renderError('กรุณากรอกอีเมล');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const userSql = `INSERT INTO users (citizen_id, password, role) VALUES (?, ?, 'dentist')`;
    db.run(userSql, [citizen_id, hashedPassword], function (err) {
      if (err) {
        return renderError(err.code === 'SQLITE_CONSTRAINT' ? 'เลขบัตรประชาชนนี้ถูกใช้ลงทะเบียนแล้ว' : 'เกิดข้อผิดพลาดในการสร้างบัญชีผู้ใช้');
      }

      const userId = this.lastID;
      const dentistSql = `
        INSERT INTO dentists (user_id, license_number, pre_name, first_name, last_name, phone, email, specialty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const dentistParams = [userId, license_number, pre_name, first_name, last_name, phone, email, specialty || null];

      db.run(dentistSql, dentistParams, function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return renderError('ข้อมูลที่กรอก (เช่น เลขใบประกอบ, อีเมล) อาจซ้ำกับที่มีในระบบ');
          }
          return renderError('เกิดข้อผิดพลาดในการบันทึกข้อมูลทันตแพทย์');
        }
        res.redirect('/login?success=dentist_registration_successful');
      });
    });
  } catch (error) {
    renderError('เกิดข้อผิดพลาดของเซิร์ฟเวอร์');
  }
});

// Login
router.get('/login', (req, res) => {
  const { success } = req.query;
  let message = null;
  if (success === 'registration_successful') {
    message = 'การสมัครสมาชิกผู้ป่วยสำเร็จแล้ว! กรุณาเข้าสู่ระบบ';
  } else if (success === 'dentist_registration_successful') {
    message = 'การลงทะเบียนทันตแพทย์สำเร็จแล้ว! กรุณาเข้าสู่ระบบ';
  }
  res.render('login', { title: 'เข้าสู่ระบบ | Dentalcare Clinic', message });
});

router.post('/login', (req, res) => {
  const { citizen_id, password } = req.body;

  db.get("SELECT * FROM users WHERE citizen_id = ? LIMIT 1", [citizen_id], (err, user) => {
    if (err || !user) {
      return res.render('login', { title: 'เข้าสู่ระบบ', message: 'เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง' });
    }

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) {
        return res.render('login', { title: 'เข้าสู่ระบบ', message: 'เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง' });
      }

      const token = jwt.sign(
        { id: user.id, citizen_id: user.citizen_id, role: user.role },
        'secret-key',
        { expiresIn: '1h' }
      );

      res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 3600000 });

      let redirectUrl;
      if (user.role === 'dentist') {
        redirectUrl = '/dentist/patients';
      } else if (user.role === 'staff') {
        redirectUrl = '/staff/patients'; // For Staff
      } else {
        redirectUrl = '/patient/dashboard'; // For User 
      }
      res.redirect(redirectUrl);
    });
  });
});

// Logout
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

module.exports = router;
