const { ipcRenderer } = require('electron');
const Papa = require('papaparse');

// Global state
let currentRecipients = [];
let currentSmtpSettings = null;
let attachmentFolderPath = '';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    initializeRecipients();
    initializeSettings();
    loadSmtpSettings();
});

// Tab management
function initializeTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Recipients Tab
function initializeRecipients() {
    const selectFileBtn = document.getElementById('selectFileBtn');
    const sendTestBtn = document.getElementById('sendTestBtn');
    const startCampaignBtn = document.getElementById('startCampaignBtn');
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    
    selectFileBtn.addEventListener('click', selectFile);
    sendTestBtn.addEventListener('click', sendTestEmail);
    startCampaignBtn.addEventListener('click', startCampaign);
    selectFolderBtn.addEventListener('click', selectAttachmentFolder);
    
    // Update summary when settings change
    document.getElementById('emailFormat').addEventListener('change', updateSummary);
    document.getElementById('sendRateLimit').addEventListener('input', updateSummary);
    document.getElementById('priority').addEventListener('change', updateSummary);
}

async function selectFile() {
    try {
        const result = await ipcRenderer.invoke('open-file-dialog');
        
        if (result.success && !result.canceled) {
            await processFile(result);
            showNotification('File uploaded successfully!', 'success');
        }
    } catch (error) {
        console.error('Error selecting file:', error);
        showNotification('Error selecting file: ' + error.message, 'error');
    }
}

async function processFile(fileData) {
    try {
        const fileName = fileData.fileName.toLowerCase();
        const fileContent = Buffer.from(fileData.fileContent, 'base64');
        
        console.log('Processing file:', fileName);
        console.log('File content length:', fileContent.length);
        
        let recipients = [];
        
        if (fileName.endsWith('.csv')) {
            recipients = await parseCSV(fileContent.toString());
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            recipients = await parseExcel(fileContent);
        } else {
            throw new Error('Unsupported file type');
        }
        
        console.log('Parsed recipients:', recipients.length);
        console.log('First recipient:', recipients[0]);
        
        currentRecipients = recipients;
        displayRecipients(recipients);
        updatePreview();
        updateSummary();
        
        // Enable buttons
        document.getElementById('sendTestBtn').disabled = false;
        document.getElementById('startCampaignBtn').disabled = false;
        
    } catch (error) {
        console.error('Error processing file:', error);
        showNotification('Error processing file: ' + error.message, 'error');
    }
}

function parseCSV(content) {
    return new Promise((resolve, reject) => {
        try {
            console.log('Starting CSV parse with PapaParse...');
            
            // Detect delimiter - check first line
            const firstLine = content.split('\n')[0];
            const delimiter = firstLine.includes(';') ? ';' : ',';
            console.log('Detected delimiter:', delimiter);
            
            // Use PapaParse for robust CSV parsing
            Papa.parse(content, {
                delimiter: delimiter,
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    console.log('Papa parse complete:', results);
                    
                    if (results.errors.length > 0) {
                        console.error('Papa parse errors:', results.errors);
                    }
                    
                    const recipients = [];
                    const data = results.data;
                    
                    console.log('Parsed rows:', data.length);
                    
                    for (let i = 0; i < data.length; i++) {
                        try {
                            const recipient = processRecipientRow(data[i]);
                            if (recipient) {
                                recipients.push(recipient);
                            }
                        } catch (err) {
                            console.error('Error processing row', i, err);
                        }
                    }
                    
                    console.log('Processed recipients:', recipients.length);
                    resolve(recipients);
                },
                error: (error) => {
                    console.error('Papa parse error:', error);
                    reject(error);
                }
            });
        } catch (error) {
            console.error('CSV parsing error:', error);
            reject(error);
        }
    });
}

function parseExcel(buffer) {
    return new Promise((resolve, reject) => {
        try {
            // For demo purposes, we'll simulate Excel parsing
            // In a real implementation, you'd use a library like xlsx
            reject(new Error('Excel parsing not implemented in this demo. Please use CSV files.'));
        } catch (error) {
            reject(error);
        }
    });
}

function processRecipientRow(row) {
    const recipient = {
        email: '',
        name: '',
        subject: '',
        body: '',
        attachmentFile: '',
        variables: {}
    };
    
    // Extract email
    const emailField = row['recipient email address'] || row['email'] || row['Email'];
    if (!emailField || !emailField.trim()) {
        return null;
    }
    recipient.email = emailField.trim();
    
    // Extract templates
    let subjectTemplate = row['email title'] || '';
    let bodyTemplate = row['email text body'] || '';
    
    // Extract attachment
    recipient.attachmentFile = row['email attachment file'] || '';
    
    // Find and process variables - simplified without regex
    const variableKeys = Object.keys(row).filter(key => {
        const lowerKey = key.toLowerCase();
        return lowerKey.startsWith('var');
    });
    
    variableKeys.forEach(varKey => {
        const varValue = row[varKey] || '';
        const varName = varKey.toLowerCase();
        
        // Store variable
        recipient.variables[varKey] = varValue;
        
        // Simple string replacement for patterns like |*var1*|
        const searchPattern = `|*${varName}*|`;
        subjectTemplate = subjectTemplate.split(searchPattern).join(varValue);
        bodyTemplate = bodyTemplate.split(searchPattern).join(varValue);
    });
    
    recipient.subject = subjectTemplate;
    recipient.body = bodyTemplate;
    recipient.name = row['name'] || '';
    
    return recipient;
}

function displayRecipients(recipients) {
    const recipientsSection = document.getElementById('recipientsSection');
    const recipientCount = document.getElementById('recipientCount');
    const tableBody = document.querySelector('#recipientsTable tbody');
    
    recipientCount.textContent = recipients.length;
    recipientsSection.style.display = 'block';
    
    tableBody.innerHTML = '';
    
    // Show first 10 recipients
    const displayRecipients = recipients.slice(0, 10);
    
    displayRecipients.forEach(recipient => {
        const row = document.createElement('tr');
        
        const variables = Object.keys(recipient.variables)
            .map(key => `${key}: ${recipient.variables[key]}`)
            .join(', ') || '-';
        
        // Add attachment status indicator
        let attachmentStatus = '-';
        if (recipient.attachmentFile && recipient.attachmentFile.trim()) {
            attachmentStatus = `📎 ${recipient.attachmentFile}`;
            if (!attachmentFolderPath) {
                attachmentStatus += ' ⚠️';
            }
        }
        
        row.innerHTML = `
            <td>${recipient.email}</td>
            <td>${recipient.subject || '-'}</td>
            <td>${recipient.body ? recipient.body.substring(0, 50) + '...' : '-'}</td>
            <td>${attachmentStatus}</td>
            <td>${variables}</td>
        `;
        
        tableBody.appendChild(row);
    });
    
    if (recipients.length > 10) {
        const infoRow = document.createElement('tr');
        infoRow.innerHTML = `
            <td colspan="5" style="text-align: center; color: #666; font-style: italic;">
                Showing first 10 of ${recipients.length} recipients
            </td>
        `;
        tableBody.appendChild(infoRow);
    }
}

function updatePreview() {
    const previewArea = document.getElementById('previewArea');
    
    if (currentRecipients.length === 0) {
        previewArea.innerHTML = '<div class="no-preview">Email preview will appear here after uploading campaign emails...</div>';
        return;
    }
    
    const firstRecipient = currentRecipients[0];
    
    previewArea.innerHTML = `
        <div class="email-preview">
            <div class="preview-header">
                <div class="preview-label">Subject</div>
                <div>${firstRecipient.subject || 'No subject'}</div>
            </div>
            <div class="preview-header">
                <div class="preview-label">From</div>
                <div>SMTP Settings</div>
            </div>
            <div class="preview-header">
                <div class="preview-label">To</div>
                <div>${firstRecipient.email}</div>
            </div>
            ${firstRecipient.attachmentFile ? `
                <div class="preview-header">
                    <div class="preview-label">Attachment</div>
                    <div><i class="fas fa-paperclip"></i> ${firstRecipient.attachmentFile}</div>
                </div>
            ` : ''}
            <div class="preview-header">
                <div class="preview-label">Body Preview</div>
                <div class="preview-content">${firstRecipient.body ? firstRecipient.body.substring(0, 200) + '...' : 'No content'}</div>
            </div>
        </div>
    `;
}

function updateSummary() {
    const totalRecipients = currentRecipients.length;
    const emailFormat = document.getElementById('emailFormat').value;
    const sendRateLimit = parseInt(document.getElementById('sendRateLimit').value) || 10;
    
    document.getElementById('totalRecipients').textContent = totalRecipients;
    document.getElementById('summaryFormat').textContent = emailFormat;
    document.getElementById('summaryRate').textContent = sendRateLimit;
    document.getElementById('estimatedTime').textContent = Math.ceil(totalRecipients / sendRateLimit);
}

async function sendTestEmail() {
    const testEmail = document.getElementById('testEmail').value;
    
    if (!testEmail) {
        showNotification('Please enter a test email address', 'error');
        return;
    }
    
    if (currentRecipients.length === 0) {
        showNotification('Please upload recipients first', 'error');
        return;
    }
    
    if (!currentSmtpSettings) {
        showNotification('Please configure SMTP settings first', 'error');
        return;
    }
    
    const sendTestBtn = document.getElementById('sendTestBtn');
    sendTestBtn.disabled = true;
    sendTestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    try {
        const result = await ipcRenderer.invoke('test-smtp-connection', currentSmtpSettings, testEmail);
        
        if (result.success) {
            showNotification('Test email sent successfully!', 'success');
        } else {
            showNotification('Failed to send test email: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error sending test email: ' + error.message, 'error');
    } finally {
        sendTestBtn.disabled = false;
        sendTestBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Test';
    }
}

async function startCampaign() {
    if (currentRecipients.length === 0) {
        showNotification('Please upload recipients first', 'error');
        return;
    }
    
    if (!currentSmtpSettings) {
        showNotification('Please configure SMTP settings first', 'error');
        return;
    }
    
    const startCampaignBtn = document.getElementById('startCampaignBtn');
    startCampaignBtn.disabled = true;
    startCampaignBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
    
    try {
        const campaign = {
            id: Date.now().toString(),
            name: `Campaign ${new Date().toLocaleDateString()}`,
            subject: 'Individual Email Campaign',
            template: 'Individual emails with custom content',
            emailFormat: document.getElementById('emailFormat').value,
            sendRateLimit: parseInt(document.getElementById('sendRateLimit').value) || 10,
            priority: document.getElementById('priority').value,
            createdAt: Date.now(),
            status: 'sending',
            attachmentFolderPath: attachmentFolderPath
        };
        
        const result = await ipcRenderer.invoke('send-campaign-emails', campaign, currentRecipients, currentSmtpSettings, attachmentFolderPath);
        
        if (result.success) {
            const message = `Campaign completed! Sent: ${result.sentCount}, Failed: ${result.failedCount || 0} emails.`;
            showNotification(message, result.failedCount > 0 ? 'info' : 'success');
        } else {
            showNotification('Failed to start campaign: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error starting campaign: ' + error.message, 'error');
    } finally {
        startCampaignBtn.disabled = false;
        startCampaignBtn.innerHTML = '<i class="fas fa-rocket"></i> Start Campaign';
    }
}

async function selectAttachmentFolder() {
    try {
        const result = await ipcRenderer.invoke('select-folder-dialog');
        
        if (result.success && !result.canceled) {
            attachmentFolderPath = result.folderPath;
            document.getElementById('attachmentFolder').value = attachmentFolderPath;
            showNotification('Attachment folder selected successfully!', 'success');
            
            // Refresh the recipients display to update attachment warnings
            if (currentRecipients.length > 0) {
                displayRecipients(currentRecipients);
            }
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        showNotification('Error selecting folder: ' + error.message, 'error');
    }
}

// Settings Tab
function initializeSettings() {
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const testSmtpBtn = document.getElementById('testSmtpBtn');
    
    saveSettingsBtn.addEventListener('click', saveSmtpSettings);
    testSmtpBtn.addEventListener('click', testSmtpConnection);
    
    // Enable/disable test button based on settings
    const smtpInputs = ['smtpHost', 'smtpUsername'];
    smtpInputs.forEach(inputId => {
        document.getElementById(inputId).addEventListener('input', updateSmtpButtonStates);
    });
    
    document.getElementById('testSmtpEmail').addEventListener('input', updateSmtpButtonStates);
}

function updateSmtpButtonStates() {
    const host = document.getElementById('smtpHost').value;
    const username = document.getElementById('smtpUsername').value;
    const testEmail = document.getElementById('testSmtpEmail').value;
    
    const testBtn = document.getElementById('testSmtpBtn');
    const warning = document.getElementById('smtpWarning');
    
    if (host && username) {
        testBtn.disabled = !testEmail;
        warning.style.display = 'none';
    } else {
        testBtn.disabled = true;
        warning.style.display = 'block';
    }
}

async function saveSmtpSettings() {
    const settings = {
        host: document.getElementById('smtpHost').value,
        port: parseInt(document.getElementById('smtpPort').value) || 587,
        secure: document.getElementById('smtpSecure').checked,
        username: document.getElementById('smtpUsername').value,
        password: document.getElementById('smtpPassword').value,
        fromEmail: document.getElementById('fromEmail').value,
        fromName: document.getElementById('fromName').value
    };
    
    if (!settings.host || !settings.username || !settings.fromEmail) {
        showNotification('Please fill in all required SMTP settings', 'error');
        return;
    }
    
    const saveBtn = document.getElementById('saveSettingsBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    try {
        const result = await ipcRenderer.invoke('save-smtp-settings', settings);
        
        if (result.success) {
            currentSmtpSettings = settings;
            showNotification('SMTP settings saved successfully!', 'success');
            updateSmtpButtonStates();
        } else {
            showNotification('Failed to save SMTP settings: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error saving SMTP settings: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
    }
}

async function loadSmtpSettings() {
    try {
        const result = await ipcRenderer.invoke('load-smtp-settings');
        
        if (result.success && result.data) {
            const settings = result.data;
            currentSmtpSettings = settings;
            
            document.getElementById('smtpHost').value = settings.host || '';
            document.getElementById('smtpPort').value = settings.port || 587;
            document.getElementById('smtpSecure').checked = settings.secure || false;
            document.getElementById('smtpUsername').value = settings.username || '';
            document.getElementById('smtpPassword').value = settings.password || '';
            document.getElementById('fromEmail').value = settings.fromEmail || '';
            document.getElementById('fromName').value = settings.fromName || 'MailCraft';
            
            updateSmtpButtonStates();
        }
    } catch (error) {
        console.error('Error loading SMTP settings:', error);
    }
}

async function testSmtpConnection() {
    const testEmail = document.getElementById('testSmtpEmail').value;
    
    if (!testEmail) {
        showNotification('Please enter a test email address', 'error');
        return;
    }
    
    const settings = {
        host: document.getElementById('smtpHost').value,
        port: parseInt(document.getElementById('smtpPort').value) || 587,
        secure: document.getElementById('smtpSecure').checked,
        username: document.getElementById('smtpUsername').value,
        password: document.getElementById('smtpPassword').value,
        fromEmail: document.getElementById('fromEmail').value,
        fromName: document.getElementById('fromName').value
    };
    
    const testBtn = document.getElementById('testSmtpBtn');
    testBtn.disabled = true;
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    
    try {
        const result = await ipcRenderer.invoke('test-smtp-connection', settings, testEmail);
        
        if (result.success) {
            showNotification('Test email sent successfully! Check your inbox.', 'success');
        } else {
            showNotification('SMTP test failed: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error testing SMTP: ' + error.message, 'error');
    } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Test Email';
        updateSmtpButtonStates();
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}