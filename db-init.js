const db = require('./db');

const initDb = () => {
  db.serialize(() => {
    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        citizen_id TEXT UNIQUE,
        password TEXT,
        role TEXT CHECK(role IN ('dentist', 'staff', 'patient')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create patients table
    db.run(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        pre_name TEXT, 
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        gender TEXT, 
        birth_date DATE,
        phone TEXT,
        email TEXT,
        address TEXT,
        race TEXT, 
        nationality TEXT, 
        religion TEXT, 
        drug_allergy TEXT, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Create visits table
    db.run(`
      CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        visit_date DATE NOT NULL,
        diagnosis TEXT, 
        treatment TEXT,
        cost REAL, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id)
      );
    `);

    // --- Schema Alterations for existing tables ---
    db.all("PRAGMA table_info(visits)", (err, cols) => {
        if (err) { console.error("Error checking visits table info:", err); return; }
        if (!cols) { console.error('Could not get table info for visits.'); return; }

        const hasDoctorName = cols.some(col => col.name === 'doctor_name');
        if (!hasDoctorName) {
            db.run('ALTER TABLE visits ADD COLUMN doctor_name TEXT', (err) => {
                if (!err) console.log('Column doctor_name added to visits table.');
            });
        }

        const hasBpSys = cols.some(col => col.name === 'bp_sys');
        if (!hasBpSys) {
            db.run('ALTER TABLE visits ADD COLUMN bp_sys INTEGER', (err) => {
                if (!err) console.log('Column bp_sys added to visits table.');
            });
        }

        const hasBpDia = cols.some(col => col.name === 'bp_dia');
        if (!hasBpDia) {
            db.run('ALTER TABLE visits ADD COLUMN bp_dia INTEGER', (err) => {
                if (!err) console.log('Column bp_dia added to visits table.');
            });
        }

        const hasClinicalNotes = cols.some(col => col.name === 'clinical_notes');
        if (!hasClinicalNotes) {
            db.run('ALTER TABLE visits ADD COLUMN clinical_notes TEXT', (err) => {
                if (!err) console.log('Column clinical_notes added to visits table.');
            });
        }
    });

    // --- NEW Tables ---
    db.run(`
      CREATE TABLE IF NOT EXISTS procedure_codes (
          code TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          default_price REAL,
          category TEXT
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS procedures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          visit_id INTEGER NOT NULL,
          code TEXT, 
          description TEXT, 
          tooth_no TEXT, 
          qty INTEGER DEFAULT 1,
          price_each REAL,
          FOREIGN KEY (visit_id) REFERENCES visits(id),
          FOREIGN KEY (code) REFERENCES procedure_codes(code)
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS xray_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          visit_id INTEGER NOT NULL,
          image_path TEXT NOT NULL,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (visit_id) REFERENCES visits(id)
      );
    `, (err) => {
      if (err) {
        console.error('Error creating xray_images table:', err.message);
        return;
      }

      // --- Data Population ---
      const proceduresData = [
          { code: 'D0120', description: 'ตรวจสุขภาพช่องปาก', price: 200, category: 'Diagnosis' },
          { code: 'D1110', description: 'ขูดหินปูนและขัดฟัน', price: 800, category: 'Prevention' },
          { code: 'D2330', description: 'อุดฟันด้วยวัสดุสีเหมือนฟัน 1 ด้าน', price: 700, category: 'Restoration' },
          { code: 'D2331', description: 'อุดฟันด้วยวัสดุสีเหมือนฟัน 2 ด้าน', price: 1200, category: 'Restoration' },
          { code: 'D3310', description: 'รักษารากฟันหน้า', price: 5000, category: 'Endodontics' },
          { code: 'D7140', description: 'ถอนฟันแท้', price: 600, category: 'Extraction' },
          { code: 'D7210', description: 'ถอนฟันคุด', price: 2500, category: 'Extraction' },
          { code: 'D9310', description: 'ให้คำปรึกษา', price: 150, category: 'Other' }
      ];

      const stmt = db.prepare("INSERT OR IGNORE INTO procedure_codes (code, description, default_price, category) VALUES (?, ?, ?, ?)");
      proceduresData.forEach(({code, description, price, category}) => {
          stmt.run(code, description, price, category);
      });
      stmt.finalize((err) => {
        if (!err) {
          console.log('Database initialization complete. Tables created/updated and procedure codes populated.');
        }
      });
    });
  });
};

if (require.main === module) {
    console.log('Running DB initialization script...');
    initDb();
}

module.exports = initDb;
