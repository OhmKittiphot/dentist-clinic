
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  // Create patients table
  db.run(`CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinic_number TEXT,
    first_name TEXT,
    last_name TEXT,
    gender TEXT,
    age INTEGER,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create visits table
  db.run(`CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    visit_date DATE,
    doctor_name TEXT,
    bp_sys INTEGER,
    bp_dia INTEGER,
    clinical_notes TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients (id)
  )`);

  // Create procedures table
  db.run(`CREATE TABLE IF NOT EXISTS procedures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id INTEGER,
    code TEXT,
    description TEXT,
    tooth_no TEXT,
    qty INTEGER,
    price_each REAL,
    FOREIGN KEY (visit_id) REFERENCES visits (id)
  )`);

  // Create xray_images table
  db.run(`CREATE TABLE IF NOT EXISTS xray_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id INTEGER,
    image_url TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits (id)
  )`);

  // Insert sample data
  const patients = [
    { clinic_number: 'HN001', first_name: 'John', last_name: 'Doe', gender: 'M', age: 30, phone: '123-456-7890' },
    { clinic_number: 'HN002', first_name: 'Jane', last_name: 'Smith', gender: 'F', age: 25, phone: '098-765-4321' }
  ];

  patients.forEach(patient => {
    db.run('INSERT INTO patients (clinic_number, first_name, last_name, gender, age, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [patient.clinic_number, patient.first_name, patient.last_name, patient.gender, patient.age, patient.phone], function(err) {
        if (err) {
          return console.log(err.message);
        }
        const patient_id = this.lastID;
        if (patient_id === 1) {
          db.run('INSERT INTO visits (patient_id, visit_date, doctor_name, bp_sys, bp_dia, clinical_notes) VALUES (?, ?, ?, ?, ?, ?)',
            [patient_id, '2024-01-10', 'Dr. Apple', 120, 80, 'Regular check-up'], function(err) {
              if (err) {
                return console.log(err.message);
              }
              const visit_id = this.lastID;
              db.run('INSERT INTO procedures (visit_id, code, description, tooth_no, qty, price_each) VALUES (?, ?, ?, ?, ?, ?)',
                [visit_id, 'C001', 'Cleaning', '1-8', 1, 50.00]);
              db.run('INSERT INTO xray_images (visit_id, image_url, note) VALUES (?, ?, ?)',
                [visit_id, '/public/css/logo.png', 'X-ray of teeth']);
            });
        }
    });
  });

  console.log('Sample data inserted.');
});

db.close();
