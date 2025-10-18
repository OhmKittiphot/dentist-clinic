
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.NODE_ENV === 'test' ? ':memory:' : './Dentalcare.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    return console.error("Error opening database", err.message);
  }
  console.log("Connected to the SQLite database.");
  // Create payments table if it doesn't exist
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
  db.exec(paymentSchema, (err) => {
    if (err) {
      console.error("Error creating payments table", err.message);
    }
  });
});

module.exports = db;
