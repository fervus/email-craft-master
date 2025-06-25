const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const JsonStorage = require('./json-storage');

// Keep a global reference of the window object
let mainWindow;
const storage = new JsonStorage();

// Disable hardware acceleration to prevent crashes
app.disableHardwareAcceleration();

// Enable garbage collection for large campaigns
app.commandLine.appendSwitch('--expose-gc');
app.commandLine.appendSwitch('--max-old-space-size', '4096');

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
        { name: 'Campaign Files', extensions: ['csv', 'xlsx', 'xls'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileName = path.basename(filePath);
      
      // Handle Excel files differently
      if (fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')) {
        const parsedData = await parseExcelFile(filePath);
        return {
          success: true,
          filePath,
          fileName,
          fileType: 'excel',
          parsedData: parsedData
        };
      } else {
        // Handle CSV files as before
        const fileContent = fs.readFileSync(filePath);
        return {
          success: true,
          filePath,
          fileName,
          fileType: 'csv',
          fileContent: fileContent.toString('base64')
        };
      }
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    console.error('File dialog error:', error);
    return { success: false, error: error.message };
  }
});

// Parse Excel file using XLSX library
async function parseExcelFile(filePath) {
  try {
    const XLSX = require('xlsx');
    
    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    
    // Get the first worksheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON (array of objects with header row as keys)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      defval: '',  // Default value for empty cells
      raw: false   // Convert all values to strings
    });
    
    console.log(`Parsed Excel file: ${jsonData.length} rows`);
    return jsonData;
    
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

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

// Attachment folder settings handlers
ipcMain.handle('save-attachment-folder', async (event, folderPath) => {
  try {
    const success = storage.saveAttachmentFolderPath(folderPath);
    return { success };
  } catch (error) {
    console.error('Save attachment folder error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-attachment-folder', async (event) => {
  try {
    const folderPath = storage.getAttachmentFolderPath();
    return { success: true, folderPath };
  } catch (error) {
    console.error('Load attachment folder error:', error);
    return { success: false, error: error.message };
  }
});

// Campaign settings handlers
ipcMain.handle('save-campaign-settings', async (event, campaignSettings) => {
  try {
    const success = storage.saveCampaignSettings(campaignSettings);
    return { success };
  } catch (error) {
    console.error('Save campaign settings error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-campaign-settings', async (event) => {
  try {
    const settings = storage.getCampaignSettings();
    return { success: true, settings };
  } catch (error) {
    console.error('Load campaign settings error:', error);
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

// Validate recipient before sending
function validateRecipient(recipient, attachmentFolderPath) {
  try {
    // Basic safety checks
    if (!recipient || !recipient.email) {
      return {
        valid: false,
        error: 'Invalid recipient data'
      };
    }

    // Check if attachment is needed but folder not set
    if (recipient.attachmentFile && !attachmentFolderPath) {
      return {
        valid: false,
        error: `Attachment file '${recipient.attachmentFile}' specified but no attachment folder is set`
      };
    }

  // Check if attachment file exists (if folder is set)
  if (recipient.attachmentFile && attachmentFolderPath) {
    const attachmentPath = path.join(attachmentFolderPath, recipient.attachmentFile);
    if (!fs.existsSync(attachmentPath)) {
      return {
        valid: false,
        error: `Attachment file not found: ${recipient.attachmentFile}`
      };
    }
  }

  // Check for missing variables in subject
  if (recipient.subject) {
    const subjectVars = extractVariables(recipient.subject);
    for (const varName of subjectVars) {
      if (!recipient.variables || !recipient.variables.hasOwnProperty(varName)) {
        return {
          valid: false,
          error: `Missing required variable '${varName}' in subject - column not found in CSV`
        };
      }
      if (!recipient.variables[varName] || recipient.variables[varName].toString().trim() === '') {
        return {
          valid: false,
          error: `Empty value for required variable '${varName}' in subject`
        };
      }
    }
  }

  // Check for missing variables in body
  if (recipient.body) {
    const bodyVars = extractVariables(recipient.body);
    for (const varName of bodyVars) {
      if (!recipient.variables || !recipient.variables.hasOwnProperty(varName)) {
        return {
          valid: false,
          error: `Missing required variable '${varName}' in email body - column not found in CSV`
        };
      }
      if (!recipient.variables[varName] || recipient.variables[varName].toString().trim() === '') {
        return {
          valid: false,
          error: `Empty value for required variable '${varName}' in email body`
        };
      }
    }
  }

    return { valid: true };
  } catch (error) {
    console.error('Validation error:', error);
    return {
      valid: false,
      error: `Validation failed: ${error.message}`
    };
  }
}

// Extract variable names from text (|*varname*| pattern)
function extractVariables(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  const variablePattern = /\|\*([^*|]+)\*\|/g;
  const variables = [];
  let match;
  let iterations = 0;
  const maxIterations = 100; // Prevent infinite loops
  
  while ((match = variablePattern.exec(text)) !== null && iterations < maxIterations) {
    variables.push(match[1]);
    iterations++;
  }
  
  return [...new Set(variables)]; // Remove duplicates
}

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
    let lastProgressUpdate = 0;

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
        // Send progress update only every 5 emails to reduce IPC overhead
        const now = Date.now();
        if (i % 5 === 0 || now - lastProgressUpdate > 2000) {
          event.sender.send('campaign-progress', {
            total: recipients.length,
            sent: sentCount,
            failed: failedCount,
            current: i + 1,
            status: 'sending',
            currentEmail: recipient.email
          });
          lastProgressUpdate = now;
        }

        // Validate email before sending
        try {
          const validationResult = validateRecipient(recipient, attachmentFolderPath);
          if (!validationResult.valid) {
            emailResults.push({
              email: recipient.email || 'Unknown',
              subject: recipient.subject || 'No subject',
              status: 'failed',
              error: validationResult.error,
              timestamp: new Date().toISOString()
            });
            failedCount++;
            continue;
          }
        } catch (validationError) {
          console.error('Validation error for recipient:', recipient.email, validationError);
          emailResults.push({
            email: recipient.email || 'Unknown',
            subject: recipient.subject || 'No subject',
            status: 'failed',
            error: `Validation error: ${validationError.message}`,
            timestamp: new Date().toISOString()
          });
          failedCount++;
          continue;
        }

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

        // Handle attachments if specified (validation already done)
        if (recipient.attachmentFile && attachmentFolderPath) {
          const attachmentPath = path.join(attachmentFolderPath, recipient.attachmentFile);
          mailOptions.attachments = [{
            filename: recipient.attachmentFile,
            path: attachmentPath
          }];
        }

        await transporter.sendMail(mailOptions);
        
        // Only store failed results to save memory for large campaigns
        sentCount++;
        
        // Faster rate limiting for large campaigns - 1 email per second
        const delay = recipients.length > 50 ? 1000 : 6000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Force garbage collection every 50 emails for large campaigns
        if (recipients.length > 100 && i % 50 === 0 && global.gc) {
          global.gc();
        }
        
      } catch (error) {
        const errorMsg = error.message || 'Unknown error occurred';
        console.error(`Failed to send to ${recipient.email}:`, error);
        
        // Only store failed email details to reduce memory usage
        emailResults.push({
          email: recipient.email,
          subject: emailSubject || 'No subject',
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

    // Save campaign result to history (only store failed results to save space)
    const campaignResult = {
      id: Date.now().toString(),
      date: startTime.toISOString(),
      totalRecipients: recipients.length,
      sentCount,
      failedCount,
      deliveryRate: ((sentCount / recipients.length) * 100).toFixed(1),
      status: failedCount === 0 ? 'success' : sentCount === 0 ? 'error' : 'partial',
      duration: Math.round((Date.now() - startTime.getTime()) / 1000 / 60), // minutes
      emailResults: emailResults, // Only failed results stored
      successfulEmails: sentCount // Just count successful ones
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

// Handle dropped Excel files
ipcMain.handle('process-dropped-excel', async (event, fileBuffer, fileName) => {
  try {
    console.log('Processing dropped Excel file:', fileName);
    const XLSX = require('xlsx');
    
    // Create workbook from buffer
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    // Get the first worksheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      defval: '',  // Default value for empty cells
      raw: false   // Convert all values to strings
    });
    
    console.log(`Parsed dropped Excel file: ${jsonData.length} rows`);
    return {
      success: true,
      data: jsonData,
      fileName: fileName
    };
    
  } catch (error) {
    console.error('Error processing dropped Excel file:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

console.log('MailCraft Desktop main process loaded successfully');