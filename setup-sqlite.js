const sqlite3 = require('sqlite3').verbose();

// open the database
let db = new sqlite3.Database('./Dentalcare.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the Dentalcare database.');
});

const createTables = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_id TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'patient'
    );
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      pre_name TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT,
      gender TEXT,
      birth_date TEXT,
      phone TEXT,
      email TEXT,
      race TEXT,
      nationality TEXT,
      religion TEXT,
      drug_allergy TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER,
      visit_date TEXT,
      doctor_name TEXT,
      bp_sys INTEGER,
      bp_dia INTEGER,
      clinical_notes TEXT,
      FOREIGN KEY(patient_id) REFERENCES patients(id)
    );
    CREATE TABLE IF NOT EXISTS procedures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER,
      code TEXT,
      description TEXT,
      tooth_no TEXT,
      qty INTEGER,
      price_each REAL,
      FOREIGN KEY(visit_id) REFERENCES visits(id)
    );
    CREATE TABLE IF NOT EXISTS xray_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER,
      image_path TEXT,
      FOREIGN KEY(visit_id) REFERENCES visits(id)
    );
    CREATE TABLE IF NOT EXISTS procedure_codes (
      code TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      price REAL
    );
  `;
  db.exec(sql);
};

const insertSampleData = () => {
    const sampleProcedures = [
        { code: 'T101', description: 'ขูดหินปูน', price: 900 },
        { code: 'T102', description: 'อุดฟัน', price: 800 },
        { code: 'T103', description: 'ถอนฟัน', price: 1000 },
        { code: 'T104', description: 'รักษารากฟัน', price: 5000 },
        { code: 'X201', description: 'X-Ray', price: 200 },
        { code: 'P301', description: 'ฟอกสีฟัน', price: 3500 }
    ];

    const sqlProcedureCodes = `INSERT OR IGNORE INTO procedure_codes (code, description, price) VALUES (?, ?, ?)`;
    const sqlUsers = `INSERT OR IGNORE INTO users (citizen_id, password, role) VALUES (?, ?, ?)`;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION;');
        sampleProcedures.forEach(proc => {
            db.run(sqlProcedureCodes, [proc.code, proc.description, proc.price]);
        });
        
        // Insert sample users for Dentist and Staff roles
        db.run(sqlUsers, ['1111111111111', 'password', 'dentist']);
        db.run(sqlUsers, ['2222222222222', 'password', 'staff']);

        db.run('COMMIT;');
    });
    console.log("Sample data inserted.");
};

createTables();
insertSampleData();

db.close((err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Close the database connection.');
});
