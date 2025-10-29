// db.js
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.NODE_ENV === 'test' ? ':memory:' : './Dentalcare.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) return console.error("Error opening database", err.message);
  console.log("Connected to the SQLite database.");
});

function pragmaTableInfo(table) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table});`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}
function columnExists(cols, name) {
  return cols.some(c => c.name === name);
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (e) => e ? reject(e) : resolve());
  });
}
function addColumn(table, col, type) {
  return run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type};`);
}

db.serialize(async () => {
  // ===== สร้างตารางหลักที่ระบบใช้ =====
  await run(`
    CREATE TABLE IF NOT EXISTS dental_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE'))
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      staff_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS dentist_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dentist_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      date TEXT,            -- ensure/backfill ด้านล่าง
      slot_text TEXT,       -- ensure/backfill ด้านล่าง
      status TEXT NOT NULL DEFAULT 'FREE',  -- FREE, BOOKED, HOLD
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (dentist_id, unit_id, date, slot_text)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dentist_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      date TEXT,            -- ensure/backfill ด้านล่าง
      slot_text TEXT,       -- ensure/backfill ด้านล่าง
      status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','IN_PROGRESS','DONE','CANCELLED')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (dentist_id, unit_id, date, slot_text)
    );
  `);

  // ===== Migration/Backfill: appointments =====
  try {
    const apptCols = await pragmaTableInfo('appointments');
    if (!columnExists(apptCols, 'date')) {
      await addColumn('appointments', 'date', 'TEXT');
      if (columnExists(apptCols, 'appointment_date')) {
        await run(`UPDATE appointments SET date = appointment_date WHERE date IS NULL OR date = ''`);
      }
    }
    if (!columnExists(apptCols, 'slot_text')) {
      await addColumn('appointments', 'slot_text', 'TEXT');
      if (columnExists(apptCols, 'time_slot')) {
        await run(`UPDATE appointments SET slot_text = time_slot WHERE slot_text IS NULL OR slot_text = ''`);
      } else if (columnExists(apptCols, 'time_range')) {
        await run(`UPDATE appointments SET slot_text = time_range WHERE slot_text IS NULL OR slot_text = ''`);
      } else if (columnExists(apptCols, 'slot')) {
        await run(`UPDATE appointments SET slot_text = slot WHERE slot_text IS NULL OR slot_text = ''`);
      }
    }
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS ux_appt_unit_slot ON appointments (unit_id, date, slot_text)`);
  } catch (e) {
    console.error('Appointments migration:', e.message);
  }

  // ===== Migration/Backfill: dentist_availability =====
  try {
    const daCols = await pragmaTableInfo('dentist_availability');
    if (!columnExists(daCols, 'date')) {
      await addColumn('dentist_availability', 'date', 'TEXT');
    }
    if (!columnExists(daCols, 'slot_text')) {
      await addColumn('dentist_availability', 'slot_text', 'TEXT');
      if (columnExists(daCols, 'time_slot')) {
        await run(`UPDATE dentist_availability SET slot_text = time_slot WHERE slot_text IS NULL OR slot_text = ''`);
      } else if (columnExists(daCols, 'time_range')) {
        await run(`UPDATE dentist_availability SET slot_text = time_range WHERE slot_text IS NULL OR slot_text = ''`);
      } else if (columnExists(daCols, 'slot')) {
        await run(`UPDATE dentist_availability SET slot_text = slot WHERE slot_text IS NULL OR slot_text = ''`);
      }
    }
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS ux_dent_avail_unit_slot ON dentist_availability (unit_id, date, slot_text)`);
  } catch (e) {
    console.error('Dentist availability migration:', e.message);
  }

  // (ถ้าของจริงใช้ตาราง units แทน dental_units สามารถสร้าง VIEW ทับชื่อเดิมได้)
  // await run(`CREATE VIEW IF NOT EXISTS dental_units AS SELECT id, unit_name, status FROM units`);
});

module.exports = db;
