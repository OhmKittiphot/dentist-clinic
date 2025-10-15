
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('clinic.db');

db.serialize(() => {
  console.log('--- Checking procedures table ---');
  db.all('SELECT * FROM procedures', [], (err, rows) => {
    if (err) {
      console.error('Error querying procedures:', err.message);
      return;
    }
    console.log('Procedures Data:', rows);
  });

  console.log('\n--- Checking visits table ---');
  db.all('SELECT * FROM visits', [], (err, rows) => {
    if (err) {
      console.error('Error querying visits:', err.message);
      return;
    }
    console.log('Visits Data:', rows);
  });
});

db.close();
