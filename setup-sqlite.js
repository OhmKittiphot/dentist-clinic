
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// Function to run a database query with async/await
function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Error running sql: ' + sql);
                console.error(err);
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

async function setup() {
    // Change DB name here
    const db = new sqlite3.Database('./Dental.db', (err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Connected to the Dental.db database for setup.');
    });

    try {
        console.log("Running database setup...");

        // Drop existing tables to start fresh
        await dbRun(db, `DROP TABLE IF EXISTS visits;`);
        await dbRun(db, `DROP TABLE IF EXISTS patients;`);
        await dbRun(db, `DROP TABLE IF EXISTS users;`);
        await dbRun(db, `DROP TABLE IF EXISTS procedure_codes;`);

        // Create Users Table
        await dbRun(db, `
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            citizen_id TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log("Users table is ready.");

        // Create Patients Table with all the original fields
        await dbRun(db, `
          CREATE TABLE IF NOT EXISTS patients (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
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
              user_id INTEGER UNIQUE,
              FOREIGN KEY(user_id) REFERENCES users(id)
          );
        `);
        console.log("Patients table is ready.");

        // Create Visits Table with new fields
        await dbRun(db, `
            CREATE TABLE IF NOT EXISTS visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                visit_date DATETIME NOT NULL,
                doctor_name TEXT,
                vital_signs TEXT, -- Store as JSON: { bp_sys, bp_dia }
                clinical_notes TEXT,
                xray_images_list TEXT, -- Store as JSON array of strings (paths)
                procedures_list TEXT, -- Store as JSON array of objects
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(patient_id) REFERENCES patients(id)
            );
        `);
        console.log("Visits table is ready with new schema.");

        // Create Procedure Codes Table
        await dbRun(db, `
          CREATE TABLE IF NOT EXISTS procedure_codes (
              code TEXT PRIMARY KEY,
              description TEXT NOT NULL,
              price_each REAL NOT NULL
          );
        `);
        console.log("Procedure codes table is ready.");

        // --- Seeding Data ---
        console.log("Starting data seeding...");
        const saltRounds = 10;

        // Seed Procedure Codes
        const procedures = [
            { code: 'D0120', description: 'ตรวจวินิจฉัยและวางแผนการรักษา', price: 150 },
            { code: 'D0220', description: 'เอกซเรย์ฟิล์มเล็กในช่องปาก', price: 150 },
            { code: 'D1110', description: 'ขูดหินปูนและขัดฟันทั้งปาก', price: 700 },
            { code: 'D2140', description: 'อุดฟันด้วยอมัลกัม 1 ด้าน', price: 600 },
            { code: 'D2330', description: 'อุดฟันด้วยวัสดุสีเหมือนฟัน 1 ด้าน', price: 800 },
            { code: 'D3310', description: 'รักษารากฟันหน้า', price: 5000 },
            { code: 'D4341', description: 'การเกลารากฟัน (ต่อ 1/4 ของช่องปาก)', price: 1500 },
            { code: 'D5110', description: 'ฟันปลอมทั้งปาก (บนหรือล่าง)', price: 12000 },
            { code: 'D7140', description: 'ถอนฟันแท้ (ที่ไม่ใช่ฟันคุด)', price: 800 },
            { code: 'D9110', description: 'การรักษาฉุกเฉินเพื่อบรรเทาอาการปวด', price: 500 }
        ];
        for (const proc of procedures) {
            await dbRun(db, 'INSERT INTO procedure_codes (code, description, price_each) VALUES (?, ?, ?)', [proc.code, proc.description, proc.price]);
        }
        console.log("Procedure codes seeded.");

        // Seed Dentist
        const dentistPass = await bcrypt.hash('111111', saltRounds);
        const dentistUser = await dbRun(db, 'INSERT INTO users (citizen_id, password, role) VALUES (?, ?, ?)', ['1111111111111', dentistPass, 'dentist']);

        // Seed Staff
        const staffPass = await bcrypt.hash('222222', saltRounds);
        const staffUser = await dbRun(db, 'INSERT INTO users (citizen_id, password, role) VALUES (?, ?, ?)', ['2222222222222', staffPass, 'staff']);

        // Seed Patient 1
        const patient1Pass = await bcrypt.hash('333333', saltRounds);
        const patient1User = await dbRun(db, 'INSERT INTO users (citizen_id, password, role) VALUES (?, ?, ?)', ['3333333333333', patient1Pass, 'patient']);
        await dbRun(db, 
            `INSERT INTO patients (user_id, pre_name, first_name, last_name, gender, birth_date, phone, email, address, race, nationality, religion, drug_allergy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [patient1User.lastID, 'นาย', 'สมชาย', 'ใจดี', 'ชาย', '1990-05-15', '0812345678', 'somchai.j@example.com', '123 ถ.สุขุมวิท กรุงเทพฯ', 'ไทย', 'ไทย', 'พุทธ', 'ไม่มี']
        );

        // Seed Patient 2
        const patient2Pass = await bcrypt.hash('444444', saltRounds);
        const patient2User = await dbRun(db, 'INSERT INTO users (citizen_id, password, role) VALUES (?, ?, ?)', ['4444444444444', patient2Pass, 'patient']);
        await dbRun(db, 
            `INSERT INTO patients (user_id, pre_name, first_name, last_name, gender, birth_date, phone, email, address, race, nationality, religion, drug_allergy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [patient2User.lastID, 'นางสาว', 'สมหญิง', 'รักดี', 'หญิง', '1995-11-20', '0898765432', 'somyuing.r@example.com', '456 ถ.รัชดา กรุงเทพฯ', 'ไทย', 'ไทย', 'พุทธ', 'แพ้เพนนิซิลลิน']
        );

        console.log("User and patient data seeded.");

    } catch (error) {
        console.error("Setup failed:", error);
    } finally {
        db.close((err) => {
            if (err) {
                console.error(err.message);
            }
            console.log('Closed the database connection after setup.');
        });
    }
}

setup();
