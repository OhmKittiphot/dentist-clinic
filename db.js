
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = 'clinic.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(err.message);
    throw err;
  }
  console.log('Connected to the SQLite database.');

  db.serialize(() => {
    // Create tables
    db.run(`CREATE TABLE IF NOT EXISTS patients (id INTEGER PRIMARY KEY AUTOINCREMENT, clinic_number TEXT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, gender TEXT, age INTEGER, phone TEXT, birth_date TEXT, mobile_number TEXT, email TEXT, address TEXT, medical_history TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL, visit_date TEXT NOT NULL, doctor_name TEXT, bp_sys INTEGER, bp_dia INTEGER, clinical_notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (patient_id) REFERENCES patients (id))`);
    db.run(`CREATE TABLE IF NOT EXISTS procedures (id INTEGER PRIMARY KEY AUTOINCREMENT, visit_id INTEGER NOT NULL, code TEXT NOT NULL, description TEXT, tooth_no TEXT, qty INTEGER DEFAULT 1, price_each REAL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (visit_id) REFERENCES visits (id))`);
    db.run(`CREATE TABLE IF NOT EXISTS xray_images (id INTEGER PRIMARY KEY AUTOINCREMENT, visit_id INTEGER NOT NULL, image_path TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (visit_id) REFERENCES visits (id))`);
    db.run(`CREATE TABLE IF NOT EXISTS procedure_codes (code TEXT PRIMARY KEY, description TEXT NOT NULL, price REAL NOT NULL)`);
    console.log('All tables created or already exist.');

    // Seed Data
    db.get('SELECT COUNT(*) as count FROM procedure_codes', (err, row) => {
        if(row.count === 0){
            const seedProcedureCodes = `INSERT OR IGNORE INTO procedure_codes (code, description, price) VALUES
              ('D1110', 'ขูดหินปูนและขัดฟัน', 900),
              ('D2391', 'อุดฟันด้วยวัสดุสีเหมือนฟัน 1 ด้าน', 1500),
              ('D2392', 'อุดฟันด้วยวัสดุสีเหมือนฟัน 2 ด้าน', 2500),
              ('D3310', 'รักษารากฟันหน้า', 6000),
              ('D7140', 'ถอนฟันแท้', 800)`;
            db.run(seedProcedureCodes, (err) => {
                if(err) console.error('Error seeding procedure_codes:', err);
                else console.log('Procedure codes have been seeded.');
            });
        } else {
            console.log('Procedure codes already exist.');
        }
    });

    db.get('SELECT COUNT(*) as count FROM patients', (err, row) => {
        if(row.count === 0){
            const seedPatients = `INSERT OR IGNORE INTO patients (id, clinic_number, first_name, last_name, gender, age, phone) VALUES (1, 'HN0001', 'สมชาย', 'ใจดี', 'M', 45, '0812345678'), (2, 'HN0002', 'สมศรี', 'รักสะอาด', 'F', 32, '0898765432'), (3, 'HN0003', 'มานะ', 'อดทน', 'M', 50, '0855555555')`;
            const seedVisits = `INSERT OR IGNORE INTO visits (id, patient_id, visit_date, doctor_name, clinical_notes) VALUES (1, 1, '2023-10-26', 'หมอใจดี', 'คนไข้มีอาการปวดฟันกรามซี่บนขวา'), (2, 2, '2023-10-27', 'หมอสะอาด', 'ขูดหินปูนและตรวจสุขภาพฟันประจำปี')`;
            const seedProcedures = `INSERT OR IGNORE INTO procedures (visit_id, code, description, tooth_no, price_each) VALUES (1, 'D2391', 'อุดฟันด้วยวัสดุสีเหมือนฟัน', '16', 1500), (2, 'D1110', 'ขูดหินปูนและขัดฟัน', null, 900)`;
            db.run(seedPatients);
            db.run(seedVisits);
            db.run(seedProcedures, (err) => {
                if(err) console.error('Error seeding data:', err);
                else console.log('Database has been seeded.');
            });
        } else {
            console.log('Database already has data.');
        }
    });
  });
});

module.exports = db;
