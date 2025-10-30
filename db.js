// db.js
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

/**
 * ถ้าใช้ Amazon RDS (หรือ Aurora MySQL) และต้องการ SSL:
 * - ตั้ง ENV: DB_SSL=true
 * - ใส่ไฟล์ CA (Amazon Root CA 1) ไว้ที่ ./certs/rds-ca.pem หรือระบุ path ใน DB_SSL_CA
 *   (ดาวน์โหลดล่าสุดจาก AWS Trust Store)
 */
const useSSL = /^true$/i.test(process.env.DB_SSL || '');
let ssl = undefined;

if (useSSL) {
  try {
    const caPath = process.env.DB_SSL_CA || path.join(__dirname, 'certs', 'rds-ca.pem');
    ssl = { ca: fs.readFileSync(caPath, 'utf8') };
    console.log('🔐 RDS SSL enabled');
  } catch (e) {
    console.warn('⚠️  เปิด DB_SSL แต่ไม่พบไฟล์ CA (ข้าม SSL).', e.message);
  }
}

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  ssl
});

// ทดสอบการเชื่อมต่อ
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Connected to MySQL');
    conn.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
})();

module.exports = pool;
