const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const JsonStorage = require('./json-storage');

// Keep a global reference of the window object
let mainWindow;
const storage = new JsonStorage();

// Disable hardware acceleration to prevent crashes
app.disableHardwareAcceleration();

function createWindow() {
  console.log('Creating main window...');
  
  // Create the browser window with stable settings
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true
    },
    show: false,
    backgroundColor: '#ffffff'
  });

  // Load the app
  mainWindow.loadFile('public/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('Window ready and shown');
  });

  mainWindow.on('closed', function () {
    console.log('Window closed');
    mainWindow = null;
  });
}

// App lifecycle
app.on('ready', () => {
  console.log('App ready, creating window...');
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// File dialog handlers
ipcMain.handle('open-file-dialog', async (event) => {
  try {
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

// SMTP settings handlers using JSON storage
ipcMain.handle('save-smtp-settings', async (event, settings) => {
  try {
    const success = storage.saveSmtpSettings(settings);
    return { success };
  } catch (error) {
    console.error('Save SMTP error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-smtp-settings', async (event) => {
  try {
    const data = storage.getSmtpSettings();
    return { success: true, data };
  } catch (error) {
    console.error('Load SMTP error:', error);
    return { success: false, error: error.message };
  }
});

// SMTP test handler
ipcMain.handle('test-smtp-connection', async (event, settings, testEmail) => {
  try {
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
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

    // Verify connection
    await transporter.verify();
    
    // Send test email
    await transporter.sendMail({
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: testEmail,
      subject: 'Test email from MailCraft Desktop',
      text: 'This is a test email from MailCraft Desktop.',
      html: '<h2>Test Email</h2><p>This is a test email from MailCraft Desktop.</p>'
    });

    return { success: true };
  } catch (error) {
    console.error('SMTP test error:', error);
    return { success: false, error: error.message };
  }
});

// Send test email with recipient content
ipcMain.handle('send-test-email', async (event, settings, testEmail, recipient) => {
  try {
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
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

    // Send test email with recipient content
    await transporter.sendMail({
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: testEmail,
      subject: `[TEST] ${recipient.subject || 'No subject'}`,
      text: recipient.body ? recipient.body.replace(/<[^>]*>/g, '') : 'No content',
      html: recipient.body || 'No content'
    });

    return { success: true };
  } catch (error) {
    console.error('Test email error:', error);
    return { success: false, error: error.message };
  }
});

// Campaign sending handler
ipcMain.handle('send-campaign-emails', async (event, campaign, recipients, smtpSettings, attachmentFolderPath) => {
  try {
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
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
    const startTime = new Date();
    const emailResults = []; // Track detailed results

    // Send initial progress update
    event.sender.send('campaign-progress', {
      total: recipients.length,
      sent: 0,
      failed: 0,
      current: 0,
      status: 'starting'
    });

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      
      try {
        // Send progress update
        event.sender.send('campaign-progress', {
          total: recipients.length,
          sent: sentCount,
          failed: failedCount,
          current: i + 1,
          status: 'sending',
          currentEmail: recipient.email
        });

        // Apply variable replacements to subject and body
        let emailSubject = recipient.subject || 'No subject';
        let emailBody = recipient.body || 'No content';
        
        // Replace variables in subject and body
        if (recipient.variables) {
          Object.entries(recipient.variables).forEach(([key, value]) => {
            const varPattern = new RegExp(`\\|\\*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\|`, 'g');
            emailSubject = emailSubject.replace(varPattern, value);
            emailBody = emailBody.replace(varPattern, value);
          });
        }

        const mailOptions = {
          from: `${smtpSettings.fromName} <${smtpSettings.fromEmail}>`,
          to: recipient.email,
          subject: emailSubject,
          html: emailBody,
          text: emailBody.replace(/<[^>]*>/g, '')
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
            const errorMsg = `Attachment file not found: ${recipient.attachmentFile}`;
            console.log(errorMsg);
            emailResults.push({
              email: recipient.email,
              subject: emailSubject,
              status: 'failed',
              error: errorMsg,
              timestamp: new Date().toISOString()
            });
            failedCount++;
            continue;
          }
        }

        await transporter.sendMail(mailOptions);
        emailResults.push({
          email: recipient.email,
          subject: emailSubject,
          status: 'sent',
          timestamp: new Date().toISOString()
        });
        sentCount++;
        
        // Rate limiting - 10 emails per minute
        await new Promise(resolve => setTimeout(resolve, 6000));
        
      } catch (error) {
        const errorMsg = error.message || 'Unknown error occurred';
        console.error(`Failed to send to ${recipient.email}:`, error);
        emailResults.push({
          email: recipient.email,
          subject: emailSubject,
          status: 'failed',
          error: errorMsg,
          timestamp: new Date().toISOString()
        });
        failedCount++;
      }
    }

    // Send final progress update
    event.sender.send('campaign-progress', {
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      current: recipients.length,
      status: 'completed'
    });

    // Save campaign result to history
    const campaignResult = {
      id: Date.now().toString(),
      date: startTime.toISOString(),
      totalRecipients: recipients.length,
      sentCount,
      failedCount,
      deliveryRate: ((sentCount / recipients.length) * 100).toFixed(1),
      status: failedCount === 0 ? 'success' : sentCount === 0 ? 'error' : 'partial',
      duration: Math.round((Date.now() - startTime.getTime()) / 1000 / 60), // minutes
      emailResults: emailResults // Store detailed results
    };

    storage.saveCampaignResult(campaignResult);

    return { success: true, sentCount, failedCount };
  } catch (error) {
    console.error('Campaign error:', error);
    return { success: false, error: error.message };
  }
});

// Campaign history handler
ipcMain.handle('load-campaign-history', async (event) => {
  try {
    const campaigns = storage.getCampaignHistory();
    return { success: true, data: campaigns };
  } catch (error) {
    console.error('Load campaign history error:', error);
    return { success: false, error: error.message };
  }
});

// Get campaign details handler
ipcMain.handle('get-campaign-details', async (event, campaignId) => {
  try {
    const campaigns = storage.getCampaignHistory();
    const campaign = campaigns.find(c => c.id === campaignId);
    
    if (!campaign) {
      return { success: false, error: 'Campaign not found' };
    }
    
    return { success: true, data: campaign };
  } catch (error) {
    console.error('Get campaign details error:', error);
    return { success: false, error: error.message };
  }
});

console.log('MailCraft Desktop main process loaded successfully');