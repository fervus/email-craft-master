const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;

// Enable better error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), 
    `${new Date().toISOString()} - Uncaught Exception: ${error.stack}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), 
    `${new Date().toISOString()} - Unhandled Rejection: ${reason}\n`);
});

function createWindow() {
  console.log('Creating main window...');
  
  // Create the browser window with minimal, stable settings
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Remove potentially problematic settings
      webSecurity: true,
      sandbox: false,
      spellcheck: false
    },
    // Conservative window settings
    show: false,
    backgroundColor: '#ffffff',
    titleBarStyle: 'default',
    resizable: true,
    maximizable: true,
    minimizable: true,
    closable: true
  });

  // Load the app
  mainWindow.loadFile('public/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    console.log('Window should be visible now');
  });
  
  // Force show after a delay if needed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
      console.log('Force showing window');
    }
  }, 2000);

  // Handle renderer crashes
  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('Renderer crashed:', killed);
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), 
      `${new Date().toISOString()} - Renderer crashed: ${killed}\n`);
    
    // Reload the window
    mainWindow.reload();
  });

  // Handle renderer errors
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Render process gone:', details);
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), 
      `${new Date().toISOString()} - Render process gone: ${JSON.stringify(details)}\n`);
  });

  // Handle unresponsive renderer
  mainWindow.on('unresponsive', () => {
    console.error('Window became unresponsive');
  });

  mainWindow.on('responsive', () => {
    console.log('Window became responsive again');
  });

  // Prevent navigation away from app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // Prevent accidental closing
  mainWindow.on('close', function (event) {
    console.log('Window close event triggered');
    // Comment out to prevent closing for debugging
    // event.preventDefault();
  });

  mainWindow.on('closed', function () {
    console.log('Window closed');
    mainWindow = null;
  });
}

// Disable hardware acceleration if it causes issues
app.disableHardwareAcceleration();

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Use app.on('ready') instead of app.whenReady()
  app.on('ready', () => {
    setTimeout(createWindow, 100); // Small delay
  });
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Simplified IPC handlers with error handling
const Database = require('./database');
const db = new Database();

// Wrap all IPC handlers with try-catch
function safeHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      console.error(`Error in ${channel}:`, error);
      return { success: false, error: error.message };
    }
  });
}

// Basic handlers only - no complex operations
safeHandle('save-smtp-settings', async (event, settings) => {
  await db.saveSmtpSettings(settings);
  return { success: true };
});

safeHandle('load-smtp-settings', async (event) => {
  const settings = await db.loadSmtpSettings();
  return { success: true, data: settings };
});

safeHandle('open-file-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
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
});

safeHandle('select-folder-dialog', async (event) => {
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
});

// Simple test email sending
safeHandle('test-smtp-connection', async (event, settings, testEmail) => {
  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransporter({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  await transporter.verify();
  
  await transporter.sendMail({
    from: `${settings.fromName} <${settings.fromEmail}>`,
    to: testEmail,
    subject: 'Test email from MailCraft Desktop',
    text: 'This is a test email from MailCraft Desktop.',
    html: '<h2>Test Email</h2><p>This is a test email from MailCraft Desktop.</p>'
  });

  return { success: true };
});

// Simplified campaign sending
safeHandle('send-campaign-emails', async (event, campaign, recipients, smtpSettings, attachmentFolderPath) => {
  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransporter({
    host: smtpSettings.host,
    port: smtpSettings.port,
    secure: smtpSettings.secure,
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    try {
      const mailOptions = {
        from: `${smtpSettings.fromName} <${smtpSettings.fromEmail}>`,
        to: recipient.email,
        subject: recipient.subject || 'No subject',
        html: recipient.body || 'No content',
        text: recipient.body ? recipient.body.replace(/<[^>]*>/g, '') : 'No content'
      };

      // Handle attachments if specified
      if (recipient.attachmentFile && attachmentFolderPath) {
        const attachmentPath = path.join(attachmentFolderPath, recipient.attachmentFile);
        
        if (fs.existsSync(attachmentPath)) {
          mailOptions.attachments = [{
            filename: recipient.attachmentFile,
            path: attachmentPath
          }];
        } else {
          console.log(`Attachment not found: ${attachmentPath}`);
          failedCount++;
          continue;
        }
      }

      await transporter.sendMail(mailOptions);
      sentCount++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 6000)); // 10 per minute
      
    } catch (error) {
      console.error(`Failed to send to ${recipient.email}:`, error);
      failedCount++;
    }
  }

  return { success: true, sentCount, failedCount };
});