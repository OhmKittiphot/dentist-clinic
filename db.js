const sqlite3 = require('sqlite3').verbose();

// Connect to the SQLite database
const db = new sqlite3.Database('./Dental.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the Dental.db database.');
});

module.exports = db;
