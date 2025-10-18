
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('./Dentalcare.db', (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

const schema = fs.readFileSync('db-schema.sql', 'utf8');

db.exec(schema, (err) => {
  if (err) {
    console.error("Error creating table", err.message);
  } else {
    console.log("Tables created successfully.");
  }
  db.close();
});
