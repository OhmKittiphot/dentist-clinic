// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db'); // mysql2/promise
const jwt = require('jsonwebtoken');

// ============================================================================
// 🧩 Patient Registration
// ============================================================================
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

    // ตรวจว่ามี user นี้อยู่แล้วหรือยัง
    const [existing] = await db.query('SELECT id FROM users WHERE citizen_id = ?', [citizen_id]);
    if (existing.length > 0) {
      return renderError('เลขบัตรประชาชนนี้ถูกใช้ลงทะเบียนแล้ว');
    }

    // สร้าง user ใหม่
    const [userResult] = await db.query(
      `INSERT INTO users (citizen_id, password, role, username) VALUES (?, ?, 'patient')`,
      [citizen_id, hashedPassword]
    );
    const userId = userResult.insertId;

    // สร้างข้อมูล patient
    await db.query(
      `INSERT INTO patients (
        user_id, pre_name, first_name, last_name, gender, birth_date, phone, email, 
        address, race, nationality, religion, drug_allergy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, pre_name, first_name, last_name, gender, birth_date, phone, email,
        address, race, nationality, religion, drug_allergy || 'ไม่มี'
      ]
    );

    // สำเร็จ → redirect
    if (from === 'patients') return res.redirect('/');
    res.redirect('/login?success=registration_successful');

  } catch (err) {
    console.error('Registration error:', err);
    renderError('เกิดข้อผิดพลาดของเซิร์ฟเวอร์');
  }
});

// ============================================================================
// 🧩 Dentist Registration
// ============================================================================
router.get('/dentist/register', (req, res) => {
  res.render('dentists/register', { message: null });
});

router.post('/dentist/register', async (req, res) => {
  const {
    license_number, pre_name, first_name, last_name, citizen_id,
    phone, password, confirm_password, email, specialty
  } = req.body;

  const renderError = (message) => {
    res.render('dentists/register', { message });
  };

  if (password !== confirm_password) {
    return renderError('รหัสผ่านไม่ตรงกัน');
  }
  if (!email) {
    return renderError('กรุณากรอกอีเมล');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // ตรวจซ้ำ
    const [existing] = await db.query('SELECT id FROM users WHERE citizen_id = ?', [citizen_id]);
    if (existing.length > 0) {
      return renderError('เลขบัตรประชาชนนี้ถูกใช้ลงทะเบียนแล้ว');
    }

    // Insert user
    const [userResult] = await db.query(
      `INSERT INTO users (citizen_id, password, role) VALUES (?, ?, 'dentist')`,
      [citizen_id, hashedPassword]
    );
    const userId = userResult.insertId;

    // Insert dentist
    await db.query(
      `INSERT INTO dentists (
        user_id, license_number, pre_name, first_name, last_name, phone, email, speciality
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, license_number, pre_name, first_name, last_name, phone, email, specialty || null]
    );

    res.redirect('/login?success=dentist_registration_successful');

  } catch (err) {
    console.error('Dentist register error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return renderError('ข้อมูลที่กรอก (เช่น เลขใบประกอบ หรืออีเมล) อาจซ้ำกับที่มีในระบบ');
    }
    renderError('เกิดข้อผิดพลาดในการลงทะเบียน');
  }
});

// ============================================================================
// 🧩 Login
// ============================================================================
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

router.post('/login', async (req, res) => {
  const { citizen_id, password } = req.body;

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE citizen_id = ? LIMIT 1', [citizen_id]);
    const user = rows[0];

    if (!user) {
      return res.render('login', { title: 'เข้าสู่ระบบ', message: 'เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('login', { title: 'เข้าสู่ระบบ', message: 'เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = jwt.sign(
      { id: user.id, citizen_id: user.citizen_id, role: user.role },
      'secret-key',
      { expiresIn: '1h' }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600000
    });

    let redirectUrl = '/patient/dashboard';
    if (user.role === 'dentist') redirectUrl = '/dentist/patients';
    else if (user.role === 'staff') redirectUrl = '/staff/patients';

    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { title: 'เข้าสู่ระบบ', message: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' });
  }
});

// ============================================================================
// 🧩 Logout
// ============================================================================
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

router.post('/api/staff/register', async (req, res) => {
  try {
    const { citizen_id, password } = req.body;

    // ตรวจสอบข้อมูลเบื้องต้น
    if (!citizen_id || !password) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอก citizen_id และ password'
      });
    }

    // เข้ารหัสรหัสผ่าน (bcrypt)
    const hashedPassword = await bcrypt.hash(password, 10);

    // เพิ่มข้อมูลเข้า table users
    const [userResult] = await db.query(
      `INSERT INTO users (citizen_id, password, role)
       VALUES (?, ?, 'staff')`,
      [citizen_id, hashedPassword]
    );

    res.json({
      success: true,
      message: 'ลงทะเบียน staff สำเร็จ',
      userId: userResult.insertId
    });

  } catch (err) {
    console.error('Register Staff API Error:', err);

    // ถ้า duplicate (citizen_id ซ้ำ)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'citizen_id นี้มีอยู่ในระบบแล้ว'
      });
    }

    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดภายในระบบ: ' + err.message
    });
  }
});
module.exports = router;
