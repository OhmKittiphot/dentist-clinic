const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const dbPath = './Dentalcare.db';

const saltRounds = 10;

// Mock data definitions
const users = [
    { citizen_id: '1111111111111', password: 'password123', role: 'dentist', first_name: 'ทพญ.ใจดี', last_name: 'ยิ้มสวย' },
    { citizen_id: '2222222222222', password: 'password123', role: 'staff', first_name: 'สดใส', last_name: 'บริการดี' },
    { citizen_id: '3333333333333', password: 'password123', role: 'patient' },
    { citizen_id: '4444444444444', password: 'password123', role: 'patient' }
];

const patients = [
    {
        user_id: 3,
        pre_name: 'นาย',
        first_name: 'สมชาย',
        last_name: 'แข็งแรง',
        gender: 'ชาย',
        birth_date: '1988-05-15',
        phone: '0812345678',
        email: 'somchai.k@example.com',
        address: '123 ถ.สุขุมวิท กรุงเทพฯ',
        race: 'ไทย',
        nationality: 'ไทย',
        religion: 'พุทธ',
        drug_allergy: 'ไม่มี'
    },
    {
        user_id: 4,
        pre_name: 'นางสาว',
        first_name: 'สมหญิง',
        last_name: 'จริงใจ',
        gender: 'หญิง',
        birth_date: '1995-11-20',
        phone: '0898765432',
        email: 'somying.j@example.com',
        address: '456 ถ.รัชดาภิเษก กรุงเทพฯ',
        race: 'ไทย',
        nationality: 'ไทย',
        religion: 'พุทธ',
        drug_allergy: 'เพนนิซิลลิน'
    }
];

const procedure_codes = [
  { code: 'D0120', description: 'ตรวจสุขภาพช่องปาก วางแผนการรักษา', default_price: 300, category: 'Diagnosis' },
  { code: 'D1110', description: 'ขูดหินปูนและขัดฟันทั้งปาก', default_price: 900, category: 'Prevention' },
  { code: 'D2391', description: 'อุดฟันด้วยวัสดุสีเหมือนฟัน 1 ด้าน', default_price: 800, category: 'Restoration' },
  { code: 'D3310', description: 'รักษารากฟันหน้า', default_price: 6000, category: 'Endodontics' },
  { code: 'D7140', description: 'ถอนฟันแท้', default_price: 800, category: 'Extraction' },
  { code: 'D9310', description: 'ให้คำปรึกษา', default_price: 200, category: 'Consultation' }
];

// Main function to set up the database
const setupDatabase = async () => {
    try {
        console.log('Hashing passwords for mock users...');
        const hashedUsers = await Promise.all(
            users.map(user => 
                new Promise((resolve, reject) => {
                    bcrypt.hash(user.password, saltRounds, (err, hash) => {
                        if (err) return reject(err);
                        resolve({ ...user, password_hash: hash });
                    });
                })
            )
        );
        console.log('Passwords hashed successfully.');

        const db = new sqlite3.Database(dbPath);

        db.serialize(() => {
            console.log('Starting database serialization...');

            // Drop tables to ensure a clean slate
            db.run(`DROP TABLE IF EXISTS procedure_codes`);
            db.run(`DROP TABLE IF EXISTS visits`);
            db.run(`DROP TABLE IF EXISTS patients`);
            db.run(`DROP TABLE IF EXISTS users`);
            console.log('Dropped existing tables.');

            // Create tables
            db.run(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, citizen_id TEXT UNIQUE, password TEXT, role TEXT, first_name TEXT, last_name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            db.run(`CREATE TABLE patients (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE, pre_name TEXT, first_name TEXT, last_name TEXT, gender TEXT, birth_date DATE, phone TEXT, email TEXT, address TEXT, race TEXT, nationality TEXT, religion TEXT, drug_allergy TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
            db.run(`CREATE TABLE visits (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER, visit_date DATE, doctor_name TEXT, vital_signs TEXT, clinical_notes TEXT, xray_images_list TEXT, procedures_list TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (patient_id) REFERENCES patients(id))`);
            db.run(`CREATE TABLE procedure_codes (code TEXT PRIMARY KEY, description TEXT, default_price REAL, category TEXT)`);
            console.log('Created new tables.');

            // Insert mock data
            const userStmt = db.prepare("INSERT INTO users (citizen_id, password, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)");
            hashedUsers.forEach(user => {
                userStmt.run(user.citizen_id, user.password_hash, user.role, user.first_name, user.last_name);
            });
            userStmt.finalize();
            console.log('Inserted mock users.');

            const patientStmt = db.prepare("INSERT INTO patients (user_id, pre_name, first_name, last_name, gender, birth_date, phone, email, address, race, nationality, religion, drug_allergy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            patients.forEach(p => {
                patientStmt.run(p.user_id, p.pre_name, p.first_name, p.last_name, p.gender, p.birth_date, p.phone, p.email, p.address, p.race, p.nationality, p.religion, p.drug_allergy);
            });
            patientStmt.finalize();
            console.log('Inserted mock patients.');

            const procCodeStmt = db.prepare("INSERT INTO procedure_codes (code, description, default_price, category) VALUES (?, ?, ?, ?)");
            procedure_codes.forEach(p => {
                procCodeStmt.run(p.code, p.description, p.default_price, p.category);
            });
            procCodeStmt.finalize();
            console.log('Inserted mock procedure codes.');
        });

        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database setup complete. Connection closed.');
            }
        });

    } catch (error) {
        console.error('An error occurred during database setup:', error);
    }
};

setupDatabase();
