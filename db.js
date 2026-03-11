const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'waitlist.db');

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Database connection error:', err);
      } else {
        console.log('Database initialized');
        this.initializeTables();
      }
    });
  }

  initializeTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending',
        email_sent BOOLEAN DEFAULT 0,
        email_sent_at DATETIME
      )
    `, (err) => {
      if (err) {
        console.error('Table creation error:', err);
      }
    });
  }

  addEmail(email, name = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO waitlist (email, name) VALUES (?, ?)`,
        [email, name],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              reject(new Error('Email already in waitlist'));
            } else {
              reject(err);
            }
          } else {
            resolve({ id: this.lastID, email, name });
          }
        }
      );
    });
  }

  getEmails(status = 'pending', emailSent = false) {
    return new Promise((resolve, reject) => {
      const query = emailSent 
        ? `SELECT * FROM waitlist WHERE status = ? AND email_sent = 1`
        : `SELECT * FROM waitlist WHERE status = ? AND email_sent = 0`;
      
      this.db.all(query, [status], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  markEmailSent(emailId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE waitlist SET email_sent = 1, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [emailId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        }
      );
    });
  }

  getAllEmails() {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM waitlist ORDER BY created_at DESC`, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database connection closed');
          resolve();
        }
      });
    });
  }
}

module.exports = new Database();
