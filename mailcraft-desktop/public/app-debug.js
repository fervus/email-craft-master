const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Debug logging
function debugLog(message) {
    const logPath = path.join(require('os').homedir(), 'mailcraft-debug.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `${timestamp}: ${message}\n`);
    console.log(message);
}

// Test CSV parsing directly
async function testCSVParsing() {
    try {
        debugLog('Starting CSV test...');
        
        const testContent = `recipient email address;email title;email attachment file;email text body;var1;var2
vdiaconeasa@gmail.com;Your invoice |*var1*| and order |*var2*| details;email_file1.pdf;"<p>Dear |*var1*|,</p>
<p>Thank you for your order |*var2*|. Please find the attached invoice for details.</p>
<p>Best regards,<br>Company</p>";Test1;Order1`;

        debugLog('Test content: ' + testContent.substring(0, 100));
        
        // Simple parse test
        const lines = testContent.split('\n');
        debugLog('Lines found: ' + lines.length);
        debugLog('First line: ' + lines[0]);
        
        // Test delimiter detection
        const delimiter = lines[0].includes(';') ? ';' : ',';
        debugLog('Delimiter: ' + delimiter);
        
        // Test header split
        const headers = lines[0].split(delimiter);
        debugLog('Headers: ' + JSON.stringify(headers));
        
        debugLog('CSV test completed successfully');
    } catch (error) {
        debugLog('CSV test error: ' + error.message);
    }
}

// Run test on load
debugLog('App-debug loaded');
testCSVParsing();

// Simple UI test
document.addEventListener('DOMContentLoaded', function() {
    debugLog('DOM loaded');
    
    // Add a test button
    const testBtn = document.createElement('button');
    testBtn.textContent = 'Test CSV Debug';
    testBtn.style.position = 'fixed';
    testBtn.style.top = '10px';
    testBtn.style.right = '10px';
    testBtn.style.zIndex = '9999';
    testBtn.onclick = function() {
        debugLog('Test button clicked');
        alert('Check ~/mailcraft-debug.log for debug info');
    };
    document.body.appendChild(testBtn);
});