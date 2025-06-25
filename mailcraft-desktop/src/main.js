const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const XLSX = require('xlsx');
const Database = require('./database');

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../public/icon.png')
  });

  // Load the app
  mainWindow.loadFile('public/index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Initialize database
const db = new Database();

// IPC handlers
ipcMain.handle('save-smtp-settings', async (event, settings) => {
  try {
    await db.saveSmtpSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Error saving SMTP settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-smtp-settings', async (event) => {
  try {
    const settings = await db.loadSmtpSettings();
    return { success: true, data: settings };
  } catch (error) {
    console.error('Error loading SMTP settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-smtp-connection', async (event, settings, testEmail) => {
  try {
    const transporter = nodemailer.createTransporter({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: {
        user: settings.username,
        pass: settings.password,
      },
    });

    // Verify connection
    await transporter.verify();

    // Send test email
    await transporter.sendMail({
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: testEmail,
      subject: 'Test email from MailCraft Desktop',
      html: `
        <h2>✅ MailCraft Desktop Test</h2>
        <p><strong>Success!</strong> Your SMTP configuration is working correctly.</p>
        <p>This test email was sent from MailCraft Desktop to verify your email server settings.</p>
        
        <h3>📧 Your SMTP Configuration:</h3>
        <ul>
          <li><strong>Host:</strong> ${settings.host}</li>
          <li><strong>Port:</strong> ${settings.port}</li>
          <li><strong>Security:</strong> ${settings.secure ? 'SSL/TLS' : 'None'}</li>
          <li><strong>From:</strong> ${settings.fromName} &lt;${settings.fromEmail}&gt;</li>
        </ul>
        
        <p><strong>✨ What this means:</strong></p>
        <ul>
          <li>Your email server credentials are correct</li>
          <li>MailCraft can connect to your SMTP server</li>
          <li>You're ready to send email campaigns!</li>
        </ul>
      `,
      text: `MailCraft Desktop Test

Success! Your SMTP configuration is working correctly.

SMTP Settings:
- Host: ${settings.host}
- Port: ${settings.port}
- Security: ${settings.secure ? 'SSL/TLS' : 'None'}
- From: ${settings.fromName} <${settings.fromEmail}>

You're ready to send email campaigns!`
    });

    return { success: true };
  } catch (error) {
    console.error('SMTP test failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-campaign-emails', async (event, campaign, recipients, smtpSettings, attachmentFolderPath) => {
  try {
    const transporter = nodemailer.createTransporter({
      host: smtpSettings.host,
      port: smtpSettings.port,
      secure: smtpSettings.secure,
      auth: {
        user: smtpSettings.username,
        pass: smtpSettings.password,
      },
    });

    let sentCount = 0;
    let failedCount = 0;
    const rateLimit = campaign.sendRateLimit || 10;
    const delayMs = (60 * 1000) / rateLimit; // Convert to milliseconds

    for (const recipient of recipients) {
      try {
        // Use individual email content if available
        const subject = recipient.subject || campaign.subject;
        const body = recipient.body || campaign.template;

        const mailOptions = {
          from: `${smtpSettings.fromName} <${smtpSettings.fromEmail}>`,
          to: recipient.email,
          subject: subject,
        };

        if (campaign.emailFormat === 'HTML') {
          mailOptions.html = body;
          mailOptions.text = body.replace(/<[^>]*>/g, ''); // Strip HTML tags
        } else {
          mailOptions.text = body;
        }

        // Handle attachments if specified
        if (recipient.attachmentFile && recipient.attachmentFile.trim() && attachmentFolderPath) {
          const attachmentFileName = recipient.attachmentFile.trim();
          const attachmentPath = path.join(attachmentFolderPath, attachmentFileName);
          
          // Check if attachment file exists
          if (fs.existsSync(attachmentPath)) {
            mailOptions.attachments = [{
              filename: attachmentFileName,
              path: attachmentPath
            }];
            console.log(`📎 Attachment found for ${recipient.email}: ${attachmentFileName}`);
          } else {
            console.error(`❌ Attachment not found for ${recipient.email}: ${attachmentPath}`);
            console.log(`⚠️ Skipping email to ${recipient.email} - attachment file missing`);
            failedCount++;
            continue; // Skip this email
          }
        }

        await transporter.sendMail(mailOptions);
        sentCount++;
        
        console.log(`✅ Sent email to: ${recipient.email}`);
        
        // Rate limiting delay
        if (sentCount + failedCount < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`❌ Failed to send email to ${recipient.email}:`, error);
        failedCount++;
      }
    }

    return { success: true, sentCount, failedCount };
  } catch (error) {
    console.error('Campaign sending failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-file-dialog', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Spreadsheet Files', extensions: ['csv', 'xlsx', 'xls'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath);
      
      return {
        success: true,
        filePath,
        fileName: path.basename(filePath),
        fileContent: fileContent.toString('base64')
      };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    console.error('File dialog error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-folder-dialog', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return {
        success: true,
        folderPath: result.filePaths[0]
      };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    console.error('Folder dialog error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-campaign', async (event, campaign) => {
  try {
    await db.saveCampaign(campaign);
    return { success: true };
  } catch (error) {
    console.error('Error saving campaign:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-campaigns', async (event) => {
  try {
    const campaigns = await db.loadCampaigns();
    return { success: true, data: campaigns };
  } catch (error) {
    console.error('Error loading campaigns:', error);
    return { success: false, error: error.message };
  }
});