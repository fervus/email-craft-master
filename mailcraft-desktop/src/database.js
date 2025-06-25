const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

class Database {
  constructor() {
    // Get the app data directory for portable storage
    const userDataPath = app.getPath('userData');
    
    // Ensure the directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    const dbPath = path.join(userDataPath, 'mailcraft.db');
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database at:', dbPath);
        this.initializeTables();
      }
    });
  }

  initializeTables() {
    // SMTP Settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS smtp_settings (
        id INTEGER PRIMARY KEY,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        secure BOOLEAN NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        from_email TEXT NOT NULL,
        from_name TEXT NOT NULL
      )
    `);

    // Campaigns table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        template TEXT NOT NULL,
        email_format TEXT NOT NULL,
        send_rate_limit INTEGER NOT NULL,
        priority TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        attachment_folder_path TEXT
      )
    `);

    // Recipients table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        subject TEXT,
        body TEXT,
        attachment_file TEXT,
        variables TEXT,
        FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
      )
    `);
  }

  saveSmtpSettings(settings) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO smtp_settings 
        (id, host, port, secure, username, password, from_email, from_name) 
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        settings.host,
        settings.port,
        settings.secure ? 1 : 0,
        settings.username,
        settings.password,
        settings.fromEmail,
        settings.fromName
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      
      stmt.finalize();
    });
  }

  loadSmtpSettings() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT host, port, secure, username, password, from_email, from_name 
         FROM smtp_settings WHERE id = 1`,
        [],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            resolve({
              host: row.host,
              port: row.port,
              secure: row.secure === 1,
              username: row.username,
              password: row.password,
              fromEmail: row.from_email,
              fromName: row.from_name
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  saveCampaign(campaign) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO campaigns 
        (id, name, subject, template, email_format, send_rate_limit, priority, created_at, status, attachment_folder_path) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        campaign.id,
        campaign.name,
        campaign.subject,
        campaign.template,
        campaign.emailFormat,
        campaign.sendRateLimit,
        campaign.priority,
        campaign.createdAt,
        campaign.status,
        campaign.attachmentFolderPath
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      
      stmt.finalize();
    });
  }

  loadCampaigns() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, name, subject, template, email_format, send_rate_limit, priority, created_at, status, attachment_folder_path 
         FROM campaigns ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const campaigns = rows.map(row => ({
              id: row.id,
              name: row.name,
              subject: row.subject,
              template: row.template,
              emailFormat: row.email_format,
              sendRateLimit: row.send_rate_limit,
              priority: row.priority,
              createdAt: row.created_at,
              status: row.status,
              attachmentFolderPath: row.attachment_folder_path
            }));
            resolve(campaigns);
          }
        }
      );
    });
  }

  saveRecipients(campaignId, recipients) {
    return new Promise((resolve, reject) => {
      // First, delete existing recipients for this campaign
      this.db.run('DELETE FROM recipients WHERE campaign_id = ?', [campaignId], (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Insert new recipients
        const stmt = this.db.prepare(`
          INSERT INTO recipients 
          (campaign_id, email, name, subject, body, attachment_file, variables) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        let completed = 0;
        let hasError = false;

        if (recipients.length === 0) {
          resolve();
          return;
        }

        recipients.forEach(recipient => {
          const variablesJson = JSON.stringify(recipient.variables || {});
          
          stmt.run([
            campaignId,
            recipient.email,
            recipient.name,
            recipient.subject,
            recipient.body,
            recipient.attachmentFile,
            variablesJson
          ], function(err) {
            if (err && !hasError) {
              hasError = true;
              reject(err);
              return;
            }
            
            completed++;
            if (completed === recipients.length && !hasError) {
              resolve();
            }
          });
        });

        stmt.finalize();
      });
    });
  }

  loadRecipients(campaignId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT email, name, subject, body, attachment_file, variables 
         FROM recipients WHERE campaign_id = ?`,
        [campaignId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const recipients = rows.map(row => ({
              email: row.email,
              name: row.name,
              subject: row.subject,
              body: row.body,
              attachmentFile: row.attachment_file,
              variables: JSON.parse(row.variables || '{}')
            }));
            resolve(recipients);
          }
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;