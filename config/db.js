const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  enableKeepAlive: true
});

async function test(){
  try { const [r] = await pool.query('SELECT 1 AS ok'); console.log('✅ MySQL pool ready:', r[0]); }
  catch (e){ console.error('❌ MySQL connection failed:', e.message); }
}
test();

module.exports = { pool };
