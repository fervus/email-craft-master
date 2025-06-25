const { ipcRenderer } = require('electron');

// Global state
let currentRecipients = [];
let currentSmtpSettings = null;
let attachmentFolderPath = '';

// Pagination state
let currentPage = 1;
let recipientsPerPage = 10;

// Campaign pagination state
let allCampaigns = [];
let currentCampaignPage = 1;
let campaignsPerPage = 10;

// Editing state
let editingRowIndex = -1;

// Event listener cleanup tracking
let globalEventListeners = [];
let componentEventListeners = new Map();

// Debounce function to prevent rapid input events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Safe event handler wrapper
function safeEventHandler(handler) {
    return function(...args) {
        try {
            return handler.apply(this, args);
        } catch (error) {
            console.error('Event handler error:', error);
            showNotification('An error occurred: ' + error.message, 'error');
        }
    };
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Global drag and drop handling - prevent default file opening
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        window.addEventListener('drop', (e) => {
            e.preventDefault(); // Always prevent default to stop file dialogs
            e.stopPropagation();
        });
        
        initializeTabs();
        initializeRecipients();
        initializeSettings();
        setupProgressListener();
        loadSmtpSettings();
        loadAttachmentFolder();
        loadCampaignSettings();
        loadRecentCampaigns();
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
    clearEventListeners();
    currentRecipients.length = 0;
    cleanupMemory();
});

// Tab management
function initializeTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', safeEventHandler(() => {
            const targetTab = tab.getAttribute('data-tab');
            
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            
            tab.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        }));
    });
}

// Recipients Tab
function initializeRecipients() {
    const selectFileBtn = document.getElementById('selectFileBtn');
    const sendTestBtn = document.getElementById('sendTestBtn');
    const startCampaignBtn = document.getElementById('startCampaignBtn');
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    const uploadArea = document.getElementById('uploadArea');
    
    if (selectFileBtn) selectFileBtn.addEventListener('click', safeEventHandler(selectFile));
    if (sendTestBtn) sendTestBtn.addEventListener('click', safeEventHandler(sendTestEmail));
    if (startCampaignBtn) startCampaignBtn.addEventListener('click', safeEventHandler(startCampaign));
    if (selectFolderBtn) selectFolderBtn.addEventListener('click', safeEventHandler(selectAttachmentFolder));
    
    // Setup drag and drop
    if (uploadArea) {
        setupDragAndDrop(uploadArea);
    }
    
    // Update summary when settings change - with debounce
    const emailFormat = document.getElementById('emailFormat');
    const sendRateLimit = document.getElementById('sendRateLimit');
    const priority = document.getElementById('priority');
    
    if (emailFormat) {
        emailFormat.addEventListener('change', debounce(() => {
            updateSummary();
            saveCampaignSettings();
        }, 300));
    }
    if (sendRateLimit) {
        sendRateLimit.addEventListener('input', debounce(() => {
            updateSummary();
            saveCampaignSettings();
        }, 300));
    }
    if (priority) {
        priority.addEventListener('change', debounce(() => {
            updateSummary();
            saveCampaignSettings();
        }, 300));
    }
}

// Settings Tab
function initializeSettings() {
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const testSmtpBtn = document.getElementById('testSmtpBtn');
    
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', safeEventHandler(saveSmtpSettings));
    if (testSmtpBtn) testSmtpBtn.addEventListener('click', safeEventHandler(testSmtpConnection));
    
    // Enable/disable test button based on settings - with debounce
    const smtpInputs = ['smtpHost', 'smtpUsername', 'testSmtpEmail'];
    smtpInputs.forEach(inputId => {
        const element = document.getElementById(inputId);
        if (element) {
            element.addEventListener('input', debounce(updateSmtpButtonStates, 300));
        }
    });
}

// File selection
async function selectFile() {
    try {
        const result = await ipcRenderer.invoke('open-file-dialog');
        
        if (result.success && !result.canceled) {
            await processFile(result);
            showNotification('File uploaded successfully!', 'success');
        }
    } catch (error) {
        console.error('Error selecting file:', error);
        showNotification('Error selecting file', 'error');
    }
}

// Advanced CSV parser that handles multi-line quoted content
function parseCSV(csvContent) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let delimiter = ',';
    
    // Auto-detect delimiter by checking first line
    const firstLine = csvContent.split('\n')[0];
    if (firstLine.split(';').length > firstLine.split(',').length) {
        delimiter = ';';
    }
    
    console.log('Auto-detected delimiter:', delimiter);
    
    for (let i = 0; i < csvContent.length; i++) {
        const char = csvContent[i];
        const nextChar = csvContent[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote - add one quote to field
                currentField += '"';
                i++; // Skip the next quote
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            // End of field
            currentRow.push(currentField.trim());
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            // End of row (only if not inside quotes)
            if (currentField || currentRow.length > 0) {
                currentRow.push(currentField.trim());
                if (currentRow.some(field => field)) { // Only add non-empty rows
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
            }
        } else if (char !== '\r') { // Skip carriage returns
            // Regular character
            currentField += char;
        }
    }
    
    // Handle last field/row
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field)) {
            rows.push(currentRow);
        }
    }
    
    return { rows, delimiter };
}

async function processFile(fileData) {
    try {
        // Clean up previous data
        if (currentRecipients.length > 0) {
            clearEventListeners();
            currentRecipients.length = 0;
            cleanupMemory();
        }
        
        const fileName = fileData.fileName.toLowerCase();
        let recipients = [];
        
        if (fileData.fileType === 'excel') {
            // Handle Excel files (already parsed by main process)
            console.log('Processing Excel file...');
            const excelData = fileData.parsedData;
            
            if (excelData.length === 0) {
                throw new Error('Excel file appears to be empty');
            }
            
            console.log('Excel data received:', excelData.length, 'rows');
            console.log('First row sample:', excelData[0]);
            
            // Process each row
            excelData.forEach((row, index) => {
                console.log(`Processing row ${index + 1}:`, row);
                
                // Extract recipient data with flexible column matching
                const recipient = {
                    email: row['recipient email address'] || row['email'] || row['Email'] || '',
                    subject: row['email title'] || row['subject'] || row['Subject'] || '',
                    body: row['email text body'] || row['body'] || row['Body'] || row['message'] || '',
                    attachmentFile: row['email attachment file'] || row['attachment'] || row['Attachment'] || '',
                    variables: {}
                };
                
                // Store all variables (no replacement during loading)
                Object.keys(row).forEach(key => {
                    if (key.toLowerCase().startsWith('var') || key.toLowerCase().includes('variable')) {
                        recipient.variables[key] = String(row[key] || '');
                    }
                });
                
                if (recipient.email) {
                    recipients.push(recipient);
                    console.log('Added recipient:', recipient.email);
                } else {
                    console.log('Skipping row without email:', row);
                }
            });
            
        } else if (fileName.endsWith('.csv')) {
            console.log('Processing CSV file...');
            
            const fileContent = Buffer.from(fileData.fileContent, 'base64').toString();
            const { rows, delimiter } = parseCSV(fileContent);
            
            if (rows.length < 2) {
                throw new Error('CSV must have header and at least one data row');
            }
            
            // Get headers
            const headers = rows[0].map(h => h.replace(/"/g, '').trim());
            console.log('Headers found:', headers);
            console.log('Total rows (including header):', rows.length);
            
            // Process data rows
            for (let i = 1; i < rows.length; i++) {
                const values = rows[i];
                const row = {};
                
                // Map values to headers
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                
                console.log(`Row ${i}:`, row);
                
                // Extract recipient data with flexible column matching
                const recipient = {
                    email: row['recipient email address'] || row['email'] || row['Email'] || '',
                    subject: row['email title'] || row['subject'] || row['Subject'] || '',
                    body: row['email text body'] || row['body'] || row['Body'] || row['message'] || '',
                    attachmentFile: row['email attachment file'] || row['attachment'] || row['Attachment'] || '',
                    variables: {}
                };
                
                // Store all variables (no replacement during loading)
                Object.keys(row).forEach(key => {
                    if (key.toLowerCase().startsWith('var') || key.toLowerCase().includes('variable')) {
                        recipient.variables[key] = row[key];
                    }
                });
                
                if (recipient.email) {
                    recipients.push(recipient);
                    console.log('Added recipient:', recipient.email);
                } else {
                    console.log('Skipping row without email:', row);
                }
            }
        } else {
            throw new Error('Please use CSV or Excel (XLS/XLSX) files');
        }
        
        console.log(`Successfully processed ${recipients.length} recipients`);
        
        if (recipients.length === 0) {
            throw new Error('No valid recipients found in the file');
        }
        
        currentRecipients = recipients;
        displayRecipients(recipients);
        updatePreview();
        updateSummary();
        
        // Enable buttons
        const sendTestBtn = document.getElementById('sendTestBtn');
        const startCampaignBtn = document.getElementById('startCampaignBtn');
        if (sendTestBtn) sendTestBtn.disabled = false;
        if (startCampaignBtn) startCampaignBtn.disabled = false;
        
    } catch (error) {
        console.error('Error processing file:', error);
        showNotification(`Error processing file: ${error.message}`, 'error');
    }
}

// Clear previous event listeners to prevent memory leaks
function clearEventListeners() {
    // Clear component-specific listeners
    componentEventListeners.forEach((listeners, element) => {
        listeners.forEach(({ event, handler }) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(event, handler);
            }
        });
    });
    componentEventListeners.clear();
}

// Add tracked event listener
function addTrackedEventListener(element, event, handler) {
    if (!componentEventListeners.has(element)) {
        componentEventListeners.set(element, []);
    }
    componentEventListeners.get(element).push({ event, handler });
    element.addEventListener(event, handler);
}

// Display recipients with pagination
function displayRecipients(recipients) {
    try {
        // Clear previous event listeners to prevent memory leaks
        clearEventListeners();
        
        const recipientsSection = document.getElementById('recipientsSection');
        const recipientCount = document.getElementById('recipientCount');
        const table = document.getElementById('recipientsTable');
        const tableBody = table.querySelector('tbody');
        const tableHead = table.querySelector('thead tr');
        
        if (!recipientsSection || !recipientCount || !tableBody || !tableHead) return;
        
        recipientCount.textContent = recipients.length;
        recipientsSection.style.display = 'block';
        
        // Display variables summary
        displayVariablesSummary(recipients);
        
        // Get all unique variable names
        const allVariables = new Set();
        recipients.forEach(recipient => {
            if (recipient.variables) {
                Object.keys(recipient.variables).forEach(varName => {
                    allVariables.add(varName);
                });
            }
        });
        const variableNames = Array.from(allVariables).sort();
        
        // Update table header with variable columns
        tableHead.innerHTML = `
            <th>Email</th>
            <th>Subject</th>
            <th>Body Preview</th>
            <th>Attachment</th>
            ${variableNames.map(varName => `<th>${varName}</th>`).join('')}
            <th>Actions</th>
        `;
        
        // Clear table body completely to free memory
        while (tableBody.firstChild) {
            tableBody.removeChild(tableBody.firstChild);
        }
        
        // Calculate pagination
        const totalPages = Math.ceil(recipients.length / recipientsPerPage);
        const startIndex = (currentPage - 1) * recipientsPerPage;
        const endIndex = Math.min(startIndex + recipientsPerPage, recipients.length);
        
        // Display current page recipients
        for (let i = startIndex; i < endIndex; i++) {
            const recipient = recipients[i];
            const row = document.createElement('tr');
            row.dataset.index = i;
            row.classList.add('recipient-row');
            
            if (editingRowIndex === i) {
                // Editable mode
                const variableCells = variableNames.map(varName => {
                    const value = recipient.variables[varName] || '';
                    return `<td><input type="text" class="variable-input" data-variable="${varName}" value="${escapeHtml(value)}" /></td>`;
                }).join('');
                
                row.innerHTML = `
                    <td><input type="email" class="email-input" value="${escapeHtml(recipient.email)}" /></td>
                    <td><input type="text" class="subject-input" value="${escapeHtml(recipient.subject || '')}" /></td>
                    <td><textarea class="body-input" rows="2">${escapeHtml(recipient.body || '')}</textarea></td>
                    <td><input type="text" class="attachment-input" value="${escapeHtml(recipient.attachmentFile || '')}" /></td>
                    ${variableCells}
                    <td>
                        <button class="btn btn-small btn-secondary" onclick="saveRowEdit(${i})">
                            <i class="fas fa-save"></i> Save
                        </button>
                        <button class="btn btn-small btn-secondary" onclick="cancelRowEdit()">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                        <button class="btn btn-small btn-danger" onclick="deleteRecipient(${i})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                row.classList.add('editing');
            } else {
                // View mode
                const variableCells = variableNames.map(varName => {
                    const value = recipient.variables[varName] || '';
                    return `<td class="view-cell">${escapeHtml(value)}</td>`;
                }).join('');
                
                const bodyPreview = (recipient.body || '').length > 50 
                    ? (recipient.body || '').substring(0, 50) + '...' 
                    : (recipient.body || '');
                
                row.innerHTML = `
                    <td class="view-cell">${escapeHtml(recipient.email)}</td>
                    <td class="view-cell">${escapeHtml(recipient.subject || '')}</td>
                    <td class="view-cell body-preview">${escapeHtml(bodyPreview)}</td>
                    <td class="view-cell">${escapeHtml(recipient.attachmentFile || '')}</td>
                    ${variableCells}
                    <td>
                        <button class="btn btn-small btn-secondary" onclick="editRow(${i})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-small btn-danger" onclick="deleteRecipient(${i})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                
                // Add click handler for row editing with tracked cleanup
                const clickHandler = (e) => {
                    if (!e.target.closest('button')) {
                        editRow(i);
                    }
                };
                addTrackedEventListener(row, 'click', clickHandler);
                row.style.cursor = 'pointer';
            }
            
            tableBody.appendChild(row);
        }
        
        // Add pagination controls
        if (recipients.length > recipientsPerPage) {
            const paginationRow = document.createElement('tr');
            const colCount = 5 + variableNames.length;
            paginationRow.innerHTML = `
                <td colspan="${colCount}" class="pagination-cell">
                    <div class="pagination-info">
                        Showing ${startIndex + 1}-${endIndex} of ${recipients.length} recipients
                    </div>
                    <div class="pagination-controls">
                        <button class="btn btn-small btn-secondary" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-left"></i> Previous
                        </button>
                        <span class="page-info">Page ${currentPage} of ${totalPages}</span>
                        <button class="btn btn-small btn-secondary" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>
                            Next <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(paginationRow);
        }
        
        // Add event listeners for real-time updates
        addEditingEventListeners();
        
    } catch (error) {
        console.error('Error displaying recipients:', error);
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add event listeners for editing
function addEditingEventListeners() {
    const inputs = document.querySelectorAll('#recipientsTable input, #recipientsTable textarea');
    
    inputs.forEach(input => {
        input.addEventListener('input', debounce(function() {
            const row = this.closest('tr');
            if (row && row.dataset.index !== undefined) {
                updateRecipientFromRow(parseInt(row.dataset.index));
            }
        }, 500));
    });
}

// Update recipient data from table row
function updateRecipientFromRow(index) {
    try {
        if (index >= currentRecipients.length) return;
        
        const row = document.querySelector(`tr[data-index="${index}"]`);
        if (!row) return;
        
        const recipient = currentRecipients[index];
        
        // Update basic fields
        recipient.email = row.querySelector('.email-input').value;
        recipient.subject = row.querySelector('.subject-input').value;
        recipient.body = row.querySelector('.body-input').value;
        recipient.attachmentFile = row.querySelector('.attachment-input').value;
        
        // Update variables
        const variableInputs = row.querySelectorAll('.variable-input');
        recipient.variables = {};
        variableInputs.forEach(input => {
            const varName = input.dataset.variable;
            const value = input.value;
            if (value) {
                recipient.variables[varName] = value;
            }
        });
        
        // Don't apply variable replacements during editing - only during sending
        
        // Update preview if this is the first recipient
        if (index === 0) {
            updatePreview();
        }
        
        console.log(`Updated recipient ${index}:`, recipient);
        
    } catch (error) {
        console.error('Error updating recipient:', error);
    }
}

// Apply variable replacements to subject and body
function applyVariableReplacements(recipient) {
    Object.entries(recipient.variables).forEach(([key, value]) => {
        const varPattern = new RegExp(`\\|\\*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\|`, 'g');
        if (recipient.subject) {
            recipient.subject = recipient.subject.replace(varPattern, value);
        }
        if (recipient.body) {
            recipient.body = recipient.body.replace(varPattern, value);
        }
    });
}

// Update specific recipient (called by Update button)
function updateRecipient(index) {
    updateRecipientFromRow(index);
    showNotification(`Recipient ${index + 1} updated`, 'success');
}

// Delete recipient (called by Delete button)
function deleteRecipient(index) {
    if (confirm('Are you sure you want to delete this recipient?')) {
        currentRecipients.splice(index, 1);
        
        // Cancel editing if we're deleting the edited row
        if (editingRowIndex === index) {
            editingRowIndex = -1;
        } else if (editingRowIndex > index) {
            editingRowIndex--;
        }
        
        // Adjust current page if needed
        const totalPages = Math.ceil(currentRecipients.length / recipientsPerPage);
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
        } else if (currentRecipients.length === 0) {
            currentPage = 1;
        }
        
        displayRecipients(currentRecipients);
        updatePreview();
        updateSummary();
        showNotification('Recipient deleted', 'info');
    }
}

// Add new recipient
function addNewRecipient() {
    if (currentRecipients.length === 0) {
        showNotification('Please upload a CSV file first to establish the structure', 'error');
        return;
    }
    
    // Create a new recipient with the same structure as existing ones
    const firstRecipient = currentRecipients[0];
    const newRecipient = {
        email: '',
        subject: firstRecipient.subject || '',
        body: firstRecipient.body || '',
        attachmentFile: '',
        variables: {}
    };
    
    // Initialize variables with empty values
    Object.keys(firstRecipient.variables).forEach(varName => {
        newRecipient.variables[varName] = '';
    });
    
    currentRecipients.push(newRecipient);
    
    // Go to the last page to show the new recipient
    const totalPages = Math.ceil(currentRecipients.length / recipientsPerPage);
    currentPage = totalPages;
    
    displayRecipients(currentRecipients);
    updateSummary();
    showNotification('New recipient added', 'success');
    
    // Scroll to the new row
    setTimeout(() => {
        const table = document.getElementById('recipientsTable');
        if (table) {
            table.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, 100);
}

// Edit row function
function editRow(index) {
    // Cancel any existing edit
    cancelRowEdit();
    
    editingRowIndex = index;
    displayRecipients(currentRecipients);
}

// Save row edit function
function saveRowEdit(index) {
    updateRecipientFromRow(index);
    editingRowIndex = -1;
    displayRecipients(currentRecipients);
    updatePreview();
    updateSummary();
    showNotification(`Recipient ${index + 1} updated`, 'success');
}

// Cancel row edit function
function cancelRowEdit() {
    editingRowIndex = -1;
    displayRecipients(currentRecipients);
}

// Setup drag and drop functionality
function setupDragAndDrop(uploadArea) {
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, safeEventHandler((e) => {
            uploadArea.classList.add('dragover');
            e.preventDefault();
            e.stopPropagation();
        }));
    });

    ['dragleave'].forEach(eventName => {
        uploadArea.addEventListener(eventName, safeEventHandler((e) => {
            // Only remove dragover if we're actually leaving the upload area
            if (!uploadArea.contains(e.relatedTarget)) {
                uploadArea.classList.remove('dragover');
            }
        }));
    });

    // Handle file drop
    uploadArea.addEventListener('drop', safeEventHandler((e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
        
        // Handle the dropped files
        if (e.dataTransfer.files.length > 0) {
            handleDroppedFile(e.dataTransfer.files[0]);
        }
    }));
    
    // Also make the upload area clickable (but not the button inside it)
    uploadArea.addEventListener('click', safeEventHandler((e) => {
        if (!e.target.closest('button')) {
            selectFile();
        }
    }));
}

// Clean up memory for large datasets
function cleanupMemory() {
    // Force garbage collection if available
    if (global.gc) {
        global.gc();
    }
    
    // Clear any large objects that are no longer needed
    if (currentRecipients.length > 1000) {
        console.log('Large dataset detected, cleaning up memory');
    }
}

// Handle dropped file
async function handleDroppedFile(file) {
    try {
        if (!file) {
            return;
        }
        
        // Check file type
        const fileName = file.name.toLowerCase();
        const validExtensions = ['.csv', '.xlsx', '.xls'];
        const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));
        
        if (!isValidFile) {
            showNotification('Please drop a CSV or Excel file (.csv, .xlsx, .xls)', 'error');
            return;
        }
        
        // Clean up previous data before loading new file
        if (currentRecipients.length > 0) {
            clearEventListeners();
            currentRecipients.length = 0; // Clear array efficiently
            cleanupMemory();
        }
        
        showNotification('Processing file...', 'info');
        
        if (fileName.endsWith('.csv')) {
            // Handle CSV file
            const text = await file.text();
            const base64Content = btoa(text);
            
            const result = {
                success: true,
                filePath: file.name,
                fileName: file.name,
                fileType: 'csv',
                fileContent: base64Content
            };
            
            await processFile(result);
        } else {
            // Handle Excel files by sending to main process
            showNotification('Processing Excel file...', 'info');
            
            const arrayBuffer = await file.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            
            if (typeof require !== 'undefined') {
                const { ipcRenderer } = require('electron');
                
                try {
                    const result = await ipcRenderer.invoke('process-dropped-excel', buffer, file.name);
                    
                    if (result.success) {
                        // Create a mock file result similar to the file dialog
                        const mockResult = {
                            success: true,
                            filePath: file.name,
                            fileName: file.name,
                            fileType: 'excel',
                            parsedData: result.data
                        };
                        
                        await processFile(mockResult);
                    } else {
                        showNotification('Error processing Excel file: ' + result.error, 'error');
                    }
                } catch (error) {
                    console.error('Excel processing error:', error);
                    showNotification('Error processing Excel file: ' + error.message, 'error');
                }
            } else {
                showNotification('Excel processing not available', 'error');
            }
        }
        
    } catch (error) {
        console.error('File drop error:', error);
        showNotification('Error processing dropped file: ' + error.message, 'error');
    }
}

// Change page function
function changePage(direction) {
    // Cancel any editing when changing pages
    cancelRowEdit();
    
    const totalPages = Math.ceil(currentRecipients.length / recipientsPerPage);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayRecipients(currentRecipients);
        
        // Scroll to top of table
        const table = document.getElementById('recipientsTable');
        if (table) {
            table.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// Save all changes
function saveAllChanges() {
    // Update all recipients from their current table rows
    const rows = document.querySelectorAll('#recipientsTable tbody tr[data-index]');
    
    rows.forEach(row => {
        const index = parseInt(row.dataset.index);
        updateRecipientFromRow(index);
    });
    
    updatePreview();
    updateSummary();
    displayVariablesSummary(currentRecipients);
    showNotification(`Saved changes for ${currentRecipients.length} recipients`, 'success');
}

// Display variables summary
function displayVariablesSummary(recipients) {
    const variablesSummary = document.getElementById('variablesSummary');
    const variablesList = document.getElementById('variablesList');
    
    if (!variablesSummary || !variablesList) return;
    
    // Collect all unique variables and their sample values
    const variablesMap = new Map();
    
    recipients.forEach(recipient => {
        Object.entries(recipient.variables).forEach(([key, value]) => {
            if (!variablesMap.has(key)) {
                variablesMap.set(key, new Set());
            }
            variablesMap.get(key).add(value);
        });
    });
    
    if (variablesMap.size === 0) {
        variablesSummary.style.display = 'none';
        return;
    }
    
    // Show variables summary
    variablesSummary.style.display = 'block';
    
    // Create variable tags
    const variableTags = Array.from(variablesMap.entries()).map(([varName, valuesSet]) => {
        const values = Array.from(valuesSet);
        const sampleValues = values.slice(0, 3); // Show first 3 unique values
        
        return `
            <div class="variable-tag">
                <span class="variable-name">${varName}</span>
                <span>(${values.length} unique value${values.length !== 1 ? 's' : ''})</span>
            </div>
        `;
    }).join('');
    
    const samplesHtml = Array.from(variablesMap.entries()).map(([varName, valuesSet]) => {
        const values = Array.from(valuesSet);
        const sampleValues = values.slice(0, 3);
        const moreCount = values.length - 3;
        
        return `
            <span class="variable-sample">
                <strong>${varName}:</strong> ${sampleValues.join(', ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''}
            </span>
        `;
    }).join('');
    
    variablesList.innerHTML = `
        <div>${variableTags}</div>
        <div class="variable-samples">
            <strong>Sample values:</strong> ${samplesHtml}
        </div>
    `;
}

// Update preview with variable resolution
function updatePreview() {
    try {
        const previewArea = document.getElementById('previewArea');
        if (!previewArea) return;
        
        if (currentRecipients.length === 0) {
            previewArea.innerHTML = '<div class="no-preview">Email preview will appear here after uploading campaign emails...</div>';
            return;
        }
        
        // Create a copy of the first recipient to avoid modifying the original
        const first = currentRecipients[0];
        const previewRecipient = {
            email: first.email,
            subject: first.subject || '',
            body: first.body || '',
            variables: first.variables || {}
        };
        
        // Apply variable replacements to the preview copy
        if (previewRecipient.variables) {
            Object.entries(previewRecipient.variables).forEach(([key, value]) => {
                const varPattern = new RegExp(`\\|\\*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\|`, 'g');
                if (previewRecipient.subject) {
                    previewRecipient.subject = previewRecipient.subject.replace(varPattern, value);
                }
                if (previewRecipient.body) {
                    previewRecipient.body = previewRecipient.body.replace(varPattern, value);
                }
            });
        }
        
        // Display the preview with resolved variables
        const resolvedSubject = previewRecipient.subject || 'No subject';
        const resolvedBody = previewRecipient.body || 'No content';
        const bodyPreview = resolvedBody.length > 200 ? resolvedBody.substring(0, 200) + '...' : resolvedBody;
        
        previewArea.innerHTML = `
            <div class="email-preview">
                <div class="preview-header">
                    <div class="preview-label">Subject</div>
                    <div>${escapeHtml(resolvedSubject)}</div>
                </div>
                <div class="preview-header">
                    <div class="preview-label">To</div>
                    <div>${escapeHtml(previewRecipient.email)}</div>
                </div>
                <div class="preview-header">
                    <div class="preview-label">Body Preview</div>
                    <div class="preview-content">${escapeHtml(bodyPreview)}</div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error updating preview:', error);
    }
}

// Helper function to escape HTML for security
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update summary
function updateSummary() {
    try {
        const elements = {
            totalRecipients: document.getElementById('totalRecipients'),
            summaryFormat: document.getElementById('summaryFormat'),
            summaryRate: document.getElementById('summaryRate'),
            estimatedTime: document.getElementById('estimatedTime'),
            emailFormat: document.getElementById('emailFormat'),
            sendRateLimit: document.getElementById('sendRateLimit')
        };
        
        const total = currentRecipients.length;
        const format = elements.emailFormat ? elements.emailFormat.value : 'HTML';
        const rate = elements.sendRateLimit ? parseInt(elements.sendRateLimit.value) || 30 : 30;
        
        if (elements.totalRecipients) elements.totalRecipients.textContent = total;
        if (elements.summaryFormat) elements.summaryFormat.textContent = format;
        if (elements.summaryRate) elements.summaryRate.textContent = rate;
        if (elements.estimatedTime) elements.estimatedTime.textContent = Math.ceil(total / rate);
    } catch (error) {
        console.error('Error updating summary:', error);
    }
}

// Load attachment folder on startup
async function loadAttachmentFolder() {
    try {
        const result = await ipcRenderer.invoke('load-attachment-folder');
        
        if (result.success && result.folderPath) {
            attachmentFolderPath = result.folderPath;
            const input = document.getElementById('attachmentFolder');
            if (input) {
                input.value = attachmentFolderPath;
            }
            console.log('Loaded attachment folder:', attachmentFolderPath);
        }
    } catch (error) {
        console.error('Error loading attachment folder:', error);
    }
}

// Attachment folder selection
async function selectAttachmentFolder() {
    try {
        const result = await ipcRenderer.invoke('select-folder-dialog');
        
        if (result.success && !result.canceled) {
            attachmentFolderPath = result.folderPath;
            const input = document.getElementById('attachmentFolder');
            if (input) input.value = attachmentFolderPath;
            
            // Save the attachment folder path for persistence
            try {
                await ipcRenderer.invoke('save-attachment-folder', attachmentFolderPath);
                showNotification('Attachment folder selected and saved!', 'success');
            } catch (saveError) {
                console.error('Error saving attachment folder:', saveError);
                showNotification('Attachment folder selected but could not be saved!', 'error');
            }
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        showNotification('Error selecting folder', 'error');
    }
}

// Load campaign settings on startup
async function loadCampaignSettings() {
    try {
        const result = await ipcRenderer.invoke('load-campaign-settings');
        
        if (result.success && result.settings) {
            const settings = result.settings;
            
            // Load send rate limit
            if (settings.sendRateLimit) {
                const sendRateInput = document.getElementById('sendRateLimit');
                if (sendRateInput) {
                    sendRateInput.value = settings.sendRateLimit;
                }
            }
            
            // Load email format
            if (settings.emailFormat) {
                const emailFormatSelect = document.getElementById('emailFormat');
                if (emailFormatSelect) {
                    emailFormatSelect.value = settings.emailFormat;
                }
            }
            
            // Load priority
            if (settings.priority) {
                const prioritySelect = document.getElementById('priority');
                if (prioritySelect) {
                    prioritySelect.value = settings.priority;
                }
            }
            
            console.log('Loaded campaign settings:', settings);
        }
    } catch (error) {
        console.error('Error loading campaign settings:', error);
    }
}

// Save campaign settings
async function saveCampaignSettings() {
    try {
        const sendRateInput = document.getElementById('sendRateLimit');
        const emailFormatSelect = document.getElementById('emailFormat');
        const prioritySelect = document.getElementById('priority');
        
        const settings = {
            sendRateLimit: sendRateInput ? parseInt(sendRateInput.value) : 30,
            emailFormat: emailFormatSelect ? emailFormatSelect.value : 'HTML',
            priority: prioritySelect ? prioritySelect.value : 'Normal'
        };
        
        const result = await ipcRenderer.invoke('save-campaign-settings', settings);
        
        if (result.success) {
            console.log('Campaign settings saved:', settings);
        } else {
            console.error('Failed to save campaign settings');
        }
    } catch (error) {
        console.error('Error saving campaign settings:', error);
    }
}

// Send test email
async function sendTestEmail() {
    try {
        const testEmail = document.getElementById('testEmail');
        if (!testEmail || !testEmail.value) {
            showNotification('Please enter a test email address', 'error');
            return;
        }
        
        if (currentRecipients.length === 0) {
            showNotification('Please upload recipients first', 'error');
            return;
        }
        
        const smtpSettings = {
            host: document.getElementById('smtpHost').value,
            port: parseInt(document.getElementById('smtpPort').value) || 587,
            secure: document.getElementById('smtpSecure').checked,
            username: document.getElementById('smtpUsername').value,
            password: document.getElementById('smtpPassword').value,
            fromEmail: document.getElementById('fromEmail').value,
            fromName: document.getElementById('fromName').value
        };
        
        if (!smtpSettings.host || !smtpSettings.username || !smtpSettings.password || !smtpSettings.fromEmail) {
            showNotification('Please configure SMTP settings first', 'error');
            return;
        }
        
        // Use the first recipient as template
        const firstRecipient = currentRecipients[0];
        
        showNotification('Sending test email with campaign content...', 'info');
        
        const result = await ipcRenderer.invoke('send-test-email', smtpSettings, testEmail.value, firstRecipient);
        
        if (result.success) {
            showNotification('Test email sent successfully!', 'success');
        } else {
            showNotification(`Test email failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Test email error:', error);
        showNotification('Error sending test email', 'error');
    }
}

// Start campaign
async function startCampaign() {
    try {
        if (currentRecipients.length === 0) {
            showNotification('Please upload recipients first', 'error');
            return;
        }
        
        const smtpSettings = {
            host: document.getElementById('smtpHost').value,
            port: parseInt(document.getElementById('smtpPort').value) || 587,
            secure: document.getElementById('smtpSecure').checked,
            username: document.getElementById('smtpUsername').value,
            password: document.getElementById('smtpPassword').value,
            fromEmail: document.getElementById('fromEmail').value,
            fromName: document.getElementById('fromName').value
        };
        
        if (!smtpSettings.host || !smtpSettings.username || !smtpSettings.password || !smtpSettings.fromEmail) {
            showNotification('Please configure SMTP settings first', 'error');
            return;
        }
        
        const attachmentFolder = document.getElementById('attachmentFolder').value;
        
        showNotification('Starting email campaign...', 'info');
        
        const result = await ipcRenderer.invoke('send-campaign-emails', 
            { format: 'HTML' }, 
            currentRecipients, 
            smtpSettings, 
            attachmentFolder
        );
        
        if (result.success) {
            // Progress listener will handle the completion notification
            loadRecentCampaigns();
            loadCampaignHistory();
        } else {
            showNotification(`Campaign failed: ${result.error}`, 'error');
            hideCampaignProgress();
        }
    } catch (error) {
        console.error('Campaign error:', error);
        showNotification('Error running campaign', 'error');
        hideCampaignProgress();
    }
}

// SMTP Settings
async function saveSmtpSettings() {
    try {
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
            showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        const result = await ipcRenderer.invoke('save-smtp-settings', settings);
        
        if (result.success) {
            currentSmtpSettings = settings;
            showNotification('SMTP settings saved!', 'success');
            updateSmtpButtonStates();
        } else {
            showNotification('Failed to save settings', 'error');
        }
    } catch (error) {
        console.error('Error saving SMTP:', error);
        showNotification('Error saving settings', 'error');
    }
}

async function loadSmtpSettings() {
    try {
        const result = await ipcRenderer.invoke('load-smtp-settings');
        
        if (result.success && result.data) {
            const settings = result.data;
            currentSmtpSettings = settings;
            
            console.log('Loading SMTP settings:', settings);
            
            // Safely set values with null checks
            const setElementValue = (id, value, type = 'value') => {
                const element = document.getElementById(id);
                if (element) {
                    if (type === 'checked') {
                        element.checked = value || false;
                    } else {
                        element.value = value || '';
                    }
                }
            };
            
            setElementValue('smtpHost', settings.host);
            setElementValue('smtpPort', settings.port || 587);
            setElementValue('smtpSecure', settings.secure, 'checked');
            setElementValue('smtpUsername', settings.username);
            setElementValue('smtpPassword', settings.password);
            setElementValue('fromEmail', settings.fromEmail);
            setElementValue('fromName', settings.fromName || 'MailCraft');
            
            updateSmtpButtonStates();
            showNotification('SMTP settings loaded', 'info');
        } else {
            console.log('No saved SMTP settings found');
        }
    } catch (error) {
        console.error('Error loading SMTP settings:', error);
        showNotification('Error loading SMTP settings', 'error');
    }
}

function updateSmtpButtonStates() {
    try {
        const host = document.getElementById('smtpHost');
        const username = document.getElementById('smtpUsername');
        const testBtn = document.getElementById('testSmtpBtn');
        const warning = document.getElementById('smtpWarning');
        
        if (testBtn && host && username) {
            testBtn.disabled = !(host.value && username.value);
        }
        
        if (warning && host && username) {
            warning.style.display = (host.value && username.value) ? 'none' : 'block';
        }
    } catch (error) {
        console.error('Error updating SMTP button states:', error);
    }
}

async function testSmtpConnection() {
    try {
        const testEmail = document.getElementById('testSmtpEmail');
        if (!testEmail || !testEmail.value) {
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
        
        if (!settings.host || !settings.username || !settings.password || !settings.fromEmail) {
            showNotification('Please fill in all SMTP settings first', 'error');
            return;
        }
        
        showNotification('Testing SMTP connection...', 'info');
        
        const result = await ipcRenderer.invoke('test-smtp-connection', settings, testEmail.value);
        
        if (result.success) {
            showNotification('SMTP test email sent successfully!', 'success');
        } else {
            showNotification(`SMTP test failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('SMTP test error:', error);
        showNotification('Error testing SMTP connection', 'error');
    }
}

// Notification
function showNotification(message, type = 'info') {
    try {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 5000);
    } catch (error) {
        console.error('Error showing notification:', error);
    }
}

// History Tab Functions

async function loadCampaignHistory() {
    try {
        const result = await ipcRenderer.invoke('load-campaign-history');
        
        if (result.success) {
            displayCampaignHistory(result.data);
        } else {
            console.error('Error loading campaign history:', result.error);
        }
    } catch (error) {
        console.error('Error loading campaign history:', error);
    }
}

function displayCampaignHistory(campaigns) {
    const historyContainer = document.getElementById('campaignHistory');
    
    if (!campaigns || campaigns.length === 0) {
        historyContainer.innerHTML = `
            <div class="no-campaigns">
                <i class="fas fa-inbox"></i>
                <p>No campaigns executed yet</p>
                <p>Start by uploading recipients and running your first campaign</p>
            </div>
        `;
        return;
    }
    
    historyContainer.innerHTML = campaigns.map(campaign => {
        const date = new Date(campaign.date);
        const formattedDate = date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
        
        return `
            <div class="campaign-item">
                <div class="campaign-header">
                    <div class="campaign-title">
                        <i class="fas fa-envelope"></i>
                        Campaign ${date.toLocaleDateString()}
                    </div>
                    <div class="campaign-status ${campaign.status}">
                        ${campaign.status === 'success' ? 'Success' : 
                          campaign.status === 'error' ? 'Error' : 'Partial'}
                    </div>
                </div>
                <div class="campaign-details">
                    <div class="campaign-stat">
                        <div class="campaign-stat-value">${campaign.sentCount}</div>
                        <div class="campaign-stat-label">Sent</div>
                    </div>
                    <div class="campaign-stat">
                        <div class="campaign-stat-value">${campaign.totalRecipients}</div>
                        <div class="campaign-stat-label">Total</div>
                    </div>
                    <div class="campaign-stat">
                        <div class="campaign-stat-value">${campaign.deliveryRate}%</div>
                        <div class="campaign-stat-label">Delivery Rate</div>
                    </div>
                    <div class="campaign-stat">
                        <div class="campaign-stat-value">${campaign.failedCount}</div>
                        <div class="campaign-stat-label">Failed</div>
                    </div>
                    <div class="campaign-stat">
                        <div class="campaign-stat-value">${formattedDate}</div>
                        <div class="campaign-stat-label">Executed</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Campaign Progress Functions
function setupProgressListener() {
    if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        
        ipcRenderer.on('campaign-progress', (event, progress) => {
            updateCampaignProgress(progress);
        });
    }
}

function showCampaignProgress() {
    const progressDiv = document.getElementById('campaignProgress');
    if (progressDiv) {
        progressDiv.style.display = 'block';
    }
}

function hideCampaignProgress() {
    const progressDiv = document.getElementById('campaignProgress');
    if (progressDiv) {
        progressDiv.style.display = 'none';
    }
}

function updateCampaignProgress(progress) {
    try {
        const progressDiv = document.getElementById('campaignProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const progressCount = document.getElementById('progressCount');
    
    if (!progressDiv) return;
    
    // Show progress section
    showCampaignProgress();
    
    // Update progress bar
    const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
    
    // Update text
    if (progressText) {
        let statusText = '';
        switch (progress.status) {
            case 'starting':
                statusText = 'Preparing to send emails...';
                break;
            case 'sending':
                statusText = progress.currentEmail ? `Sending to ${progress.currentEmail}` : 'Sending emails...';
                break;
            case 'completed':
                statusText = `Campaign completed! Sent: ${progress.sent}, Failed: ${progress.failed}`;
                showNotification(`Campaign completed! Sent: ${progress.sent}, Failed: ${progress.failed}`, 'success');
                // Hide progress after 3 seconds
                setTimeout(hideCampaignProgress, 3000);
                break;
        }
        progressText.textContent = statusText;
    }
    
    // Update count
    if (progressCount) {
        progressCount.textContent = `${progress.current} / ${progress.total}`;
    }
    
    // Add current campaign to recent campaigns if completed
    if (progress.status === 'completed') {
        const now = new Date();
        addRecentCampaign({
            id: now.getTime().toString(),
            date: now.toISOString(),
            totalRecipients: progress.total,
            sentCount: progress.sent,
            failedCount: progress.failed,
            deliveryRate: ((progress.sent / progress.total) * 100).toFixed(1),
            status: progress.failed === 0 ? 'success' : progress.sent === 0 ? 'error' : 'partial'
        });
    }
    } catch (error) {
        console.error('Campaign progress update error:', error);
    }
}

// Recent Campaigns Functions
async function loadRecentCampaigns() {
    try {
        const result = await ipcRenderer.invoke('load-campaign-history');
        
        if (result.success && result.data && result.data.length > 0) {
            allCampaigns = result.data; // Store all campaigns
            currentCampaignPage = 1; // Reset to first page
            console.log(`Loaded ${allCampaigns.length} campaigns for display`);
            displayRecentCampaigns(); // Show paginated campaigns
        } else {
            console.log('No campaigns found or failed to load');
            allCampaigns = [];
            displayRecentCampaigns();
        }
    } catch (error) {
        console.error('Error loading recent campaigns:', error);
        allCampaigns = [];
        displayRecentCampaigns();
    }
}

function displayRecentCampaigns() {
    const recentCampaignsCard = document.getElementById('recentCampaignsCard');
    const recentCampaignsList = document.getElementById('recentCampaignsList');
    
    console.log(`displayRecentCampaigns called with ${allCampaigns ? allCampaigns.length : 0} campaigns`);
    
    if (!allCampaigns || allCampaigns.length === 0) {
        console.log('No campaigns to display');
        if (recentCampaignsCard) {
            recentCampaignsCard.style.display = 'none';
        }
        return;
    }
    
    // Show the card
    if (recentCampaignsCard) {
        recentCampaignsCard.style.display = 'block';
        console.log('Campaign card displayed');
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(allCampaigns.length / campaignsPerPage);
    const startIndex = (currentCampaignPage - 1) * campaignsPerPage;
    const endIndex = startIndex + campaignsPerPage;
    const campaignsToShow = allCampaigns.slice(startIndex, endIndex);
    
    if (recentCampaignsList) {
        // Create campaigns list
        const campaignsHtml = campaignsToShow.map(campaign => {
            const date = new Date(campaign.date);
            const timeAgo = getTimeAgo(date);
            
            return `
                <div class="recent-campaign-item clickable" onclick="showCampaignReport('${campaign.id}')">
                    <div class="recent-campaign-info">
                        <div class="recent-campaign-title">Campaign ${date.toLocaleDateString()}</div>
                        <div class="recent-campaign-details">${timeAgo}</div>
                    </div>
                    <div class="recent-campaign-stats">
                        <div class="recent-campaign-stat">
                            <div class="recent-campaign-stat-value">${campaign.sentCount}</div>
                            <div class="recent-campaign-stat-label">Sent</div>
                        </div>
                        <div class="recent-campaign-stat">
                            <div class="recent-campaign-stat-value">${campaign.totalRecipients}</div>
                            <div class="recent-campaign-stat-label">Total</div>
                        </div>
                        <div class="recent-campaign-stat">
                            <div class="recent-campaign-stat-value">${campaign.deliveryRate}%</div>
                            <div class="recent-campaign-stat-label">Rate</div>
                        </div>
                        <div class="recent-status ${campaign.status}">
                            ${campaign.status === 'success' ? 'Success' : 
                              campaign.status === 'error' ? 'Error' : 'Partial'}
                        </div>
                    </div>
                    <div class="view-report-hint">
                        <i class="fas fa-external-link-alt"></i> Click to view report
                    </div>
                </div>
            `;
        }).join('');
        
        // Create pagination controls (always show if campaigns exist)
        const paginationHtml = allCampaigns.length > 0 ? `
            <div class="campaign-pagination">
                <div class="pagination-info">
                    Showing ${startIndex + 1}-${Math.min(endIndex, allCampaigns.length)} of ${allCampaigns.length} campaigns
                </div>
                ${totalPages > 1 ? `
                <div class="pagination-controls">
                    <button class="btn btn-secondary" onclick="changeCampaignPage(-1)" ${currentCampaignPage === 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i> Previous
                    </button>
                    <span class="page-info">Page ${currentCampaignPage} of ${totalPages}</span>
                    <button class="btn btn-secondary" onclick="changeCampaignPage(1)" ${currentCampaignPage === totalPages ? 'disabled' : ''}>
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                ` : `
                <div class="pagination-controls">
                    <span class="page-info">Page 1 of 1</span>
                </div>
                `}
            </div>
        ` : '';
        
        recentCampaignsList.innerHTML = campaignsHtml + paginationHtml;
        console.log(`Campaign list updated with ${campaignsToShow.length} campaigns and pagination: ${totalPages} pages`);
    }
}

// Change campaign page function
function changeCampaignPage(direction) {
    const totalPages = Math.ceil(allCampaigns.length / campaignsPerPage);
    const newPage = currentCampaignPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentCampaignPage = newPage;
        displayRecentCampaigns();
        
        // Scroll to top of campaigns list
        const campaignsCard = document.getElementById('recentCampaignsCard');
        if (campaignsCard) {
            campaignsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

function addRecentCampaign(campaign) {
    // This will be called when a campaign completes
    // Reload the recent campaigns to include the new one
    setTimeout(() => {
        loadRecentCampaigns();
    }, 1000);
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}

// Campaign Report Functions
async function showCampaignReport(campaignId) {
    try {
        const result = await ipcRenderer.invoke('get-campaign-details', campaignId);
        
        if (!result.success) {
            showNotification('Failed to load campaign details', 'error');
            return;
        }
        
        const campaign = result.data;
        displayCampaignReport(campaign);
        
    } catch (error) {
        console.error('Error loading campaign report:', error);
        showNotification('Error loading campaign report', 'error');
    }
}

function displayCampaignReport(campaign) {
    const modal = document.getElementById('campaignReportModal');
    const reportTitle = document.getElementById('reportTitle');
    const reportSummary = document.getElementById('reportSummary');
    const reportResults = document.getElementById('reportResults');
    
    // Set title
    const date = new Date(campaign.date);
    reportTitle.textContent = `Campaign Report - ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    
    // Set summary
    reportSummary.innerHTML = `
        <div class="report-stat">
            <div class="report-stat-value">${campaign.totalRecipients}</div>
            <div class="report-stat-label">Total Recipients</div>
        </div>
        <div class="report-stat">
            <div class="report-stat-value">${campaign.sentCount}</div>
            <div class="report-stat-label">Successfully Sent</div>
        </div>
        <div class="report-stat">
            <div class="report-stat-value">${campaign.failedCount}</div>
            <div class="report-stat-label">Failed</div>
        </div>
        <div class="report-stat">
            <div class="report-stat-value">${campaign.deliveryRate}%</div>
            <div class="report-stat-label">Delivery Rate</div>
        </div>
        <div class="report-stat">
            <div class="report-stat-value">${campaign.duration || 0}</div>
            <div class="report-stat-label">Duration (min)</div>
        </div>
    `;
    
    // Update filter counts
    const emailResults = campaign.emailResults || [];
    const failedResults = emailResults.filter(r => r.status === 'failed');
    const sentResults = emailResults.filter(r => r.status === 'sent');
    
    document.getElementById('countAll').textContent = emailResults.length;
    document.getElementById('countFailed').textContent = failedResults.length;
    document.getElementById('countSent').textContent = sentResults.length;
    
    // Store results globally for filtering
    window.currentReportResults = emailResults;
    
    // Display all results initially
    filterResults('all');
    
    // Show modal
    modal.style.display = 'flex';
}

function filterResults(filterType) {
    const results = window.currentReportResults || [];
    const reportResults = document.getElementById('reportResults');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // Update active filter button
    filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filterType);
    });
    
    // Filter results
    let filteredResults = results;
    if (filterType === 'failed') {
        filteredResults = results.filter(r => r.status === 'failed');
    } else if (filterType === 'sent') {
        filteredResults = results.filter(r => r.status === 'sent');
    }
    
    // Sort: failed first, then by timestamp
    filteredResults.sort((a, b) => {
        if (a.status === 'failed' && b.status !== 'failed') return -1;
        if (a.status !== 'failed' && b.status === 'failed') return 1;
        return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    // Display results
    if (filteredResults.length === 0) {
        reportResults.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>No ${filterType === 'all' ? '' : filterType} emails found</p>
            </div>
        `;
        return;
    }
    
    reportResults.innerHTML = filteredResults.map(result => {
        const time = new Date(result.timestamp);
        const timeStr = time.toLocaleTimeString();
        
        return `
            <div class="result-item ${result.status}">
                <div class="result-info">
                    <div class="result-email">${result.email}</div>
                    <div class="result-subject">${result.subject}</div>
                    ${result.error ? `<div class="result-error">Error: ${result.error}</div>` : ''}
                </div>
                <div class="result-status">
                    <div class="result-badge ${result.status}">${result.status}</div>
                    <div class="result-time">${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
}

function closeCampaignReport() {
    const modal = document.getElementById('campaignReportModal');
    modal.style.display = 'none';
    window.currentReportResults = null;
}