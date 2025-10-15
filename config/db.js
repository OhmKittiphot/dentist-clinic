
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('DB Run Error:', err.message, 'SQL:', sql);
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('DB All Error:', err.message, 'SQL:', sql);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

const pool = {
    query: (sql, params) => {
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
            return dbAll(sql, params).then(rows => [rows]);
        } else {
            return dbRun(sql, params).then(result => [{ insertId: result.lastID, affectedRows: result.changes }]);
        }
    },
    getConnection: () => {
        return Promise.resolve({
            beginTransaction: () => dbRun('BEGIN'),
            commit: () => dbRun('COMMIT'),
            rollback: () => dbRun('ROLLBACK'),
            query: (sql, params) => {
                 if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    return dbAll(sql, params).then(rows => [rows]);
                 } else {
                    return dbRun(sql, params).then(result => [{ insertId: result.lastID, affectedRows: result.changes }]);
                 }
            },
            release: () => {}
        });
    }
};

module.exports = { pool };
