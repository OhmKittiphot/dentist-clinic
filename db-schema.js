
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./Dentalcare.db', (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    console.log("Connected to the SQLite database for schema setup.");
  }
});

// SQL statement to create the new dentists table
const createDentistsTable = `
CREATE TABLE IF NOT EXISTS dentists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  license_number TEXT NOT NULL UNIQUE,
  pre_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  specialty TEXT,
  phone TEXT,
  address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

db.serialize(() => {
  db.run(createDentistsTable, (err) => {
    if (err) {
      console.error("Error creating dentists table:", err.message);
    } else {
      console.log("Table 'dentists' created or already exists.");
    }
  });
});

db.close((err) => {
  if (err) {
    console.error("Error closing database", err.message);
  } else {
    console.log("Database connection closed.");
  }
});
