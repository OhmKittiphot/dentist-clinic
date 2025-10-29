const sqlite3 = require('sqlite3').verbose();

// ใช้ไฟล์เดียวกับของเดิม
const DB_PATH = process.env.NODE_ENV === 'test' ? ':memory:' : './Dentalcare.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    return console.error("Error opening database", err.message);
  }
  console.log("Connected to the SQLite database.");
});

db.serialize(() => {
  // ✅ มาตรฐานให้ใช้ตารางชื่อ dental_units
  const dentalUnitSchema = `
    CREATE TABLE IF NOT EXISTS dental_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE'))
    );
  `;
  db.run(dentalUnitSchema, (err) => {
    if (err) {
      console.error("Error creating dental_units table", err.message);
    } else {
      // ไม่ seed ข้อมูล เพื่อไม่ชนกับข้อมูลจริงที่มีอยู่ 8 แถว
      // ถ้าฐานข้อมูลว่างจริงๆ ค่อยเติมเองผ่านหน้า UI
      console.log("Table 'dental_units' is ready.");
    }
  });

  // (คงเดิม) payments
  const paymentSchema = `
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visit_id) REFERENCES visits (id),
      FOREIGN KEY (staff_id) REFERENCES users (id)
    );
  `;
  db.run(paymentSchema, (err) => {
    if (err) {
      console.error("Error creating payments table", err.message);
    }
  });
});

module.exports = db;
